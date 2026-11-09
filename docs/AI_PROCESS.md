# AI-Native Development Process – ARK

This document describes how ARK was actually built.  
It is intentionally honest, because the interesting part is not the final feature list, but the workflow.

## Core Philosophy

ARK was treated as a continuous conversation between human intent and large language models, constrained by real hardware and offline requirements.

The human role was:

- Defining the overall goal and hard constraints (offline, local models, specific Stream Deck, Windows x64)
- Validating every major change on real hardware
- Deciding what to keep, what to freeze, and what to throw away
- Maintaining "last known good" baselines before risky AI-driven changes

The AI role was:

- Generating large amounts of scaffolding and integration code
- Proposing architecture splits and refactors
- Writing setup scripts, diagnostics and documentation drafts
- Exploring alternative implementations quickly

## Typical Iteration Loop

1. Define a concrete next capability (e.g. "add push-to-talk Whisper on Stream Deck button X")
2. Let the model generate the implementation
3. Integrate and test on the actual device
4. Observe failure modes
5. Constrain the next prompt with the new reality
6. Freeze a working version before the next big change

This loop was repeated many times.  
The numerous versioned notes and reports in the archive are the visible residue of that process.

## What worked well

- Extremely fast exploration of many subsystems (voice, Kiwix, Ollama, geo, HID)
- Ability to keep a working baseline while experimenting
- Rapid generation of platform-specific glue code (PowerShell, batch, Go Windows APIs)

## What was difficult

- Global state and tight coupling in the early UI made later modularization harder
- AI tends to over-generate and invent "helpful" abstractions that later need to be removed
- Path handling and external binary dependencies (Whisper, Kiwix, models) required constant human attention
- Hardware-specific behavior cannot be fully simulated by the model

## Key Lesson

AI-native prototyping is extremely powerful for **breadth and speed**.  
It still requires strong human judgment for **integration quality, hardware reality, and knowing when to stop generating and start stabilizing**.

ARK is the result of deliberately leaning into that tension.
