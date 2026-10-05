# Vendored MediaPipe Tasks GenAI Runtime

This directory contains a vendored copy of the **MediaPipe Tasks GenAI** runtime (`@mediapipe/tasks-genai`, Apache-2.0) retained from an earlier local-AI experiment.

## Important: not the current AI path

**My Journal Book does not currently use this package at runtime.**

The active AI implementation is intentionally simpler:

```text
My Journal Book
      ↓
    ai.js
      ↓
http://localhost:11434
      ↓
    Ollama
      ↓
local installed model
```

The current application therefore does **not** download a browser LLM through MediaPipe, does not load a MediaPipe WASM backend, and does not depend on a third-party model CDN for its AI features.

## Why this folder is here

The files are kept as vendored project history rather than being part of the product architecture. They are isolated under `vendor/tasks-genai/` and are not imported by `index.html`, `app.js`, or `ai.js`.

For a future browser-native AI experiment, this package may be useful as a reference. Such an experiment should be treated as a separate architectural choice rather than silently changing the current Ollama-based design.

## Package information

- Package: `@mediapipe/tasks-genai`
- Version bundled here: `0.10.29`
- License: Apache-2.0
- Upstream project: [MediaPipe](https://github.com/google-ai-edge/mediapipe)

## Do not use this README for My Journal Book setup

For the application's actual installation, local AI, privacy model, PWA behavior, tests, and Render deployment, use the repository's root [README](../../README.md).
