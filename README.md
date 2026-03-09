# Brain Synapse 🧠

[![Version](https://img.shields.io/badge/version-2.0.0-blue)](https://github.com/kiddbin/brain_synapse/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-Dual--Track%20Retrieval-blue)]()
[![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen)]()

<p align="center">
  <strong>A cognitive memory OS for AI agents with biologically-inspired dual-track retrieval</strong>
</p>

<p align="center">
  <em>Fast intuitive recall + Deliberative validation + Evidence verification</em>
</p>

---

## 🌐 Languages

- [English](#brain-synapse-)
- [中文说明](#中文说明)

---

## Overview

Brain Synapse is a memory operating system designed for AI agents, inspired by neuroscience principles. It implements a **biologically-inspired memory architecture** with **dual-track retrieval** for high-precision, low-latency memory access.

### Key Innovations in v2.0.0

- **Intent-Driven Memory Operations**: Natural language triggers system-enforced write/read
- **Write-Verify**: Forced write with read-back validation (no false "remembered" claims)
- **Guarded-Recall**: Forced recall with evidence verification (no hallucinations)
- **Dual-Track Retrieval**: Track A (Intuitive) + Track B (Deliberative)
- **Sparse Coding**: Only high-weight features stored, ignoring redundant information
- **Hebbian Learning**: Automatic concept association strengthening

### Performance Metrics

| Metric | Value | Description |
|--------|-------|-------------|
| **Retrieval Latency** | ~30ms | Dual-track with index acceleration |
| **Write Verification** | ~3-5s | Write + immediate read-back validation |
| **Memory Capacity** | 10k+ entries | Benchmarked with 10k memory stress test |
| **Noise Rejection** | 100% | Intelligent query filtering |

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/kiddbin/brain_synapse.git
cd brain_synapse
npm install
```

### Basic Usage

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
    content: {
        keyword: 'database_timeout',
        rule: 'Increase connection pool size and enable retry'
    },
    confidence: 0.9,
    salience: 0.8
});

// Recall memory
const result = await sdk.recall('database timeout fix');
console.log(result.results);
```

### CLI Commands

```bash
# Write with verification
node skill.js write-verify "keyword:response"

# Guarded recall
node skill.js guarded-recall "query"

# Standard recall
node skill.js recall "keyword"

# Deep recall (includes latent storage)
node skill.js deep-recall "strategy from long ago"

# View stats
node skill.js latent-stats
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Query Input                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Intent Router (System-Level)                  │
│  ┌─────────────┬─────────────┬─────────────┐                     │
│  │   WRITE     │   QUERY     │    CHAT     │                     │
│  │  (forced)   │  (forced)   │  (normal)   │                     │
│  └─────────────┴─────────────┴─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┴───────────────────┐
            ▼                                       ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│     Write-Verify         │          │     Guarded-Recall       │
│  Write → Verify → Result │          │  Recall → Evidence → Result│
└──────────────────────────┘          └──────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Track A: Intuitive Recall                    │
│  ┌─────────────┬─────────────┬─────────────┐                     │
│  │   Anchor    │  Hebbian   │  Semantic   │                     │
│  │  Concepts   │   Spread   │  Fallback   │                     │
│  └─────────────┴─────────────┴─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Track B: Deliberative Validation               │
│  ┌─────────────┬─────────────┬─────────────┐                     │
│  │  Temporal   │  Conflict  │  Precision  │                     │
│  │   Filter    │ Resolution │   Sorting   │                     │
│  └─────────────┴─────────────┴─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Context Packer                              │
│              (Agent-ready Bundle Generation)                     │
└─────────────────────────────────────────────────────────────────┘
```

### Memory Types

| Type | Description | Use Case |
|------|-------------|----------|
| `semantic` | General knowledge rules | "Database connections use standard config" |
| `procedural` | Step-by-step solutions | "To fix timeout: increase retry count" |
| `episodic` | Time-stamped events | "On 2024-03-15, deployed v2.0" |
| `failed_attempt` | Tried but failed approaches | "Restart didn't fix the memory leak" |
| `reflective` | Lessons learned | "Should have used connection pooling" |

---

## 📁 Project Structure

```
brain_synapse/
├── src/
│   ├── index.js                    # Main SDK entry
│   ├── retrieval/
│   │   ├── orchestrator.js         # Dual-track coordination
│   │   ├── track_a_intuitive.js    # Fast intuitive recall
│   │   ├── track_b_deliberative.js # Hard validation
│   │   └── semantic_fallback.js    # Vector search fallback
│   ├── storage/
│   │   ├── backend_json.js         # JSON storage backend
│   │   └── indexes/
│   │       └── index_manager.js    # O(1) index management
│   ├── lifecycle/
│   │   ├── plasticity.js           # Hebbian learning
│   │   └── conflict_manager.js     # Memory supersession
│   ├── guard/
│   │   └── memory_guardian.js      # Evidence verification
│   ├── reasoning/
│   │   └── context_packer.js       # Agent bundle generation
│   └── schema/
│       ├── memory-item.js          # Memory schema
│       └── validators.js           # Validation utilities
├── benchmark/                      # Performance benchmarks
├── examples/                       # Usage examples
├── skill.js                        # CLI entry point
└── package.json
```

---

## 🔧 Configuration

```javascript
const sdk = new BrainSynapseSDK({
    weightsFile: './synapse_weights.v2.json',  // Active memory
    latentFile: './latent_weights.v2.json',    // Cold storage
    autoLoad: true                             // Auto-initialize
});
```

### Retrieval Options

| Option | Default | Description |
|--------|---------|-------------|
| `mode` | `'serial'` | `'serial'` (Track A → Track B) or `'parallel'` |
| `topK` | `10` | Maximum results to return |
| `deep` | `false` | Include latent (cold) storage |
| `enableTrackA` | `true` | Enable intuitive recall |
| `enableTrackB` | `true` | Enable deliberative validation |

---

## 🧪 Benchmarks

See [BENCHMARK.md](BENCHMARK.md) for detailed performance data.

Quick results (10k memory stress test):
- **Pass Rate**: 80%
- **Top-1 Correctness**: 84.62% (index-only) / 73.33% (full-pipeline)
- **Noise Rejection**: 100%
- **Average Latency**: ~24ms (index-only) / ~31ms (full-pipeline)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

# 中文说明

## 概述

Brain Synapse 是一个为 AI Agent 设计的记忆操作系统，灵感来自神经科学原理。它实现了**生物启发式记忆架构**，具有**双轨检索**能力，实现高精度、低延迟的记忆访问。

### v2.0.0 核心创新

- **意图驱动记忆操作**：自然语言触发系统强制写入/读取
- **写入验证**：强制写入 + 回读验证（防止虚假"已记住"声明）
- **守卫召回**：强制检索 + 证据验证（防止幻觉）
- **双轨检索**：Track A（直觉）+ Track B（审慎）
- **稀疏编码**：只存储高权重特征，忽略冗余信息
- **赫布学习**：自动概念关联强化

### 性能指标

| 指标 | 数值 | 说明 |
|------|------|------|
| **检索延迟** | ~30ms | 双轨 + 索引加速 |
| **写入验证** | ~3-5s | 写入 + 立即回读验证 |
| **记忆容量** | 10k+ | 10k 记忆压力测试验证 |
| **噪声拒绝** | 100% | 智能查询过滤 |

## 快速开始

### 安装

```bash
git clone https://github.com/kiddbin/brain_synapse.git
cd brain_synapse
npm install
```

### 基本用法

```javascript
const { BrainSynapseSDK } = require('./src/index');

const sdk = new BrainSynapseSDK({
    weightsFile: './synapse_weights.v2.json',
    latentFile: './latent_weights.v2.json',
    autoLoad: true
});

await sdk.init();

// 创建记忆
await sdk.createMemory({
    memory_type: 'semantic',
    content: {
        keyword: 'database_timeout',
        rule: 'Increase connection pool size and enable retry'
    },
    confidence: 0.9,
    salience: 0.8
});

// 召回记忆
const result = await sdk.recall('database timeout fix');
console.log(result.results);
```

### CLI 命令

```bash
# 带验证的写入
node skill.js write-verify "关键词:响应内容"

# 守卫召回
node skill.js guarded-recall "查询内容"

# 标准召回
node skill.js recall "关键词"

# 深度召回（包含冷库）
node skill.js deep-recall "long ago strategy"

# 查看统计
node skill.js latent-stats
```

## 架构

Brain Synapse 采用**双轨检索架构**：

- **Track A（直觉检索）**：快速稀疏召回 + 赫布扩散 + 语义回退
- **Track B（审慎验证）**：时间过滤 + 冲突解决 + 精排序

**意图驱动层**（v2.0.0 新增）：
- 识别用户 WRITE/QUERY/CHAT 意图
- WRITE → 强制 write-verify
- QUERY → 强制 guarded-recall
- 系统强制执行，模型只负责润色结果

## 记忆类型

| 类型 | 描述 | 用例 |
|------|------|------|
| `semantic` | 通用知识规则 | "数据库连接使用标准配置" |
| `procedural` | 分步解决方案 | "修复超时：增加重试次数" |
| `episodic` | 时间戳事件 | "2024-03-15 部署了 v2.0" |
| `failed_attempt` | 尝试过但失败的方法 | "重启没有修复内存泄漏" |
| `reflective` | 经验教训 | "应该使用连接池" |

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。
