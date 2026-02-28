# Brain Synapse 🧠

A high-efficiency "mini-brain" memory system for OpenClaw.

In daily heavy usage, the native architecture's full context reading causes unbearable Token consumption. Brain Synapse introduces the JIT (Just-In-Time) mechanism from cognitive science, completely ending meaningless Token burning.

## 📊 Core Performance Improvements

| Metric | Native Full Read | Brain Synapse | Improvement |
| :--- | :--- | :--- | :--- |
| **Token Cost** | ~$48 / month | **~$4 / month** | ⬇️ 90% reduction |
| **Retrieval Latency** | Increases with context | **~130ms** | ⚡ Local incremental index |
| **Error Handling** | Prone to ReAct loops | **"Muscle Memory"** | 🧬 Auto-reflection, 0 retry cost |

> 📖 Detailed benchmark data available in [BENCHMARK_EN.md](BENCHMARK_EN.md)

---

## 🚀 Quick Start

**1. Install Dependencies**
```bash
cd brain_synapse
npm install
```

**2. Basic Commands**
```bash
# Memory Distillation: Convert logs to subconscious weights
node skill.js distill

# Associative Recall
node skill.js recall "browser"
```

**3. More Commands**
```bash
# Deep Recall (includes cold storage)
node skill.js recall "keyword" --deep

# Recover forgotten memories from cold storage
node skill.js deep-recall "strategy from long ago"

# View cold storage stats
node skill.js latent-stats

# Manual forget cycle
node skill.js forget
```

---

## ☕ Sponsor & Get Pro Deep Tuning Pack

Brain Synapse core engine is 100% permanently open source. The default open-source parameters are a "ultra-safe, beginner-proof" conservative configuration. If you have enough time, you can tune it yourself.

But if you want to save time on tuning and API costs, sponsor this project:

👉 **[Get Brain Synapse Pro Deep Tuning Pack ($9.9+)](https://maxray0.gumroad.com/l/brain-synapse-pro)**

**Sponsors automatically unlock:**
- **Golden Ratio Config**: Aggressive memory parameters that squeeze every Token efficiency.
- **Core Soul Persona (SOUL.md)**: Gives AI subconscious, eliminates "forced retrieval" waste.
- **Anti-Infinite-Loop Package** & **Free Vector API Guide**.

---

## 🏗️ Architecture

- **Fully Localized**: No external API dependencies required
- **Zero Cost**: Pure Node.js implementation
- **Hot-Cold Separation**: Active memory and cold storage physically isolated
- **Extensible**: Reserved interfaces for future enhancements

## 📁 Project Structure

```
brain_synapse/
├── skill.js                    # Core memory system
├── observer.js                 # Behavior pattern observer
├── config.js                   # Configuration
├── silicon-embed.js            # Vector search (optional)
├── local_file_search.js        # Local file search
├── synapse_weights.json        # Active memory
├── latent_weights.json         # Cold storage
├── instincts/                  # Pinned Rules
└── workspace/memory/           # Memory storage directory
```

---

## 🌐 Other Languages

- [中文版 README](README_CN.md)

---

*Created by zhangzhenwei | Contact: maxray1356660523@gmail.com*

*If this project helped you, please give it a 🌟 Star!*
