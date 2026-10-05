import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../ai.js", import.meta.url), "utf8");
let version = 0;
async function client(fetchMock, saved = new Map()) {
  globalThis.fetch = fetchMock;
  globalThis.localStorage = {
    getItem: (key) => saved.get(key),
    setItem: (key, value) => saved.set(key, value)
  };
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${version++}`);
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("connects without WebGPU, prefers Gemma and sends non-streaming local requests", async () => {
  const calls = [];
  const ai = await client(async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/tags")
      ? json({ models: [{ name: "other:latest" }, { name: "gemma3:1b" }] })
      : json({ response: "1. What matters?\n2. How do you feel?\n3. What do you need?" });
  });
  assert.equal((await ai.initAI()).modelName, "gemma3:1b");
  assert.equal((await ai.generateReflectionQuestions("Private thoughts")).length, 3);
  ai.selectModel("other:latest");
  await ai.generateIdeaForMood("grateful");
  const body = JSON.parse(calls[2].options.body);
  assert.equal(body.model, "other:latest");
  assert.equal(body.stream, false);
  assert.equal(calls[2].url, "http://localhost:11434/api/generate");
  assert.ok(calls.every(({ options }) => options.cache === "no-store"));
});

test("excludes cloud models and restores an installed selection", async () => {
  const ai = await client(async () => json({ models: [
    { name: "gemma3:1b" }, { name: "other:latest" },
    { name: "remote:cloud" }, { name: "remote-cloud" },
    { name: "remote", remote_host: "https://ollama.com" }
  ] }), new Map([["offline-journal:ollama-model", "other:latest"]]));
  const result = await ai.initAI();
  assert.equal(result.modelName, "other:latest");
  assert.deepEqual(result.models, ["gemma3:1b", "other:latest"]);
  assert.throws(() => ai.selectModel("remote:cloud"), /installed local/);
});

test("reports unavailable server, missing models, HTTP and empty generation errors", async () => {
  let ai = await client(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(ai.initAI(), /OLLAMA_ORIGINS/);
  ai = await client(async () => json({ models: [] }));
  await assert.rejects(ai.initAI(), /ollama pull/);
  await assert.rejects(ai.generateIdeaForMood("bored"), /Connect to Ollama/);
  ai = await client(async () => json({}, 403));
  await assert.rejects(ai.initAI(), /HTTP 403/);
  ai = await client(async (url) => url.endsWith("/tags")
    ? json({ models: [{ name: "gemma3:1b" }] }) : json({ response: "" }));
  await ai.initAI();
  await assert.rejects(ai.generateIdeaForMood("bored"), /empty response/);
});
