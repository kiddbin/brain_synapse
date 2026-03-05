# Changelog

All notable changes to this project will be documented in this file.

## [v1.3.0] - 2026-03-05

### 🚀 Major Features

#### Adaptive Dual-Track RAG Engine
A revolutionary retrieval architecture that intelligently balances speed and accuracy:

- **Fast-Path Short-Circuit**: Skip vector API for high-confidence local matches
  - Filename exact match threshold: ≥1000 score
  - Latency: ~100ms (3.6x faster than before)
  - API cost: ¥0 for high-confidence queries

- **Dynamic Timeout Racing**: Smart timeout based on local result quality
  - Local score >50: 1.5s timeout (has backup, wait less)
  - Local score <50: 3s timeout (no backup, must wait)

- **Reciprocal Rank Fusion (RRF)**: Merge local and vector results
  - Formula: `RRF Score = 1/(60+local_rank) + 1/(60+vector_rank)`
  - Balances exact keyword matching with semantic understanding

### 🔥 Filename Priority Optimization

#### Ultra-High Weight for Filename Matches
Filename matches now receive 600-1000x higher weight than content matches:

| Match Type | Score | Description |
|-----------|-------|-------------|
| Exact filename match | 10,000 | Query equals filename (without .md) |
| Filename contains full query | 5,000 × density | Filename includes complete query |
| Filename partial match | 300 per word | Filename contains query keywords |
| Content match | 1-10 | Keywords found in file content |

**Impact**: SOP documents and specification files are now always retrieved first.

### 📊 Performance Benchmarks

| Scenario | v1.2.0 | v1.3.0 | Improvement |
|----------|--------|--------|-------------|
| Filename match | ~360ms | **~100ms** | **3.6x faster** ⚡ |
| API cost per query | ~¥0.02 | **¥0** | **100% savings** 💰 |
| Fuzzy query | ~360ms | ~200-360ms | Adaptive timeout |
| Result quality | Single source | **RRF fused** | **More accurate** 🎯 |

### 🏗️ Architecture Improvements

#### LocalFileSearch Enhancements
- Added `segmentChineseQuery()` for better Chinese word segmentation
- Sliding window extraction of 2-4 character terms
- Filename-first sorting in result ranking
- Metadata enrichment with `filenameMatch` and `fileName` fields

#### Skill.js Upgrades
- Refactored `recall()` method with 4-stage pipeline
- Added `_reciprocalRankFusion()` for intelligent result merging
- Added `_buildRecallResult()` for unified response format
- Enhanced logging with optimization flags

### 🔒 Privacy & Security

- No hardcoded API keys in open-source version
- All vector API configuration via `config.js` or environment variables
- Local-only mode automatically enabled when API is unavailable

### 📝 Code Quality

- Improved error handling with detailed logging
- Better timeout management with dynamic adjustment
- Cleaner separation of concerns between modules
- Enhanced code comments for international users

### 🐛 Bug Fixes

- Fixed Chinese filename encoding issues
- Resolved timeout race conditions
- Fixed index cache corruption handling
- Improved fallback mechanism robustness

### 📚 Documentation

- Updated README with performance metrics
- Added architecture diagram
- Enhanced code comments in English
- Added usage examples for new features

---

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
