# Changelog

All notable changes to this project will be documented in this file.

## [v1.2.0] - 2025-03-02

### Core
- **DRY Refactor**: Extracted ~200 lines of duplicate code from `distill()` and `distillCore()` into 5 private methods
- **Dual-Channel Architecture**: Fast Lane (Hippocampus ~100ms sync) + Slow Lane (Cortex async)

### Features
- **LTD Mechanism**: Active forgetting of low-frequency synapses with hot/cold storage separation
- **Hebbian Association**: Zero-cost co-occurrence linking, spreading activation recall
- **Deep Recall**: Hypnotic retrieval to revive memories from cold storage
- **Observer Pattern**: Session pattern detection, automatic instinct generation

### Performance
- Lazy-loaded NLP dependencies for faster startup
- Timestamp check optimization to skip unchanged distillation
- 3s timeout fallback to local search when vector search fails

### Architecture
```
Active (Hot) → Schema (Distill) → Latent (Cold Storage)
     ↑               ↓                  ↑
     └── Recall ←── LTD ───────────────┘
```
