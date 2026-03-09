# Brain Synapse: Digital Memory System

> "The brain does not store memories like a computer hard drive; it reconstructs them from sparse patterns."

This skill implements a biologically-inspired memory system for the agent, replacing the flat file `MEMORY.md` with a dynamic, reconstructed memory model.

---

## 🚀 Auto Hook System (马斯克式自动化)

### 核心原则

> **"不要依赖 AI 自觉性，要靠系统设计。"**

系统**自动检测**关键经验时刻，**自动调用** `pin-exp` 固定，不需要 AI 记得。

### 自动检测的关键经验时刻

| 场景 | 检测条件 | 自动固定示例 |
|------|---------|-------------|
| **错误解决** | 之前失败 → 现在成功 | `browser_fill:fill 报错必须用 type 替代` |
| **首次成功** | 新 API/技能首次验证 | `xiangongyun_deploy:必须用镜像 UUID 而非名称` |
| **参数发现** | 发现关键参数/格式 | `api_auth:Authorization Header 格式为 Bearer {token}` |
| **反面教材** | 验证了错误做法 | `xiangongyun_image:镜像名称无效，必须用 UUID` |
| **API 关键发现** | API 调用成功 + 关键信息 | `open_instance_deploy:image 参数必须是 UUID` |

### 工作原理

```javascript
// 系统自动调用（不需要 AI 手动）
recordToolCall({
    tool: 'exec',
    action: 'python test.py',
    success: true,
    previousError: '未找到该镜像',
    solution: '使用镜像 UUID 而非名称',
    isFirstAttempt: true
});

// 自动检测 → 自动 pin-exp
// ✅ 固定："xiangongyun_deploy:必须用镜像 UUID 而非名称"
```

### 查看自动固定的经验

```bash
node auto-hook.js list
```

### 手动调用（可选）

如果 AI 想手动记录，依然可用：

```bash
node skill.js pin-exp "<场景>:<关键规则>"
```

但**不再依赖**AI 自觉调用 —— 系统会自动检测。

---

## Core Concepts

1.  **Sparse Coding**: Only high-value features are retained. Redundant data is discarded.
2.  **Hierarchical Storage**:
    *   **Active**: Current context (RAM).
    *   **Schema**: `synapse_weights.json` (active memory, weight > 0.1).
    *   **Latent**: `latent_weights.json` (cold storage, weight < 0.1, **never deleted**).
    *   **Archive**: `memory/archive/` (raw logs).
3.  **Spreading Activation**: Retrieval triggers related concepts, not just keyword matches.
4.  **LTD (Long-Term Depression)**: Unused memories fade and are **archived to cold storage**, NOT deleted.
5.  **Deep Recall**: Recover forgotten memories from cold storage.
6.  **Auto Hook**: Automatic experience detection and pinning (no AI manual action needed).

---

## Architecture

- **Fully Localized**: No external API dependencies, all data stored locally.
- **Zero Cost**: Pure Node.js implementation, no paid services required.
- **Hot-Cold Separation**: Active and cold storage physically isolated for efficient retrieval.
- **Never Forget**: Low-weight memories archived to cold storage, recoverable via deep recall.
- **Extensible**: Reserved interfaces for future enhancements.
- **Auto Hook**: Automatic experience capture, no AI manual action required.

---

## Storage Structure

```
brain_synapse/
├── synapse_weights.json     # Active memory (weight > 0.1)
├── latent_weights.json      # Cold storage (weight < 0.1, archived not deleted)
├── temporal_weights.json    # STDP temporal relationships
├── conflict_log.json        # Conflict resolution history
├── auto-pinned.json         # Auto-hook pinned experiences log
├── hook-log.json            # Tool call history for experience detection
├── skill.js                 # Core logic
├── auto-hook.js             # Auto experience capture
├── stdp-temporal.js         # STDP temporal learning (v1.5.0)
├── conflict-resolver.js     # Conflict resolution (v1.5.0)
└── instincts/               # Observer-generated instincts
```

---

## ⚠️ CRITICAL: Instant Memory Write (memorize)

### When to Use

**You MUST call `memorize` immediately when the user expresses ANY intent to save information.**

