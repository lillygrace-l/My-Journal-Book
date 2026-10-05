import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("upgrade removes journal model caches, preserves unrelated caches, and bypasses Ollama", async () => {
  const handlers = {};
  const removed = [];
  const self = {
    location: { origin: "https://journal.example" },
    registration: { scope: "https://journal.example/" },
    clients: { claim: async () => {} },
    addEventListener: (name, handler) => { handlers[name] = handler; }
  };
  vm.runInNewContext(await readFile(new URL("../sw.js", import.meta.url), "utf8"), {
    self, URL, caches: {
      keys: async () => ["offline-journal-shell-v1", "offline-journal-models-v1", "offline-journal-shell-v2", "offline-journal-shell-v3", "offline-journal-shell-v4", "unrelated"],
      delete: async (key) => { removed.push(key); }
    }
  });
  let activation;
  handlers.activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;
  assert.deepEqual(removed.sort(), ["offline-journal-models-v1", "offline-journal-shell-v1", "offline-journal-shell-v2", "offline-journal-shell-v3", "offline-journal-shell-v4"]);
  handlers.fetch({
    request: { method: "GET", url: "http://localhost:11434/api/tags" },
    respondWith: () => assert.fail("Ollama must bypass the shell cache")
  });
});
