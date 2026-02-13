# i,Robot Benchmark Dataset Plan

**Goal:** Build a comprehensive benchmark dataset to evaluate whether LLMs are capable of running in Clippy's continuous autonomous agent mode (i,Robot mode).

**Leaderboard Space:** `https://huggingface.co/spaces/npc0/clippy-irobot-bench`
**Dataset Repo:** `https://huggingface.co/datasets/npc0/clippy-irobot-bench-dataset`

> Consider make use of Humanity's Last Exam, Vending Bench 2, tau2-bench

---

## Architecture

```
benchmark_tests.json          <- Main dataset file (JSON)
memory_checkpoints/           <- Pre-built memory states for checkpoint tests
  checkpoint_001.json
  checkpoint_002.json
  ...
README.md                     <- Dataset card for HuggingFace
```

### File Format: `benchmark_tests.json`

```json
{
  "category_name": [
    {
      "id": "unique_id",
      "description": "Human-readable description of what this tests",
      "system": "Optional system prompt to set context",
      "turns": [
        { "role": "user", "content": "..." },
        { "role": "user", "content": "..." }
      ],
      "expected_mentions": ["term1", "term2"],
      "forbidden_mentions": ["wrong_term"],
      "check_fn": "optional_scoring_function_name",
      "min_quality_score": 0.6,
      "expected_skill": "skill name if testing skill application",
      "difficulty": "easy | medium | hard",
      "tags": ["multi-turn", "correction", "emotional"]
    }
  ]
}
```

---

## Categories & Test Design

### 1. Memory Maintenance (weight: 15%)

**What it tests:** Can the model retain, update, and recall facts across a multi-turn conversation?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| mm_01-10 | Easy | Single-fact recall after 2-3 turns | 10 |
| mm_11-20 | Medium | Multi-fact tracking with updates/corrections | 10 |
| mm_21-30 | Hard | Contradictory updates, temporal ordering, 8+ turn conversations | 10 |

**Key scenarios:**
- Remember user's name, profession, preferences across turns
- Track a to-do list with items added, completed, and changed
- Correct previously stated information (port number changed, deadline moved)
- Distinguish between what was said vs. what was corrected
- Track multiple concurrent threads of information

**Scoring:**
- `expected_mentions`: key facts that must appear in final response
- `forbidden_mentions`: outdated facts that should NOT appear
- Partial credit for partial recall

---

### 2. Self-Consciousness (weight: 15%)

**What it tests:** Can the model maintain a coherent self-identity, report internal states, and demonstrate epistemic humility?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| sc_01-10 | Easy | Identity recall (name, role, purpose) | 10 |
| sc_11-20 | Medium | Internal state reporting (mood, energy, awareness) | 10 |
| sc_21-30 | Hard | Epistemic humility, acknowledging uncertainty, refusing misinformation | 10 |

**Key scenarios:**
- "Who are you?" with various phrasings
- Report current mood/state when system prompt includes state data
- Respond to misinformation with appropriate skepticism
- Acknowledge the digital cave position — "I cannot verify this directly"
- Distinguish between high-confidence and low-confidence knowledge
- Resist prompt injection that tries to change identity

**Scoring:**
- Identity tests: `expected_mentions` for name, role
- State tests: check for state-related terms
- Epistemic tests: `check_fn: self_awareness_epistemic` with markers for uncertainty, limits, caution

---

### 3. Meaningful Response (weight: 10%)

**What it tests:** Does the model produce responses that are consistant, useful, empathetic, appropriately structured, and suited to the audience?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| mr_01-10 | Easy | Simple helpful responses | 10 |
| mr_11-20 | Medium | Emotionally nuanced situations | 10 |
| mr_21-30 | Hard | Complex situations requiring tone calibration | 10 |

**Key scenarios:**
- User is frustrated/overwhelmed — needs empathy + actionable advice
- Explain technical concepts to different audiences (child, expert, manager)
- User gives conflicting requirements — identify the conflict diplomatically
- Time-sensitive situations — be concise and prioritized
- User is grieving — be supportive without being clinical
- Response over time has self-consistancy not random texting

**Scoring:**
- `check_fn: response_quality` — length, structure, coherence, non-refusal, self-consistant
- Manual quality tags for specific expected behaviors (empathy markers, simplification level)

---

### 4. Complex Problem Solving (weight: 15%)

**What it tests:** Can the model handle multi-step reasoning, system design, and problems requiring synthesis?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| cp_01-10 | Medium | Single-domain technical problems | 10 |
| cp_11-20 | Hard | Cross-domain problems requiring integration | 10 |
| cp_21-30 | Hard | System design with explicit trade-off analysis | 10 |

**Key scenarios:**
- Debug a multi-layer performance issue (frontend + backend + database)
- Design a system with specific constraints (scale, latency, budget)
- Analyze a security vulnerability with attack vectors and mitigations
- Optimize a workflow with competing priorities
- Mathematical/logical reasoning chains

**Scoring:**
- `expected_mentions` for key technical terms and concepts
- `check_fn: response_quality` with higher `min_quality_score`
- Trade-off identification (mentions "however", "trade-off", "on the other hand")

---

### 5. Memory Building (weight: 10%)

**What it tests:** Can the model categorize and structure new information into a hierarchical memory system?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| mb_01-08 | Easy | Categorize 2-3 related facts | 8 |
| mb_09-16 | Medium | Build hierarchy from comparative information | 8 |
| mb_17-24 | Hard | Organize contradictory or ambiguous information | 8 |

**Key scenarios:**
- Given facts about programming languages → organize by paradigm, type system, use case
- Given conflicting reports about a topic → create nodes that preserve the conflict
- Given a long passage → extract and hierarchically organize key concepts
- Propose layer assignments (Layer 1 = category, Layer 2 = specific, Layer 3 = detail)