#### Chinese Trigger Keywords:
- 记住、记得、记下
- 存储、存档、保存
- 别忘了、不要忘记
- 记下来、帮我记
- 重要的是、关键的是

#### English Trigger Keywords:
- remember, memorize, keep in mind
- save, store, archive
- don't forget, make sure to remember
- important, note that
- record this, write this down

### Usage

```bash
node skill.js memorize "<concept>:<content>"
```

### Examples

```bash
# Chinese examples
node skill.js memorize "用户偏好：喜欢使用中文交流"
node skill.js memorize "重要会议：明天下午 3 点有会议"
node skill.js memorize "项目信息：项目名称是 Brain Synapse"

# English examples
node skill.js memorize "user_preference:prefers Chinese communication"
node skill.js memorize "meeting:meeting at 3pm tomorrow"
node skill.js memorize "important:project name is Brain Synapse"
```

### ⛔ ABSOLUTE PROHIBITION

**NEVER respond with only text like "好的，我记住了" or "OK, I'll remember that".**

**You MUST call the `memorize` tool FIRST, then confirm after receiving success response.**

```
❌ WRONG: "好的，我记住了。" (no tool call)
✅ RIGHT: Call memorize tool → Receive "[Synapse] Instant memory physically written" → Then confirm to user
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

---

## Tools

### synapse_memorize (Instant Memory Write)
**CRITICAL TOOL** - Use when user asks to remember/save information.
- Usage: `node skill.js memorize "<concept>:<content>"`
- Weight: 5.0 (strong LTP, high initial weight)
- Features: Will decay via LTD if not reactivated - ensures system stays lightweight

### synapse_recall
Trigger semantic recall from the synapse network.
- Usage: `node skill.js recall <query>`
- Options: `--deep` or `-d` to include cold storage

### synapse_deep_recall
Dedicated deep recall from cold storage. Revives matched memories back to active storage.
- Usage: `node skill.js deep-recall <query>`
- Revived memories get weight reset to 0.5

### synapse_latent_stats
Get statistics about cold storage.
- Usage: `node skill.js latent-stats`

### synapse_distill
Run memory consolidation process.
- Usage: `node skill.js distill`

### synapse_forget
Run LTD process to archive weak memories (NOT delete).
- Usage: `node skill.js forget`

### synapse_pin_exp
Pin experience rule (never decays).
- Usage: `node skill.js pin-exp "<keyword>:<rule>"`

### auto_hook_list (NEW!)
List auto-pinned experiences by Auto Hook system.
- Usage: `node auto-hook.js list`

### auto_hook_clear (NEW!)
Clear hook log (maintenance).
- Usage: `node auto-hook.js clear`

---

## Usage Examples

### 1. synapse_recall (Associative Recall)
```bash
node skill.js recall "browser"
```

### 2. synapse_recall --deep (Deep Recall)
```bash
node skill.js recall "query" --deep
# or
node skill.js recall "query" -d
```

### 3. synapse_deep_recall (Cold Storage Only)
```bash
node skill.js deep-recall "quant strategy from long ago"
```

### 4. synapse_latent_stats (Cold Storage Stats)
```bash
node skill.js latent-stats
```

### 5. synapse_distill (Memory Consolidation)
```bash
node skill.js distill
```

### 6. synapse_forget (LTD Cycle)
```bash
node skill.js forget
```

### 7. auto_hook_list (NEW! View Auto-Pinned Experiences)
```bash
node auto-hook.js list
```

---

## Integration Instructions

To fully activate Brain Synapse:
1.  **Stop** reading `MEMORY.md` by default.
2.  **Start** every session by querying `synapse_recall` with the user's last message or current topic.
3.  **Schedule** `synapse_distill` to run every 24 hours.
4.  **Use** `synapse_recall --deep` when user asks about "long ago" or "previously done" things.
5.  **Call** `memorize` IMMEDIATELY when user expresses intent to save information.
6.  **Auto Hook** automatically captures key experiences - no manual action needed!

---

## Technical Details

- **Weights File**: `synapse_weights.json` stores the "Schema" (concepts + weights > 0.1).
- **Latent Weights**: `latent_weights.json` stores archived memories (weight < 0.1).
- **Auto-Pinned**: `auto-pinned.json` stores experiences auto-captured by Auto Hook.
- **Hook Log**: `hook-log.json` stores tool call history for experience detection.
- **Archive**: `memory/archive/` stores raw logs, searched locally without external dependencies.
- **Engine**: Node.js script `skill.js` handles the neural logic.
- **Auto Hook**: Node.js script `auto-hook.js` handles automatic experience capture.
- **LTD Behavior**: Memories are archived, never deleted. This matches human brain's "forgetting but recoverable" mechanism.

---

## Memory Lifecycle

```
New Memory (weight: 1.0)
    ↓ distill
