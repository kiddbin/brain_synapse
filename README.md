# Brain Synapse v2.0

**Digital Memory System for AI Agents**

A biologically-inspired memory system implementing human brain mechanisms for AI agents.

## Features

- ⚡ **~30ms Retrieval** - Dual-track architecture (Track A: Intuitive, Track B: Deliberative)
- 🧠 **Biologically Inspired** - Sparse coding, hierarchical storage, LTD, spreading activation
- 📦 **JSON Storage** - No external database dependencies
- 🔍 **Semantic Search** - Token-based inverted index + Hebbian spreading
- 🛡️ **Memory Guardian** - Anti-hallucination verification
- ⚙️ **Optimized Write** - Batched writes with debouncing (~10x performance improvement)

## Installation

```bash
npm install
```

## Quick Start

```javascript
const { BrainSynapseSDK } = require('./src/index');

const sdk = new BrainSynapseSDK({
    weightsFile: './synapse_weights.v2.json',
    latentFile: './latent_weights.v2.json',
    autoLoad: true
});

await sdk.init();

// Create memory
await sdk.createMemory({
    memory_type: 'semantic',
    content: { keyword: 'example', rule: 'example rule' },
    provenance: { source: 'user' }
});

// Recall
const result = await sdk.recall('example query');
console.log(result.results);
```

## CLI Commands

```bash
# Recall memory
node skill.js recall "your query"

# Create pinned rule
node skill.js pin-exp "keyword:rule"

# Write and verify
node skill.js write-verify "keyword:content"

# Distill memories (sync from memory files)
node skill.js distill --force
```

## Architecture

```
brain_synapse/
├── src/
│   ├── index.js              # SDK entry point
│   ├── storage/
│   │   ├── backend_json.js   # JSON storage backend (optimized)
│   │   └── indexes/
│   │       └── index_manager.js  # Inverted indexes
│   ├── retrieval/
│   │   ├── orchestrator.js   # Recall orchestration
│   │   ├── track_a_intuitive.js    # Fast track (~7ms)
│   │   └── track_b_deliberative.js # Slow track validation
│   ├── schema/
│   │   ├── memory-item.js    # Memory schema v2
│   │   └── validators.js     # Validation
│   └── guard/
│       └── memory_guardian.js # Anti-hallucination
├── skill.js                  # CLI interface
├── synapse_weights.v2.json   # Active memories (gitignore)
└── latent_weights.v2.json    # Latent memories (gitignore)
```

## Performance

| Operation | Latency (v2.0) | Notes |
|-----------|----------------|-------|
| Recall    | ~30ms          | Dual-track |
| Create    | ~50ms          | Async write |
| Init      | ~150ms         | 600+ memories |

## Memory Types

- **Semantic** - Rules, facts, concepts
- **Episodic** - Session logs, events
- **Procedural** - Skills, workflows
- **Observer** - Pattern detection

## License

MIT

## Author

Originally developed for OpenClaw AI agent framework.
