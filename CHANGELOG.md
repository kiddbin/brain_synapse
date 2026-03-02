# Changelog

All notable changes to this project will be documented in this file.

## [v1.2.0] - 2025-03-02

### Core
- **DRY Refactor**: 提取 `distill()` 与 `distillCore()` 重复代码 (~200行) 为5个私有方法
- **双通道架构**: Fast Lane (海马体快通道 ~100ms) + Slow Lane (皮层慢通道 异步)

### Features
- **LTD 遗忘机制**: 主动遗忘低频突触，冷热分离存储
- **赫布联想**: 零成本共现关联，扩散激活召回
- **深度回忆**: 催眠检索，从冷库复活记忆
- **Observer 模式**: 会话模式识别，自动生成本能

### Performance
- 懒加载 NLP 依赖，启动提速
- 时间戳检查优化，跳过无变更蒸馏
- 3秒超时降级，向量搜索失败自动回退本地

### Architecture
```
Active (热) → Schema (提炼) → Latent (冷库)
     ↑              ↓            ↑
     └── Recall ←── LTD ────────┘
```