Active Memory (synapse_weights.json, weight > 0.1)
    ↓ LTD decay
Cold Storage (latent_weights.json, weight < 0.1)
    ↓ deep_recall
Revived Memory (weight: 0.5, back to active)

Explicit Memory (memorize command, weight: 2.5)
    ↓ pinned: true
Never Decays (permanent storage)

Auto-Pinned Experience (auto-hook.js)
    ↓ pinned: true
Never Decays (permanent storage, auto-captured)
```

---

## 🧠 New in v1.5.0: STDP Temporal Learning

### What is STDP?

**Spike-Timing Dependent Plasticity (脉冲时序依赖可塑性)** —— 人脑学习的时间维度。

> 如果一个神经元在另一个神经元之前放电，它们之间的连接会增强；
> 如果在之后放电，连接会减弱。

### brain_synapse STDP 实现

| 功能 | 人脑原理 | 实现 |
|------|---------|------|
| **时序预测** | 先出现的概念预测后出现的 | `stdp-predict` 命令 |
| **因果链条** | A→B→C 的因果关系 | `stdp-chain` 命令 |
| **时间窗口** | 5秒内出现的词对视为相关 | 可配置 |
| **权重衰减** | 不常用的时序连接弱化 | 自动衰减 |

### Usage

```bash
# 查看时序学习统计
node skill.js stdp-stats

# 预测"浏览器"相关的后续概念
node skill.js stdp-predict "浏览器"
# 输出: [{"keyword": "报错", "probability": 0.85}, ...]

# 检测"错误"→"解决"的因果链条
node skill.js stdp-chain "错误" 3
# 输出: ["错误", "fill", "type", "成功"]
```

### Use Cases

- **错误预测**: 当提到"浏览器"时，预测可能出现的"报错"
- **解决方案推荐**: 基于历史因果链，自动推荐下一步
- **流程优化**: 识别常用操作流程，自动建议

---

## ⚖️ New in v1.5.0: Conflict Resolution

### 问题场景

```
昨天: "使用 Docker 部署"
今天: "禁止使用 Docker，改用 K8s"
→ 传统系统：简单覆盖，可能丢失上下文
→ brain_synapse: 智能冲突解决
```

### 解决策略

| 策略 | 触发条件 | 操作 |
|------|---------|------|
| **细化 (Refinement)** | 新记忆包含旧记忆的所有信息 + 额外细节 | 合并，保留元数据 |
| **更新 (Update)** | 同一主题，时间戳新 | 新版本取代旧版本 |
| **取代 (Supersession)** | 明确版本标记 (v2, 新版) | 完全替代 |
| **标记 (Flag)** | 不确定关系 | 记录待审核 |

### Usage

```bash
# 查看冲突解决日志
node skill.js conflict-log 20

# 查看冲突解决统计
node skill.js conflict-stats
# 输出: {"totalConflicts": 15, "byAction": {"update": 8, "refine": 4, ...}}
```

### 自动工作

冲突解决在后台自动运行，无需手动干预：
- 每次 `distill` 时自动检测新旧记忆冲突
- 根据策略自动解决
- 记录所有决策到 `conflict_log.json`

---

## Version History

- **v1.5.0**: Added **STDP Temporal Learning** and **Conflict Resolution** - time-based learning and automatic conflict handling.
- **v1.4.0**: Added **Auto Hook System** - automatic experience detection and pinning (no AI manual action needed).
- **v1.3.0**: Added `memorize` command for instant memory write with trigger keyword documentation.
- **v1.2.0**: Added cold storage (latent_weights.json), deep recall, and "no delete" LTD.
- **v1.1.0**: Initial implementation with sparse coding and spreading activation.
