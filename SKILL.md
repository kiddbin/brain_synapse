---
name: brain_synapse
description: Biologically-inspired digital memory system for AI Agents. Implements Sparse Coding, Spreading Activation, Long-Term Depression (LTD), Observer Pattern, Auto Hook System, STDP Temporal Learning, and Conflict Resolution. Supports cold storage for forgotten memories and deep recall recovery.
---

# Brain Synapse: Digital Memory System

> "The brain does not store memories like a computer hard drive; it reconstructs them from sparse patterns."

This skill implements a biologically-inspired memory system for the agent, replacing the flat file `MEMORY.md` with a dynamic, reconstructed memory model.

---

## Auto Hook System (Musk-Style Automation)

### Core Principle

> **"Don't rely on AI self-awareness. Rely on system design."**

The system **automatically detects** critical experience moments and **automatically calls** `pin-exp` to pin them. No need for the AI to remember.

### Auto-Detected Critical Experience Moments

| Scenario | Detection Condition | Auto-Pin Example |
|----------|-------------------|------------------|
| **Error Resolution** | Previous failure → Current success | `browser_fill:use type instead when fill errors` |
| **First Success** | New API/skill first verified | `deploy:must use image UUID not name` |
| **Parameter Discovery** | Key parameter/format found | `api_auth:Authorization Header format is Bearer {token}` |
| **Counter-example** | Verified wrong approach | `image:name invalid, must use UUID` |
| **API Key Discovery** | API call success + key info | `deploy:image param must be UUID` |

### How It Works

```javascript
// System auto-calls (no manual AI action needed)
recordToolCall({
    tool: 'exec',
    action: 'python test.py',
    success: true,
    previousError: 'image not found',
    solution: 'Use image UUID instead of name',
    isFirstAttempt: true
});

// Auto-detect → Auto pin-exp
// ✅ Pinned: "deploy:must use image UUID not name"
```

### View Auto-Pinned Experiences

```bash
node auto-hook.js list
```

### Manual Call (Optional)

If AI wants to manually record, still available:

```bash
node skill.js pin-exp "<scenario>:<key rule>"
```

But **no longer relies** on AI voluntary calls — the system auto-detects.

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
├── temporal_weights.json    # STDP temporal relationships (v1.5.0)
├── conflict_log.json        # Conflict resolution history (v1.5.0)
├── auto-pinned.json         # Auto-hook pinned experiences log
├── hook-log.json            # Tool call history for experience detection
├── skill.js                 # Core logic
├── auto-hook.js             # Auto experience capture
├── stdp-temporal.js         # STDP temporal learning (v1.5.0)
├── conflict-resolver.js     # Conflict resolution (v1.5.0)
├── silicon-embed.js         # Optional: Vector embedding for semantic search
├── .env.example             # API configuration template
└── instincts/               # Observer-generated instincts
```

---

## CRITICAL: Instant Memory Write (memorize)

### When to Use

**You MUST call `memorize` immediately when the user expresses ANY intent to save information.**

#### Trigger Keywords (English):
- remember, memorize, keep in mind
- save, store, archive
- don't forget, make sure to remember
- important, note that
- record this, write this down

#### Trigger Keywords (Chinese):
- 记住、记得、记下
- 存储、存档、保存
- 别忘了、不要忘记
- 记下来、帮我记
- 重要的是、关键的是

### Usage

```bash
node skill.js memorize "<concept>:<content>"
```

### Examples

```bash
# English examples
node skill.js memorize "user_preference:prefers English communication"
node skill.js memorize "meeting:meeting at 3pm tomorrow"
node skill.js memorize "important:project name is Brain Synapse"

