# My Journal Book

> **A private journal that stays yours.**
>
> Write freely, revisit old pages, and use local AI to notice connections in your own words — without an account or a cloud database.

My Journal Book is an **offline-first journaling PWA** built for one person. Your journal lives in the browser, while optional AI runs through **Ollama on your own device**.

The project is intentionally small and personal: the journal itself is the product, and AI sits behind the experience rather than replacing it.

## What makes it different

My Journal Book is built around a simple loop:

**WRITE → REFLECT → REVISIT → CONNECT**

Instead of turning journaling into another chatbot, the app helps you return to the pages you already wrote and look at them from a slightly different angle.

## Features

### Writing

- Calm notebook-style writing interface.
- Optional mood and tags on new entries.
- Word count and local/offline status indicators.
- Favorites for pages you want to keep close.
- Edit, delete, print, and view individual entries.

### Ideas

The Ideas page is designed as a set of small writing doors rather than a generic prompt list:

- **Untangle** — for anxious or tangled thoughts.
- **Keep** — for gratitude and small good things.
- **Notice** — for ordinary moments and boredom.
- **Look Back** — for reflection.
- **Curious** — follow something you do not understand yet.
- **Letter** — write to someone who is not here.
- **Heavy** — put something down without needing to solve it.
- **Imagine** — write something that is not true yet.
- **Surprise Me** for a random writing door.
- **How Deep?** for Tiny Thought, Explore, or Go Deeper.
- Curated mini writing missions, sentence fragments, and rotating margin notes.

### Local AI reflection

When Ollama is available, My Journal Book can use your installed local model for:

- Reflection questions for an entry.
- A short compassionate reflection on a page.
- **Read My Pages** — connect multiple selected entries into a grounded reflection.
- **Things I've Noticed** — identify a few non-clinical observations supported by your pages.
- **Something I'm Carrying** — surface a recurring concern or tension across pages.
- **Continue This Thought** — return to an older entry and keep writing from it.
- **Dear Future Me** as a dedicated writing door.

AI responses are deliberately framed as possibilities and observations, not diagnoses or certainty.

### Revisit and explore

- Timeline history.
- Calendar view.
- Search and mood/date filters.
- Favorites view.
- Writing statistics, streaks, word counts, and mood insights.
- A curated **Reflection Library** covering themes such as self-doubt, perfectionism, people-pleasing, comparison, overthinking, anxiety, burnout, setbacks, relationships, academic pressure, and uncertainty.
- Related reflection prompts that bring the user back to writing instead of opening a separate chatbot.

### Data ownership

- Journal entries are stored locally in the browser.
- JSON backup and restore.
- Markdown export.
- Print-friendly entries.
- No account or login.
- No cloud database.
- No analytics or third-party runtime services.

## How the AI works

```text
Your journal page(s)
        ↓
      ai.js
        ↓
 Local Ollama HTTP API
        ↓
 Installed local open-weight model
        ↓
 Reflection / question / observation
        ↓
 Back to the journal
```

The current implementation uses Ollama at:

```text
http://localhost:11434
```

The app discovers locally installed models and prefers `gemma3:1b` when it is available.

There is **no hosted AI backend** in this project. Render hosts the static web application; the optional AI computation remains on the user's own machine.

## Run locally

No frontend build step is required.

### macOS / Linux

```bash
python3 -m http.server 8000
```

### Windows PowerShell

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Using a local HTTP server is recommended because the PWA service worker requires an HTTP(S) origin.

## Enable local AI

Install [Ollama](https://ollama.com/) and pull a small local model:

```bash
ollama pull gemma3:1b
```

For a local development server, allow the app origin in Ollama:

```text
OLLAMA_ORIGINS=http://localhost:8000
OLLAMA_NO_CLOUD=1
```

Restart Ollama after changing its environment configuration.

AI is optional. The journal, history, exports, and other non-AI features continue to work without Ollama.

## Live demo

**Render:** _The live URL will be added after the first successful deployment._

The hosted demo is a static PWA. The interface can be opened normally, but its AI features still require Ollama running locally on the device using the demo. When using the Render URL with local Ollama, add that exact HTTPS origin to `OLLAMA_ORIGINS` as well.

Render can connect directly to the GitHub repository and automatically redeploy the linked branch when new commits are pushed. See the [Render Static Sites documentation](https://render.com/docs/static-sites).

## Deploy to Render

My Journal Book is a static HTML/CSS/JavaScript application, so it should be deployed on Render as a **Static Site**, not as a Web Service.

Recommended flow:

```text
GitHub repository
      ↓
Render Static Site
      ↓
Published static files
      ↓
Live on *.onrender.com
```

Render provides a generated `onrender.com` URL for a static site and can automatically redeploy after pushes to the connected branch. See the [Render deployment documentation](https://render.com/docs/your-first-deploy).

## Privacy model

My Journal Book is designed around local ownership:

- Journal entries and journal-derived statistics stay in browser local storage.
- Journal storage uses the existing `offline-journal:entries` key for compatibility with the original project.
- Local AI requests go to the configured Ollama endpoint on the user's device.
- The project does not add accounts, authentication, a cloud database, analytics, or a hosted AI API.
- The service worker caches the app shell but does not proxy or cache Ollama requests.

For a hosted Render copy, Render serves the static application files; it does not become the journal's storage layer.

## Backup and restore

Use **Settings → Your data** to:

- Export the journal as JSON.
- Export the journal as Markdown.
- Restore a JSON backup.
- Clear the local journal when needed.

JSON restore merges entries by their existing IDs so a backup does not silently replace the entire journal.

## PWA / offline behavior

The service worker caches the lightweight application shell so the interface can start offline after it has been opened successfully once.

Local AI is a separate concern: the model must be installed and running through Ollama on the current device. A network connection is not required for the local AI request itself once Ollama and the app are available locally.

On iPhone, use Safari's **Share → Add to Home Screen** for an app-like installed experience.

## Tests

Run the existing Node test suite:

```bash
node --test tests/*.test.mjs
```

The tests cover:

- Local Ollama model discovery and generation behavior.
- Service-worker cache cleanup behavior.

## Project structure

```text
My Journal Book/
├── index.html
├── style.css
├── app.js
├── ai.js
├── sw.js
├── manifest.webmanifest
├── icons/
├── tests/
├── assets/
└── vendor/
```

## Design principles

1. **Private by default.**
2. **Local AI, not a cloud chatbot.**
3. **AI should help you notice your own words, not invent a new life story.**
4. **Writing comes first.**
5. **Small, dependable features beat unnecessary complexity.**
6. **Existing journal data should remain compatible.**

## License

See [LICENSE](LICENSE).
