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
- **Instant Memorize**: Explicit memory write with high priority
- **Dual-Lane Distillation**: Fast lane (~100ms) + Slow lane (background)

## Architecture

```
/new 触发
    ↓
┌─────────────────────────────────────────────────────────┐
│ Fast Lane (Hippocampus) - Synchronous, ~100ms           │
│ distill-core --force                                    │
│ - Pure local I/O + CPU                                  │
│ - Extracts keywords from memory/*.md                    │
│ - Updates synapse_weights.json                          │
│ - Guarantees memory continuity                          │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Slow Lane (Cortex) - Background, Detached               │
│ distill-vector                                          │
│ - Async API calls for semantic embedding                │
│ - Non-blocking, runs in background                      │
│ - Updates vector_cache.json                             │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Recall: session_start                                   │
│ - Retrieves relevant memories                           │
│ - Caches results for AI consumption                     │
└─────────────────────────────────────────────────────────┘
```

## Usage

```bash
# Full Distillation (fast lane + slow lane)
node skill.js distill

# Fast Lane Only (~100ms, for /new trigger)
node skill.js distill-core --force

# Slow Lane Only (background vector indexing)
node skill.js distill-vector

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

# ⭐ Instant Memory Write (CRITICAL)
# Use when user asks to remember/save information
node skill.js memorize "user_preference:prefers Chinese communication"
node skill.js memorize "important:meeting at 3pm tomorrow"

# Pin Experience Rule
node skill.js pin-exp "browser_fill:use type instead when fill error"

# View Pinned Rules
node skill.js get-pinned
```

## ⚠️ CRITICAL: Instant Memory Write

### When to Use memorize

**Call `memorize` immediately when user expresses intent to save information.**

#### Chinese Trigger Keywords:
记住、记得、记下、存储、存档、保存、别忘了、不要忘记、记下来、帮我记、重要的是

#### English Trigger Keywords:
remember, memorize, keep in mind, save, store, archive, don't forget, make sure to remember, important, note that, record this

### Usage

```bash
node skill.js memorize "<concept>:<content>"
```

### ⛔ ABSOLUTE PROHIBITION

**NEVER respond with only text like "好的，我记住了" or "OK, I'll remember that".**

**You MUST call the `memorize` tool FIRST, then confirm after receiving success response.**

```
❌ WRONG: "好的，我记住了。" (no tool call)
✅ RIGHT: Call memorize → Receive success → Then confirm to user
```

### ⚠️ DO NOT Trigger memorize in These Cases

**These are NOT storage requests - DO NOT call memorize:**

| User Says | Meaning | Correct Action |
|-----------|---------|----------------|
| "我记得以前..." | User is recalling | Do NOT call memorize |
| "我的记忆中..." | Descriptive statement | Do NOT call memorize |
| "保存文件" | File operation | Do NOT call memorize |
| "记忆是什么？" | Asking definition | Do NOT call memorize |
| "我记得他说过..." | User sharing memory | Do NOT call memorize |

**Only trigger memorize when user explicitly asks YOU to save/remember something:**

| User Says | Meaning | Correct Action |
|-----------|---------|----------------|
| "帮我记住..." | Explicit storage request | ✅ Call memorize |
| "记得提醒我..." | Explicit storage request | ✅ Call memorize |
| "保存这个信息..." | Explicit storage request | ✅ Call memorize |
| "别忘了..." | Explicit storage request | ✅ Call memorize |

## Configuration

Create `.env` file or set environment variables:

```bash
# Voyage AI (Recommended)
VOYAGE_API_KEY=your-key

# Hugging Face (Free)
HF_TOKEN=your-token
```

Or edit `config.js` directly.

## Memory Lifecycle

```
New Memory (weight: 1.0)
    ↓ distill
Active Memory (weight > 0.1)
    ↓ LTD decay
Cold Storage (weight < 0.1)
    ↓ deep_recall
Revived Memory (weight: 0.5)

Explicit Memory (memorize, weight: 5.0)
    ↓ strong LTP, but NOT pinned
    ↓ LTD decay (if not reactivated)
Cold Storage (eventually, if forgotten)
```

## Performance

| Lane | Duration | Blocking | Purpose |
|------|----------|----------|---------|
| Fast | ~100ms | Yes | Core memory consolidation |
| Slow | 1-3s | No | Semantic vector indexing |
| Recall | ~100ms | Yes | Memory retrieval |
