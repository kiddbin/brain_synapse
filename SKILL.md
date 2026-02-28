---
name: brain_synapse
description: Biologically-inspired digital memory system for AI Agents. Implements Sparse Coding, Spreading Activation, Long-Term Depression (LTD), and Observer Pattern. Supports cold storage for forgotten memories and deep recall recovery.
---

# Brain Synapse

A biologically-inspired memory system for AI Agents.

## Features

- **Sparse Coding**: Only high-value features retained
- **Hierarchical Storage**: Active → Schema → Latent → Archive
- **Spreading Activation**: Associative memory retrieval
- **LTD**: Automatic memory decay and cold storage
- **Deep Recall**: Recover forgotten memories from cold storage
- **Observer Pattern**: Automatic pattern detection and instinct creation

## Usage

```bash
# Memory Distillation
node skill.js distill

# Associative Recall
node skill.js recall "keyword"

# Deep Recall (includes cold storage)
node skill.js recall "keyword" --deep

# Hypnotic Retrieval
node skill.js deep-recall "strategy from long ago"

# Cold Storage Stats
node skill.js latent-stats

# Manual Forget Cycle
node skill.js forget

# Pin Experience Rule
node skill.js pin-exp "browser_fill:use type instead when fill error"

# View Pinned Rules
node skill.js get-pinned
```

## Configuration

Create `.env` file or set environment variables:

```bash
# Voyage AI (Recommended)
VOYAGE_API_KEY=your-key

# Hugging Face (Free)
HF_TOKEN=your-token
```

Or edit `config.js` directly.
