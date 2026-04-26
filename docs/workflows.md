# Workflows

Pick one primary workflow per cycle. Side-effects (e.g. small doc updates while implementing) are allowed where noted.

## `plan` — Spec Generation

Expand a short prompt into a feature spec before any code.

1. Write `docs/design/{feature}.md`: user stories, high-level technical approach, phased task list. **No granular code yet** — errors compound.
2. Get user approval. Do not proceed without it.
3. Generate `backlog.md` items from the approved spec.

Skip `plan` for trivial fixes or single-handler tweaks.

## `code` — Implementation

The primary cycle. Delegation checkpoints are **named steps**, not optional references.

**Step 0 — Branch.** Ensure you are not on `main`. If you are, `git checkout -b <type>/<slug>` first (`feat/`, `fix/`, `chore/`, `harness/`, `deps/`).

**Step 1 — Scope check (delegation gate).** Apply triggers from `docs/delegation.md`:
- First edit of session in `packages/backend/src/`? → Explore agent.
- Touches ≥3 directories or ≥5 files? → Explore + Plan.
- Modifies `migrations/`, `wrangler.toml`, or `.github/workflows/`? → Plan agent (impact review).
- None match? → proceed directly.

**Step 2 — Sprint contract.** Write the "done-when" criteria for this cycle as concrete bullets in `tasks.md` (or in the conversation if no sprint file). Each criterion must be testable. See `docs/eval-criteria.md` → "Sprint Contract".

**Step 3 — Implement.**
- ≤2 files: orchestrator implements directly.
- Larger: delegate to an Implementation agent with the spec, `docs/conventions.md`, and reference files.
- TDD where a test framework already covers the area (most of the backend; frontend logic modules). Otherwise: reference implementation → code → lint/typecheck/test → manual smoke.

**Step 4 — Post-implementation QA (mandatory).** Always delegate verification — the agent that wrote the code does NOT grade it. Use `pr-review-toolkit:code-reviewer`, `/codex:review`, or a fresh subagent. Grade against the sprint contract, not vibes.

**Step 5 — Feature-complete evaluation.** When the backlog item is done, delegate a product evaluation against `docs/eval-criteria.md`. Generator-Evaluator separation is non-negotiable.

`backlog.md` item shape:

```markdown
## Feature Name
> Goal: what and why.
> Design: docs/design/{feature}.md
> Done-when: (concrete acceptance criteria — agreed BEFORE coding)

- [ ] Step 1 — simplest case
- [ ] Step 2 — builds on previous
```

## `draft` — Documentation

Write or update `docs/`. Ground every claim in current code (read it; don't paraphrase memory). Do not modify production code. If the doc reveals a missing constraint, add a `backlog.md` item — don't fix in place.

## `constrain` — Architectural Enforcement

1. Write the structural test, lint pattern, or hook first.
2. Run it.
3. If existing code violates → add remediation to `backlog.md`. Don't fix here.
4. Update `docs/architecture.md` to record the new rule.

## `sweep` — Garbage Collection

Fight entropy between features.

- Run `bash tools/sweep.sh`.
- Findings → `tasks.md` tagged `[doc]`, `[constraint]`, `[debt]`, `[harness]`.
- Fix trivials inline; defer complex ones.
- Periodically (quarterly or post model-upgrade) include the **load-bearing assessment**: for each harness component, ask "is this still compensating for a real model limitation?" Remove or simplify what isn't.

## `explore` — Research

State the question → research / prototype → report options + tradeoffs → **do not commit**. If approved, flow into `plan` or `code`.

## `debate` — Competing Hypotheses (rare)

Adversarial multi-agent root-cause investigation. Only when a high-stakes bug survives one diagnosis pass. Requires Agent Teams. Used <1×/month if at all.

---

## Permitted Side-Effects

| Primary | Permitted side-effect |
|---------|----------------------|
| `code` | Add `[doc]` or `[constraint]` item to `tasks.md` when discovering issues |
| `code` | Update directly-relevant docs after implementation lands |
| `draft` | Add `backlog.md` item if doc reveals missing behavior |
| `sweep` | Fix trivial `[doc]` items inline |

Not permitted: writing production code during `draft` or `sweep`.

---

## Context Anxiety

Models lose coherence on long tasks as context fills. Symptoms: stub implementations of later items, premature "done", noticeable quality drop late-session.

**Countermeasures:**

1. **Reset over compact.** When context fills, prefer a fresh session with a structured handoff to in-place compaction.
2. **Handoff files at the start.** Write `handoff-{feature}.md` when context is fresh and the plan is clear. Schema:
   ```markdown
   # Handoff: {feature}
   ## State
   ## Done so far
   ## Next agent contract
   - Objective:
   - Output format:
   - Tools to use:
   - Boundaries:
   ```
3. **Sprint decomposition** if the model can't sustain >1 hour of coherent work — one feature at a time with QA gates between.
4. **Monitor.** If later items consistently grade lower than earlier ones, add reset points.

## Continuous vs Sprint-Based

| Approach | When | Trade-off |
|----------|------|-----------|
| Sprint-based | Multi-feature build, model fades after ~30-60min | More overhead, sustained quality |
| Continuous | Single feature, capable model | Lower overhead, risks late degradation |

Start continuous; add sprint decomposition only when you observe degradation.

## tasks.md schema (when a sprint is active)

```markdown
# {Sprint title}

status: active | evaluating | done | failed

## Scope
- bullet list of what's in / out

## Acceptance Criteria
- [ ] testable bullet
- [ ] ...

## Evaluator Feedback
(populated by the evaluator at Step 5)
```

`harness-sync` C reconciles `tasks.md` against `backlog.md`. Do not invent fields beyond this schema.
