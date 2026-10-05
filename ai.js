/** Local Ollama client. Journal text is sent only to localhost. */
const OLLAMA_BASE_URL = "http://localhost:11434";
const MODEL_KEY = "offline-journal:ollama-model";
let activeModelName = null;
let availableModels = [];

async function request(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}${path}`, { cache: "no-store", ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}. Check that Ollama is running and OLLAMA_ORIGINS allows this site.`);
    return await response.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Ollama took too long to respond. Check the local model and try again.");
    if (err instanceof TypeError) throw new Error("Cannot reach local Ollama. Set OLLAMA_ORIGINS for this site, make sure Ollama is running, then reconnect.");
    throw err;
  } finally { clearTimeout(timer); }
}

export function selectModel(name) {
  if (!availableModels.includes(name)) throw new Error("Select an installed local model.");
  activeModelName = name;
  try { localStorage.setItem(MODEL_KEY, name); } catch (_) {}
  return activeModelName;
}

export async function initAI(onProgress = () => {}) {
  onProgress(10, "Checking local Ollama…");
  const data = await request("/api/tags");
  availableModels = (Array.isArray(data.models) ? data.models : [])
    .filter((model) => !model.remote_host && !model.remote_model && !/(?:[:\-]cloud)(?:$|:)/i.test(model.name || ""))
    .map((model) => model.name).filter((name) => typeof name === "string" && name.length > 0);
  if (!availableModels.length) throw new Error("No local models found. Run ollama pull gemma3:1b on this computer, then reconnect.");
  let preferred = ""; try { preferred = localStorage.getItem(MODEL_KEY) || ""; } catch (_) {}
  activeModelName = availableModels.includes(preferred) ? preferred : availableModels.find((name) => name === "gemma3:1b") || availableModels[0];
  onProgress(100, "Connected to local Ollama");
  return { success: true, modelName: activeModelName, models: [...availableModels] };
}

async function runInference(prompt, options = {}) {
  if (!activeModelName) throw new Error("Connect to Ollama before using AI.");
  const data = await request("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: activeModelName, prompt, stream: false, options: { num_predict: options.numPredict || 512, temperature: options.temperature ?? 0.8 } }) }, 120000);
  if (typeof data.response !== "string" || !data.response.trim()) throw new Error("Ollama returned an empty response. Try again or choose another local model.");
  return data.response;
}

export async function generateReflectionQuestions(entryText) {
  const prompt = `You are a gentle journaling companion. Given this journal entry, return exactly 3 open-ended reflection questions that go deeper into feelings, causes, or needs. One per line, no numbering, no bullet points, no advice, no diagnosis, no judgment.\n\nJournal entry:\n${entryText}\n\nQuestions:`;
  const output = await runInference(prompt, { numPredict: 256, temperature: 0.7 });
  const questions = output.split("\n").map((line) => line.replace(/^[0-9]+[.\-]\s*/, "").replace(/^[*\-]\s*/, "").trim()).filter((line) => line.length > 0 && line.endsWith("?")).slice(0, 3);
  return questions.length >= 3 ? questions : output.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
}

export async function generateIdeaForMood(mood) {
  const prompt = `The writer is feeling ${mood}. Write ONE short, inspiring writing prompt or a tiny mental exercise (maximum 2 sentences). No lists, no preamble, speak directly to the writer.\n\nPrompt:`;
  return (await runInference(prompt, { numPredict: 160, temperature: 0.8 })).trim().replace(/^Prompt:\s*/i, "");
}

function formatSourcePages(entries) {
  return entries.map((entry, index) => {
    const date = new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const text = String(entry.text || "").trim().slice(0, 2600);
    return `PAGE ${index + 1} — ${date}\n${text}`;
  }).join("\n\n---\n\n");
}

export async function generateSelectedPagesReflection(entries) {
  if (!Array.isArray(entries) || entries.length < 2) throw new Error("Choose at least two pages first.");
  const prompt = `You are a gentle private journaling companion. Read the selected journal pages below and connect only ideas grounded in those pages. Return exactly this format with one short paragraph for each section:
THREAD: the main thread connecting the pages
NOTICE: one interesting shift, tension, or repeated idea
QUESTION: one open-ended question the writer may carry forward
Do not diagnose, label, advise, or claim certainty. Do not invent facts. Use careful language such as “I’m noticing” or “one possibility”. Keep each section under 55 words.

SELECTED PAGES:
${formatSourcePages(entries)}

REFLECTION:`;
  return (await runInference(prompt, { numPredict: 420, temperature: 0.65 })).trim();
}

export async function generateJournalObservations(entries) {
  if (!Array.isArray(entries) || entries.length < 3) throw new Error("Keep writing a few more pages before looking for patterns.");
  const prompt = `You are a careful journaling companion. Review these journal pages and identify up to 3 gentle, non-clinical observations that are genuinely supported by the text. Return one observation per line using exactly this format: [1,3] observation text. The numbers must be the page numbers that support that observation. Use only 1–${entries.length}. If fewer than 3 observations are strongly supported, return fewer. No diagnosis, disorder labels, therapy claims, advice, or certainty. Avoid generic observations.

PAGES:
${formatSourcePages(entries)}

OBSERVATIONS:`;
  return (await runInference(prompt, { numPredict: 420, temperature: 0.55 })).trim();
}

export async function generateCarryingReflection(entries) {
  if (!Array.isArray(entries) || entries.length < 3) throw new Error("Keep writing a few more pages before looking for a recurring thread.");
  const prompt = `You are a gentle private journaling companion. Read these journal pages and identify one concern, tension, or feeling the writer may be carrying across more than one page. Return exactly this format:
CARRYING: one short paragraph grounded in the pages
SOURCES: comma-separated page numbers that support it
QUESTION: one gentle open-ended question
Do not diagnose, advise, or claim certainty. Do not invent facts. Use careful language such as “you may be carrying” or “it seems”. Keep each line/section concise.

PAGES:
${formatSourcePages(entries)}

REFLECTION:`;
  return (await runInference(prompt, { numPredict: 360, temperature: 0.6 })).trim();
}

export async function generateReflectionSummary(entryText) {
  const prompt = `You are a gentle journaling companion. Read the journal entry and write one short, compassionate reflection (2-3 sentences) about a possible theme or feeling the writer is exploring. Do not diagnose, advise, or claim certainty. No bullets.\n\nJournal entry:\n${entryText}\n\nReflection:`;
  return (await runInference(prompt, { numPredict: 220, temperature: 0.65 })).trim().replace(/^Reflection:\s*/i, "");
}
