# Brain Synapse - 5-Layer Memory OS for AI Agents

[![Version](https://img.shields.io/badge/version-2.2.0-blue)
[![License](https://img.shields.io/badge/license-MIT-blue)
[![Architecture](https://img.shields.io/badge/Architecture-5%20Memory OS-blue)

[![Status](https://img.shields.io/badge/status-Production%20Ready-badge)

</p>

<p align="center">
  <strong>A brain-inspired memory system for AI agents with dual-track retrieval</strong>
</p>
<p align="center">
  <em>Fast intuitive recall + Deliberative validation = Semantic fallback</em>
</p>
---

## Overview
Brain Synapse is a memory operating system designed for AI agents, inspired by neuroscience principles. It implements a 5-layer memory architecture with dual-track retrieval for high-precision, low-latency memory access.
### Key Features
- **5-Layer Memory Architecture**: Episodic, Semantic, Procedural, Failed Attempt, Reflective
- **Dual-Track Retrieval**: Track A A (Intuitive) + Track B (Deliberative)
- **Hebbian Learning**: Automatic concept association strengthening
- **Semantic Fallback**: Vector-based similarity search when lexical recall fails
- **Conflict Resolution**: Automatic memory supersession and archival
- **Noise Rejection**: Intelligent query filtering for noise detection
### Performance Metrics (10k scale benchmark)
| Metric | index-only | full-pipeline |
|--------|-----------|---------------|
| Pass Rate | 80.00% | 80.00% |
| Top-1 Correctness | 84.62% | 73.33% |
| Noise Rejection | 100.00% | 100.00% |
| Avg Latency | ~24ms | ~31ms |
---
## Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        Query Input                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Intent Router (Lightweight)                    │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │ file lookup  │ entity     │ noise      │ semantic   │   │
│  │ (skip)       │ (skip)     │ (reject)   │ (continue) │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Track A: Intuitive Recall                      │
│  ┌─────────────┬─────────────┬─────────────┐                      │
│  │ Anchor      │ Hebbian    │ Semantic   │                      │
│  │ Concepts   │ Spread     │ Fallback   │                      │
│  └─────────────┴─────────────┴─────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Track B: Deliberative Validation                    │
│  ┌─────────────┬─────────────┬─────────────┐                      │
│  │ Temporal    │ Conflict   │ Precision  │                      │
│  │ Filter     │ Resolution │ Sorting   │                      │
│  └─────────────┴─────────────┴─────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Context Packer                               │
│              (Agent-ready Bundle Generation)                 │
└─────────────────────────────────────────────────────────────────┘
```
---
## Quick Start
```javascript
const { BrainSynapseSDK } = require('./src/index');
const sdk = new BrainSynapseSDK();
await sdk.init();
const result = await sdk.recall('database connection');
console.log(result.results);
```
---
## Memory Types
| Type | Description | Use Case |
|------|-------------|----------|
| `semantic` | General knowledge rules | "Database connections use standard config" |
| `procedural` | Step-by-step solutions | "To fix timeout: increase retry count" |
| `episodic` | Time-stamped events | "On 2024-03-15, deployed v2.0" |
| `failed_attempt` | Tried but failed approaches | "Restart didn't fix the memory leak" |
| `reflective` | Lessons learned | "Should have used connection pooling" |
---
## Configuration
```javascript
const sdk = new BrainSynapseSDK({
    weightsFile: './synapse_weights.v2.json',
    latentFile: './latent_weights.v2.json',
    autoLoad: true
});
```
---
## API Reference
### Core Methods
| Method | Description |
|--------|-------------|
| `createMemory(data)` | Create a new memory |
| `recall(query, context)` | Retrieve memories |
| `recallAndPack(query, options)` | Retrieve and pack for agent |
| `supersede(oldId, newData)` | Replace old memory with new |
### Retrieval Options
| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `'serial'` | `'serial'` or `'parallel'` |
| `topK` | `10` | Maximum results to return |
| `enableTrackA` | `true` | Enable intuitive recall |
| `enableTrackB` | `true` | Enable deliberative validation |
---
## Project Structure
```
brain_synapse/
├── src/
│   ├── index.js              # Main SDK entry
│   ├── retrieval/
│   │   ├── orchestrator.js      # Dual-track coordination
│   │   ├── track_a_intuitive.js  # Fast recall
│   │   ├── track_b_deliberative.js # Hard validation
│   │   └── semantic_fallback.js  # Vector search
│   ├── storage/
│   │   ├── backend_json.js     # JSON storage
│   │   └── indexes/
│   │       └── index_manager.js # Index management
│   ├── lifecycle/
│   │   ├── plasticity.js       # Hebbian learning
│   │   └── conflict_manager.js # Memory supersession
│   ├── reasoning/
│   │   └── context_packer.js   # Agent bundle generation
│   └── schema/
│       ├── memory-item.js      # Memory schema
│       └── validators.js       # Validation
├── benchmark/
│   └── runners/
│       └── final_10k_comparison.js # Performance benchmark
├── silicon-embed.js           # Vector embedding module
└── README.md
```
---
## License
MIT License - see [LICENSE](LICENSE) file for details.
