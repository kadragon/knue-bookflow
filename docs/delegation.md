# Delegation

The orchestrator plans, routes, and verifies. It does not do every edit itself.

## Pattern Selection

```
Q1. Does the task decompose into >1 genuinely parallel subtask?
    No  → single session. No delegation. Stop.
    Yes → Q2.
Q2. Do subtasks need to share findings mid-flight?
    No  → Orchestrator-Subagent (this doc's default).
    Yes → Q3.
Q3. Is there an objective written pass/fail criterion?
    Yes → Generator-Verifier (wrap a verifier gate around Q2).
    No  → Reconsider — multi-agent without a verifier rarely beats a single capable session here.
```

This is a single-maintainer project. Most coding work is single-session and does not delegate. Delegation triggers below are deliberately narrow.

## Spawn Prompt Contract (mandatory 4 fields)

Every subagent spawn carries all four:

- **Objective:** what, specifically, must the subagent accomplish?
- **Output format:** diff / report / table / verdict — be concrete.
- **Tools to use:** subset of the agent's allowlist to prioritize.
- **Boundaries:** files / modules / workflows the spawn must NOT touch.

Missing any → reject the spawn (or revise before sending). Vague spawns are the #1 multi-agent failure mode.

## Effort Tier (embed in spawn prompt)

| Tier | Use for | Tool calls | Parallel | Model |
|------|---------|------------|----------|-------|
| Simple | Known-answer lookup, mechanical check, single file | 3-10 | 1 | haiku/sonnet |
| Comparison | Multi-file review, weighing 2-4 options | 10-15 each | 2-4 | sonnet |
| Complex | Cross-layer refactor, unknown root cause | 15+ each | up to 5 | sonnet + opus lead |

Complex tier requires explicit team-size justification in the spawn prompt.

## Routing Table

### Mandatory (blocking)

All triggers are **objective and measurable** — no "unfamiliar module" or "if unsure" wording.

| Trigger | Delegate to | Context to pass | Model |
|---------|-------------|-----------------|-------|
| First edit of session in `packages/backend/src/` | Explore agent | Target dir, `docs/architecture.md` | sonnet |
| Change touches ≥3 directories OR ≥5 files | Explore agent + Plan | Changed paths, `docs/architecture.md`, `docs/conventions.md` | sonnet |
| Edit in `packages/backend/migrations/`, `wrangler.toml`, or `.github/workflows/` | Plan agent (impact review before edit) | Target file, recent neighbours, golden principles | sonnet |
| Implementation task ≥3 files from backlog | Implementation subagent | Spec, `docs/conventions.md`, reference files | sonnet |
| After implementation (always, even if direct edit) | `pr-review-toolkit:code-reviewer` or `/codex:review` | Diff, `docs/conventions.md`, golden principles | sonnet |
| Feature complete | Product evaluator (or human) | Done-when criteria, `docs/eval-criteria.md` | opus |

### Background (non-blocking)

| Trigger | Delegate to | Context |
|---------|-------------|---------|
| After commit on a feature branch | Code reviewer (background) | Commit hash, changed files |
| Periodic between features | `bash tools/sweep.sh` | tasks.md / backlog.md paths |

### Escalation

| Trigger | Delegate |
|---------|----------|
| Same failure x2 | `codex:rescue` (second opinion / deep investigation) |
| Plan critique pre-`ExitPlanMode` | `codex:rescue` — "review this plan, flag missing steps / wrong assumptions / risky ordering" |
| Pre-merge sanity on a non-trivial diff | `/codex:review` |

The plan critique above is **spent once approved**. Do not re-route the same plan steps to Codex during implementation; only re-engage if the plan's scope breaks (new file/module not named, plan assumption proven wrong).

## Context Manifest

Pass context via **file paths**, not inline content. Sub-agents start with zero project context.

### Explore agent

- Purpose: orient on a directory or feature before edits.
- Required context: target paths, `docs/architecture.md`, related `services/*-repository.ts` files, recent commits in scope.
- Expected output: short report (≤200 words) — what's there, dependencies, risk areas.

### Plan agent

- Purpose: design changes before any code, especially for migrations / Wrangler config / CI.
- Required context: target file, golden principles, `docs/architecture.md`, related design notes.
- Expected output: stepwise plan with files to touch, ordering, rollback considerations.

### Implementation subagent

- Purpose: write code for a defined slice.
- Required context: sprint contract, `docs/conventions.md`, reference handlers/repos to mirror.
- Expected output: diff or specific edits; no design rationale.

### Code reviewer

- Purpose: catch bugs, convention drift, golden-principle violations on a diff.
- Required context: diff, `docs/conventions.md`, golden principles from `AGENTS.md`.
- Expected output: ranked findings with file:line; verdict (approve / changes).

### Product evaluator

- Purpose: skeptical end-to-end check against `docs/eval-criteria.md` and done-when.
- Required context: feature description, done-when, eval-criteria, access to running app or fixtures.
- Expected output: per-criterion score with evidence, overall verdict, list of findings.

## Model Selection per Role

| Role | Model | Reasoning |
|------|-------|-----------|
| Structural / mechanical checks | haiku | Cheap, fast |
| Code review, exploration, implementation | sonnet | Solid reasoning at a reasonable cost |
| Architecture analysis, deep debugging, product eval | opus | Subjective judgment, multi-step reasoning |
| Sweep / GC | haiku or sonnet | Mostly grep + light judgment |

When in doubt, start with `sonnet`; escalate to `opus` only if quality is insufficient.

## Objective Trigger Design

1. **Countable over judgmental** — "≥3 directories" beats "large change".
2. **Path-based over knowledge-based** — "matches `migrations/`" beats "schema-related".
3. **Session-scoped over lifetime-scoped** — "first edit this session" beats "haven't worked here before".
4. **Threshold-based over binary** — concrete numbers beat yes/no self-assessments.

Anti-patterns ("unfamiliar", "complex", "if unsure", "significant") are rejected because the agent will rationalize past them.

## Workflow → Delegation Mapping

| Workflow | Step | Delegate | Gate |
|----------|------|----------|------|
| `code` | Step 1 (scope check) | Explore / Plan if trigger fires | Mandatory |
| `code` | Step 3 (implement) | Implementation subagent if ≥3 files | Conditional |
| `code` | Step 4 (post-impl QA) | Code reviewer (always) | Mandatory |
| `code` | Step 5 (feature complete) | Product evaluator | Mandatory |
| `plan` | Pre-`ExitPlanMode` | `codex:rescue` plan critique | Mandatory |
| `sweep` | Lint scan | `bash tools/sweep.sh` | Background |

## Applying Sub-Agent Output

- **Structural fix** (typo, missing import) → apply in current cycle.
- **Behavioral change** (new feature, changed logic) → add to `backlog.md`. Never apply directly.
- **Contradicts a design doc** → surface both options to the user; do not pick.

## Handoff Across Sessions

For multi-session work or as context fills, write `handoff-{feature}.md`. The "Next Agent Contract" section mirrors the 4 spawn fields above. Schema in `docs/workflows.md` → "Context Anxiety". Delete on feature completion.
