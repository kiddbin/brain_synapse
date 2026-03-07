# Brain Synapse 🧠

为 OpenClaw 打造的低耗高能"小脑"记忆系统。

在日常重度使用中，原生架构每次全量读取日志会引发难以承受的 Token 消耗。Brain Synapse 通过引入认知科学中的 JIT（按需唤醒）机制，彻底终结无意义的 Token 燃烧。

## 📊 核心性能跃迁

| 维度 | 原生全量读取 | 接入 Brain Synapse | 提升幅度 |
| :--- | :--- | :--- | :--- |
| **Token 成本** | ~$48 / 月 | **~$4 / 月** | ⬇️ 狂降 90% |
| **检索延迟** | 随上下文递增 | **130ms 级** | ⚡ 本地增量索引极速响应 |
| **错误修正** | 易陷入 ReAct 死循环 | **具备"肌肉记忆"** | 🧬 自动反省，0 重复试错成本 |

> 📖 详细的底层压测数据，请查看 [BENCHMARK.md](BENCHMARK.md)

---

## 🚀 快速开始

**1. 安装与依赖**
```bash
cd brain_synapse
npm install
```

**2. 基础启动**
```bash
# 记忆蒸馏：将日志转为潜意识权重
node skill.js distill

# 触发联想检索
node skill.js recall "浏览器"
```

**3. 更多命令**
```bash
# 深度检索（含冷库）
node skill.js recall "关键词" --deep

# 从冷库恢复遗忘记忆
node skill.js deep-recall "很久以前的策略"

# 查看冷库统计
node skill.js latent-stats

# 手动触发遗忘周期
node skill.js forget
```
---

## 🏗️ 系统架构

- **完全本地化**：无需外部 API 依赖
- **零成本**：纯 Node.js 实现
- **冷热分离**：活跃记忆与冷库物理隔离
- **可扩展**：预留接口支持未来增强

## 📁 项目结构

```
brain_synapse/
├── skill.js                    # 核心记忆系统
├── observer.js                 # 行为模式观察器
├── config.js                   # 配置文件
├── silicon-embed.js            # 向量搜索（可选）
├── local_file_search.js        # 本地文件搜索
├── synapse_weights.json        # 活跃记忆
├── latent_weights.json        # 冷库存储
├── instincts/                  # 固化本能规则
└── workspace/memory/          # 记忆存储目录
```

---

## 🌐 其他语言

- [English README](README.md)

---

*Created by (https://github.com/kiddbin) | Contact: maxray1356660523@gmail.com*