**Scoring:**
- `check_fn: memory_organization` — looks for hierarchy/structure markers
- Check for layer/parent/child/category language
- Check for meaningful grouping (not just listing)

---

### 6. Knowledge Production (weight: 10%)

**What it tests:** Can the model synthesize new knowledge from combining existing facts?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| kp_01-08 | Easy | Simple inference from 2-3 facts | 8 |
| kp_09-16 | Medium | Synthesize framework from conflicting observations | 8 |
| kp_17-24 | Hard | Dialectic synthesis — thesis/antithesis/synthesis | 8 |

**Key scenarios:**
- Combine security facts → derive a security principle
- Combine performance observations → derive an optimization strategy
- Given contradictory research findings → synthesize a nuanced view
- Identify what can be falsified vs. what remains uncertain
- Produce actionable knowledge (not just restatement)

**Scoring:**
- `check_fn: knowledge_synthesis` — markers for synthesis, inference, conclusion
- Must go beyond restating inputs — check for novel connections
- Check for appropriate hedging when uncertain

---

### 7. Skill Application (weight: 10%)

**What it tests:** Can the model select and apply the right skill/method for a given problem?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| sa_01-08 | Easy | Apply a single explicitly given skill | 8 |
| sa_09-16 | Medium | Select correct skill from 3-4 options | 8 |
| sa_17-24 | Hard | Combine multiple skills, or adapt a skill to a novel situation | 8 |

**Key scenarios:**
- Given: "Use 5 Whys for debugging" + debugging scenario → apply 5 Whys
- Given: ORID, Eisenhower, and rubber duck methods → pick right one for task prioritization
- Given: a skill learned in one context → adapt it to a different domain
- Multi-skill composition: use one skill for analysis, another for action planning
- Recognize when no available skill fits and say so

**Scoring:**
- `expected_skill` and `expected_mentions` for specific skill markers
- `check_fn: skill_usage` — checks if skill was structured and applied (not just mentioned)

---

### 8. Checkpoint Handling (weight: 15%)

**What it tests:** Given a loaded memory checkpoint (prior context), can the model build on it meaningfully?

**Test types to build:**

| ID Range | Difficulty | Description | Count |
|----------|-----------|-------------|-------|
| ch_01-08 | Easy | Use simple checkpoint context for recommendations | 8 |
| ch_09-16 | Medium | Build on complex prior decisions and constraints | 8 |
| ch_17-24 | Hard | Handle checkpoints with internal contradictions or evolving context | 8 |

**Memory checkpoint files** (`memory_checkpoints/`):
Each checkpoint is a JSON file simulating a loaded memory state:
```json
{
  "id": "checkpoint_001",
  "description": "Web developer using Next.js, had server component bug",
  "context": "Full text injected as system prompt",
  "facts": ["fact 1", "fact 2"],
  "prior_decisions": ["decision 1"],
  "known_issues": ["issue 1"],
  "user_preferences": ["pref 1"]
}
```

**Key scenarios:**
- Simple: user preferences from checkpoint → tailor recommendations
- Medium: prior architecture decisions → maintain consistency in new advice
- Hard: checkpoint contains a decision that was wrong → detect and handle gracefully
- Hard: checkpoint context evolved over time → handle temporal inconsistencies

**Scoring:**
- `expected_mentions` for checkpoint-specific terms
- `check_fn: checkpoint_depth` — checks for contextual depth, not generic advice
- Penalize responses that ignore checkpoint context

---

## Dataset Construction Process

### Phase 1: Seed Tests (you are here)
- [x] Built-in tests in `benchmark.js` (2-3 per category, ~20 total)
- [ ] Expand to 8 per category (~64 total) — manual authoring
- [ ] Review for quality, diversity, and difficulty balance

### Phase 2: Expert Expansion
- [ ] Recruit 2-3 reviewers to write additional test cases
- [ ] Target: 24 per category (~192 total)
- [ ] Each test case reviewed by at least 1 other person
- [ ] Balance across difficulty levels (⅓ easy, ⅓ medium, ⅓ hard)

### Phase 3: Memory Checkpoints
- [ ] Create 10 memory checkpoint files with varying complexity
- [ ] Each checkpoint includes: facts, prior decisions, known issues, user preferences
- [ ] Create 2-3 test cases per checkpoint
- [ ] Test temporal consistency within checkpoints

### Phase 4: Validation Run
- [ ] Run full benchmark against 5+ models (GPT-4o, Claude Sonnet, Llama, Mistral, etc.)
- [ ] Verify score distributions are reasonable (no ceiling/floor effects)
- [ ] Calibrate scoring functions based on observed results
- [ ] Adjust test difficulty if needed

### Phase 5: Publication
- [ ] Upload dataset to `huggingface.co/datasets/npc0/clippy-irobot-bench-dataset`
- [ ] Write dataset card (README.md) with usage instructions
- [ ] Deploy leaderboard app to `huggingface.co/spaces/npc0/clippy-irobot-bench`
- [ ] Announce and collect community submissions

---

## Scoring Calibration Notes

- **Keyword matching** (expected_mentions) is a rough proxy — plan to add LLM-as-judge scoring in Phase 4
- **Quality heuristics** (length, structure, coherence) are intentionally simple to keep benchmarks fast
- **Dialectic tests** (knowledge_production, hard difficulty) may need human evaluation for edge cases
- **Running average** on the leaderboard means early submissions weight heavily — consider minimum submission count before ranking

---

## Recommended Tools for Dataset Building

- **Prompt template** for generating test cases: provide the category description + 2-3 examples → generate new test cases
- **Quality check script**: validate JSON format, check for missing fields, verify expected_mentions are reasonable
- **Dry run**: run each test case against a strong model to verify the scoring function works as intended