# Chinese examples
node skill.js memorize "用户偏好:喜欢使用中文交流"
node skill.js memorize "重要会议:明天下午3点有会议"
```

### ABSOLUTE PROHIBITION

**NEVER respond with only text like "OK, I'll remember that" or "好的，我记住了".**

**You MUST call the `memorize` tool FIRST, then confirm after receiving success response.**

```
❌ WRONG: "OK, I'll remember that." (no tool call)
✅ RIGHT: Call memorize tool → Receive "[Synapse] Instant memory physically written" → Then confirm to user
```

### DO NOT Trigger memorize in These Cases

**These are NOT storage requests - DO NOT call memorize:**

| User Says | Meaning | Correct Action |
|-----------|---------|----------------|
| "I remember before..." | User is recalling | Do NOT call memorize |
| "In my memory..." | Descriptive statement | Do NOT call memorize |
| "Save file" | File operation | Do NOT call memorize |
| "What is memory?" | Asking definition | Do NOT call memorize |
| "I remember he said..." | User sharing memory | Do NOT call memorize |

**Only trigger memorize when user explicitly asks YOU to save/remember something:**

| User Says | Meaning | Correct Action |
|-----------|---------|----------------|
| "Help me remember..." | Explicit storage request | ✅ Call memorize |
| "Remind me to..." | Explicit storage request | ✅ Call memorize |
| "Save this info..." | Explicit storage request | ✅ Call memorize |
| "Don't forget..." | Explicit storage request | ✅ Call memorize |

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

### auto_hook_list
List auto-pinned experiences by Auto Hook system.
- Usage: `node auto-hook.js list`

### auto_hook_clear
Clear hook log (maintenance).
- Usage: `node auto-hook.js clear`

---

## New in v1.5.0: STDP Temporal Learning

### What is STDP?

**Spike-Timing Dependent Plasticity** — The time dimension of brain learning.

> If one neuron fires before another, the connection between them strengthens;
> If it fires after, the connection weakens.

### brain_synapse STDP Implementation

| Feature | Brain Principle | Implementation |
|---------|----------------|----------------|
| **Temporal Prediction** | Earlier concepts predict later ones | `stdp-predict` command |
| **Causal Chains** | A→B→C causal relationships | `stdp-chain` command |
| **Time Window** | Word pairs within 5 seconds are related | Configurable |
| **Weight Decay** | Unused temporal connections weaken | Auto-decay |

### Usage

```bash
# View temporal learning statistics
node skill.js stdp-stats

# Predict concepts related to "browser"
node skill.js stdp-predict "browser"
# Output: [{"keyword": "error", "probability": 0.85}, ...]

# Detect causal chain from "error" to "solution"
node skill.js stdp-chain "error" 3
# Output: ["error", "fill", "type", "success"]
```

### Use Cases

- **Error Prediction**: When "browser" is mentioned, predict potential "errors"
- **Solution Recommendation**: Based on historical causal chains, auto-suggest next steps
- **Process Optimization**: Identify common operation workflows

---

## New in v1.5.0: Conflict Resolution

### Problem Scenario

```
Yesterday: "Use Docker for deployment"
Today: "Don't use Docker, switch to K8s"
→ Traditional system: Simple overwrite, may lose context
→ brain_synapse: Intelligent conflict resolution
```

### Resolution Strategies

| Strategy | Trigger Condition | Action |
|----------|------------------|--------|
| **Refinement** | New memory contains all old info + extra details | Merge, preserve metadata |
| **Update** | Same topic, newer timestamp | New version replaces old |
| **Supersession** | Explicit version marker (v2, new version) | Complete replacement |
| **Flag** | Uncertain relationship | Log for review |

### Usage

```bash
# View conflict resolution log
node skill.js conflict-log 20

# View conflict resolution statistics
node skill.js conflict-stats
# Output: {"totalConflicts": 15, "byAction": {"update": 8, "refine": 4, ...}}
```

### Automatic Operation

Conflict resolution runs automatically in the background:
- Auto-detects conflicts between new and old memories during each `distill`
- Auto-resolves based on strategy
- Records all decisions to `conflict_log.json`

---

## Optional: Vector Semantic Search

For enhanced semantic retrieval, configure Silicon Flow API:

```bash
# Copy example configuration
cp .env.example .env

# Edit .env with your API key
SILICON_API_KEY=your_actual_api_key

# Run indexing
node skill.js distill-vector
```

**Note**: Vector search is optional. The system works fully with local keyword search only.

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
node skill.js deep-recall "strategy from long ago"
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

### 7. auto_hook_list (View Auto-Pinned Experiences)
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
- **Temporal Weights**: `temporal_weights.json` stores STDP temporal relationships.
- **Conflict Log**: `conflict_log.json` stores conflict resolution history.
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

Explicit Memory (memorize command, weight: 5.0)
    ↓ strong LTP, but NOT pinned
    ↓ LTD decay (if not reactivated)
Cold Storage (eventually, if forgotten)

Auto-Pinned Experience (auto-hook.js)
    ↓ pinned: true
Never Decays (permanent storage, auto-captured)
```

---

## Version History

- **v1.5.0**: Added **STDP Temporal Learning** and **Conflict Resolution** - time-based learning and automatic conflict handling.
- **v1.4.0**: Added **Auto Hook System** - automatic experience detection and pinning (no AI manual action needed).
- **v1.3.0**: Added `memorize` command for instant memory write with trigger keyword documentation.
- **v1.2.0**: Added cold storage (latent_weights.json), deep recall, and "no delete" LTD.
- **v1.1.0**: Initial implementation with sparse coding and spreading activation.
