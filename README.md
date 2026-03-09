# Brain Synapse v2.0

**Cognitive Memory OS for AI Agents** — Dual-track retrieval, structured long-term memory, ~30ms low-latency recall without external vector databases.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/badge/npm-ready-blue)](https://www.npmjs.com)

A biologically-inspired **agent memory system** implementing human memory mechanisms: sparse coding, hierarchical storage (active → latent), dual-track retrieval (intuitive + deliberative), and spreading activation. Designed for **coding agents**, **long-running assistants**, and **research copilots** that need persistent, structured memory beyond context window limits.

---

## Why Brain Synapse

| Approach | Problem | Brain Synapse Solution |
|----------|---------|------------------------|
| **Vector Memory** | Requires embedding models, slow indexing, expensive at scale | Token-based inverted index + Hebbian spreading (no external model, ~30ms recall) |
| **Keyword Search** | Exact match only, no semantic association | Spreading activation across related concepts (biologically-inspired association) |
| **Context Stuffing** | Token limits, lost in the middle, no persistence | Structured memory types with lifecycle management, persists across sessions |
| **Plain RAG** | Retrieves raw text, no experience提炼 | Memory schema with keyword/rule/confidence — distilled experience, not logs |

**Core insight**: AI agents don't need more context — they need _structured, retrievable experience_ that survives session restarts.

---

## Key Features

- **🧩 Structured Memory Types** — Semantic (rules), Episodic (sessions), Procedural (skills) with schema validation
- **⚡ Dual-Track Retrieval** — Track A (intuitive, ~7ms anchor + Hebbian spread) → Track B (deliberative validation, ~1ms)
- **🔍 Index-Driven Search** — Token inverted index, entity index, temporal index, adjacency list for O(1) graph traversal
- **🛡️ Memory Guardian** — Anti-hallucination verification for write-back and long-term memory questions
- **📦 Local JSON Storage** — No database dependencies, optimized async writes with batching (~50ms create)
- **🔗 Spreading Activation** — Hebbian-weighted associations between related memories (simulates neural connectivity)
- **⚙️ Lifecycle Management** — Long-term depression (LTD), conflict resolution, memory supersession

---

## Quick Start

```bash
npm install
```

```javascript
const { BrainSynapseSDK } = require('./src/index');

// 1. Initialize
const sdk = new BrainSynapseSDK({
    weightsFile: './synapse_weights.v2.json',
    latentFile: './latent_weights.v2.json',
    autoLoad: true
});
await sdk.init(); // ~150ms for 600+ memories

// 2. Create memory
await sdk.createMemory({
    memory_type: 'semantic',
    content: {
        keyword: 'browser_automation',
        rule: 'Use browser.navigate() not browser.open() for URL changes'
    },
    provenance: { source: 'user_experience' },
    confidence: 0.9,
    salience: 0.8
});

// 3. Recall
const result = await sdk.recall('how to change browser URL');
console.log(result.results[0].memory.content.rule);
// → "Use browser.navigate() not browser.open() for URL changes"

// 4. Recall with performance tracing
const perfLog = {};
const traced = await sdk.recall('browser automation', { perfLog });
console.log(`Recall: ${perfLog.end_to_end_ms}ms`); // ~30ms
```

**CLI Mode**:
```bash
node skill.js recall "browser automation"
node skill.js pin-exp "keyword:rule"
node skill.js write-verify "test:verification passed"
node skill.js distill --force
```

---

## Use Cases

### Coding Agents
Persistent skill memory across sessions — no relearning `browser.fill()` vs `browser.type()` every restart.

### Long-Running Assistants
Accumulate user preferences, workflow patterns, and failure history over weeks/months.

### Research Copilots
Store paper insights, methodology lessons, and dead-end experiments as structured memories.

### Workflow Memory
Remember what worked (and what crashed) in complex multi-step automations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Application Layer (SDK API)                            │
│  createMemory() | recall() | supersede()                │
├─────────────────────────────────────────────────────────┤
│  Validation Layer                                       │
│  Memory Guardian (anti-hallucination, evidence check)   │
├─────────────────────────────────────────────────────────┤
│  Retrieval Layer (Dual-Track)                           │
│  ┌─────────────┐  ┌─────────────┐                       │
│  │ Track A     │→ │ Track B     │                       │
│  │ Intuitive   │  │ Deliberative│                       │
│  │ ~7ms        │  │ ~1ms        │                       │
│  └─────────────┘  └─────────────┘                       │
├─────────────────────────────────────────────────────────┤
│  Index Layer                                            │
│  Token Inverted | Entity | Temporal | Adjacency Graph   │
├─────────────────────────────────────────────────────────┤
│  Storage Layer                                          │
│  JSON Backend (async batched writes, debounced)         │
│  synapse_weights.v2.json | latent_weights.v2.json       │
└─────────────────────────────────────────────────────────┘
```

### Retrieval Pipeline

1. **Track A (Intuitive)**: Anchor retrieval (exact token match) → Hebbian spreading (activate related concepts)
2. **Track B (Deliberative)**: Temporal filtering → Conflict resolution → Top-K selection
3. **Semantic Fallback** (optional): Embedding-based similarity (SiliconEmbed, not configured by default)

---

## Retrieval Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `serial` (default) | Track A → Track B (fast path) | General queries, low latency required |
| `parallel` | Track A + Track B concurrent | Maximum recall, latency less critical |
| `index-only` | Track A anchor retrieval only | Exact keyword lookups |
| `full-pipeline` | Track A → Track B → Semantic fallback | Complex queries, need semantic matching |

---

## Benchmarks & Evidence

**Tested** (see `brain_synapse/benchmark/runners/`):
- ✅ 40 benchmark runs completed
- ✅ 10k-scale stress test passed (no crashes, stable latency)
- ✅ Noise rejection: 100% (irrelevant memories filtered by Track B)
- ✅ Write optimization: ~10x improvement (500ms → 50ms)

**Current Performance** (629 memories, Windows 10, i7):
| Operation | Latency |
|-----------|---------|
| Recall (serial) | ~30ms |
| Create (async) | ~50ms |
| Init (cold) | ~150ms |

**Known Limits** (honest assessment):
- ⚠️ Top-1 accuracy: Not yet quantified (sometimes returns 10-20 results)
- ⚠️ Irrelevant ratio: Track B filters but doesn't eliminate all false positives
- ⚠️ Semantic fallback: SiliconEmbed not configured (token-only by default)
- ⚠️ Latency optimization: Still room for improvement (target: <20ms recall)

---

## Current Status

### ✅ Stabilized
- 5-Layer Memory OS architecture
- Dual-track retrieval interface
- Memory Schema v2 with validation
- Index incremental maintenance
- Async batched writes

### 🔧 In Optimization
- Semantic fallback integration (SiliconEmbed)
- Top-K selection strategy (reduce irrelevant results)
- Latency further reduction (target <20ms)
- Top-1 accuracy metrics and improvement

---

## Installation

```bash
git clone https://github.com/kiddbin/brain_synapse.git
cd brain_synapse
npm install
```

**Requirements**: Node.js 16+, no external database or embedding service required.

---

## Project Structure

```
brain_synapse/
├── src/
│   ├── index.js                 # SDK entry point
│   ├── storage/
│   │   ├── backend_json.js      # JSON storage (optimized)
│   │   └── indexes/
│   │       └── index_manager.js # Inverted indexes
│   ├── retrieval/
│   │   ├── orchestrator.js      # Dual-track orchestration
│   │   ├── track_a_intuitive.js # Anchor + Hebbian spread
│   │   └── track_b_deliberative.js # Validation
│   ├── schema/
│   │   ├── memory-item.js       # Memory schema v2
│   │   └── validators.js        # Validation rules
│   └── guard/
│       └── memory_guardian.js   # Anti-hallucination
├── skill.js                     # CLI interface
├── synapse_weights.v2.json      # Active memories (gitignore)
└── latent_weights.v2.json       # Latent memories (gitignore)
```

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

## Author

Originally developed for **OpenClaw** AI agent framework. Designed for production use in long-running agent sessions requiring persistent, structured memory.

---

**Keywords**: AI agent memory, long-term memory for AI agents, cognitive memory OS, dual-track retrieval, semantic fallback, structured memory, low-latency recall, agent memory system, coding agent memory, biologically inspired memory, JSON storage, inverted index, Hebbian learning
