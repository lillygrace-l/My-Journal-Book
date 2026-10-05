# Agent instructions: maintain My Journal Book

My Journal Book is a lightweight HTML/CSS/JavaScript PWA. Keep the code simple, dependency-free, and local-first.

## Core contracts

- Preserve `offline-journal:entries` for journal data compatibility.
- Existing entries may contain only `id`, `createdAt`, `text`, and `questions`; new fields (`mood`, `tags`, `favorite`, `updatedAt`) are optional.
- Keep Ollama at `http://localhost:11434` and do not introduce cloud AI providers.
- Keep the service-worker shell cache separate from Ollama requests.
- Do not add runtime CDN dependencies, analytics, tracking, or external font loading.
- Use textContent for user-authored journal text. Do not render journal text as HTML.
- Keep accessibility and reduced-motion support intact.

## Existing capabilities

Writing, saving, history, deletion, mood-based ideas, Ollama model selection, AI reflection questions, PWA shell caching, light/dark appearance, and crisis guidance must remain functional.

## New local-only capabilities

Search/filter/calendar history, favorites, optional tags, entry editing/detail, insights, export/import, print, settings, local/offline status, and keyboard shortcuts are presentation/product features built on the same browser-local model.

Avoid frameworks and build steps unless the repository is intentionally migrated in a separate task.
