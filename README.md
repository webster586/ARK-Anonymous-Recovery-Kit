# ARK – Anonymous Recovery Kit

**Offline-first recovery & knowledge tablet prototype**  
Built as an AI-native rapid prototype exploring local AI, hardware integration, and resilient offline computing.

> **Status:** Active prototype / lab project  
> **Platform:** Windows 10/11 x64  
> **Development approach:** ~99% AI-assisted

---

## What is ARK?

ARK is an offline-capable system designed as a personal recovery and knowledge environment. It combines:

- Local speech recognition (Whisper)
- Local LLM chat (Ollama)
- Offline Wikipedia (Kiwix + ZIM)
- Document & media library (including Bible module)
- Geographic data (Natural Earth + experimental NRW 3D)
- Hardware control via Elgato Stream Deck (HID)
- Modular tablet-oriented UI

The goal was **not** a polished product, but a fast, ambitious exploration of what becomes possible when modern local AI tooling meets classical systems programming and real hardware.

---

## Why this project exists

Most AI demos assume constant cloud connectivity.  
ARK deliberately explores the opposite constraints:

- Fully offline operation after initial setup
- Local models only
- Hardware-first interaction (Stream Deck + voice)
- Resilience and simplicity over feature completeness

It serves as a realistic stress test of **AI-native prototyping speed** against classical engineering constraints.

---

## Tech Stack

| Layer       | Technology                       |
|-------------|----------------------------------|
| Backend     | Go (Windows x64)                 |
| Frontend    | Vanilla JS (modularized scripts) |
| Speech      | whisper.cpp (local)              |
| LLM         | Ollama (local)                   |
| Knowledge   | Kiwix + ZIM files                |
| Hardware    | Elgato Stream Deck (HID)         |
| Geo         | Natural Earth (GPKG / SQLite)    |
| Build       | Cross-compilation from Go        |

---

## AI-Native Development Process

This project was developed in a highly AI-assisted workflow:

- Architecture exploration, code generation, refactoring and documentation were driven by large language models
- Human role focused on: goal definition, hardware validation, integration decisions, regression testing and prioritization
- Iterative loop: prompt → generate → test on real hardware → constrain → next iteration
- Explicit version pinning of "last known good" states before each major AI-driven change

This approach enabled rapid integration of many components (voice, local LLM, offline knowledge, HID, geo data) while keeping a working baseline.

Detailed process notes: [`docs/AI_PROCESS.md`](docs/AI_PROCESS.md)

---

## Current Status & Limitations

**Working / demonstrated:**
- Core controller + modular UI
- Stream Deck integration (specific model)
- Local Whisper voice input (push-to-talk)
- Offline Wikipedia via Kiwix
- Basic document/media modules
- Natural Earth atlas (read-only)

**Known limitations:**
- Not production-ready
- Some modules remain experimental
- Depends on correct local paths and pre-downloaded models/data
- UI modularization is partial (shared global state still exists)
- Hardware testing limited to a specific Stream Deck revision

This is intentionally a **prototype**, not a finished product.

---

## Quick Start (simplified)

1. Clone the repository
2. Place required models and data according to the docs
3. Build the Go binary:

```bash
cd src
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../ARK_Controller_Windows_x64.exe .
```

4. Use the scripts in `scripts/` to launch

Detailed historical setup notes live in `docs/archive/`.

---

## Project Structure

```text
src/           → Go backend + UI sources
docs/          → Architecture & process documentation
scripts/       → Setup and launch scripts
configs/       → Runtime configuration
assets/        → Icons and static assets
```

---

## License

MIT
