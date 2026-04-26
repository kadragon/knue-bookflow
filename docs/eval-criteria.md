# Evaluation Criteria

The evaluator is a **separate role** from the generator. The agent that wrote the code does not grade it.

## Why separation matters

Self-evaluators systematically lean toward leniency. An independent evaluator — even with the same model — catches more real defects because it is not motivated to defend prior choices.

## Designing Criteria for This Project

For knue-bookflow features, evaluate on four dimensions. Weights are guidance, not arithmetic — a contract failure on any axis fails the feature.

### 1. Correctness (40%)

Does the feature do what the sprint contract says, end-to-end?

| Score | Description |
|-------|-------------|
| 5 | All contract bullets verified live (or via integration tests against D1/Worker); edge cases (no items, network failure, secret missing) handled. |
| 4 | All contract bullets pass; one minor edge case handled by best-effort defaults. |
| 3 | Happy path works; one edge case is documented as a known gap. |
| 2 | Happy path works only with specific inputs; obvious failure modes not handled. |
| 1 | Core flow does not work end-to-end. |

**How to test:** exercise the endpoint or scheduled trigger; inspect D1 state via `wrangler d1 execute`; check logs.

### 2. Boundary Hygiene (25%)

Does the change respect the layer rules (handlers → services → repositories) and the golden principles?

| Score | Description |
|-------|-------------|
| 5 | All D1 access via repositories; Zod at every API entry; secrets via env binding; migrations append-only. |
| 4 | One small boundary leak with a clear remediation note. |
| 3 | Layering followed but new code copies an existing inconsistency. |
| 2 | Raw `env.DB` use, missing validation, or in-place migration edit. |
| 1 | Hardcoded secret, security regression, or destructive migration. |

**How to test:** grep diff for `env.DB.prepare`; verify Zod presence in new handlers; check migration files are net-new.

### 3. Test & CI (20%)

Are the changes covered, and does the pre-commit / CI gate pass cleanly?

| Score | Description |
|-------|-------------|
| 5 | New tests cover the new behaviour; `bun run lint && bun run typecheck && bun run test` pass; CI green. |
| 4 | Tests cover happy path; pre-commit / CI green; one minor case lacks a test with rationale. |
| 3 | Pre-commit / CI green; coverage relies on existing tests catching regressions. |
| 2 | Pre-commit / CI passes only because of `--no-verify` or similar bypass. |
| 1 | Lint / typecheck / test failing on the branch. |

**How to test:** run the full pre-commit chain; review diff for added test files; confirm CI run on PR.

### 4. Operational Safety (15%)

Will this run safely in production?

| Score | Description |
|-------|-------------|
| 5 | Scheduled work uses `ctx.waitUntil`; structured logs; no new secret without a `wrangler secret put` note in the PR; rollback obvious. |
| 4 | One operational concern noted with a follow-up backlog item. |
| 3 | Code runs but logs are sparse; rollback requires reading code. |
| 2 | New cron / external call without observability or backoff. |
| 1 | Could exhaust the Worker CPU budget, leak credentials, or corrupt D1 state. |

**How to test:** read `scheduled()` path; check logs/traces config; verify any new secret is documented.

## Sprint Contract

Before each implementation cycle, the generator (or orchestrator) writes the contract; the evaluator confirms it is testable BEFORE any code is written.

```markdown
### Sprint Contract: {Feature}

**Generator proposes:**
- I will build: {specific scope}
- Success looks like: {concrete, testable bullets}
- Out of scope: {explicit exclusions}

**Evaluator reviews and confirms:**
- These criteria are testable: yes / no
- Missing acceptance criteria: {list}
- Ambiguous items: {list}

**Agreed contract:**
- [ ] Criterion 1 (testable)
- [ ] Criterion 2
- [ ] Criterion 3
```

For long-running builds where sprint decomposition is overkill, write the contract at the feature level — the discipline of testable bullets matters more than the cadence.

## Calibration Examples

### Score 5 — Correctness

> Implemented `POST /api/planned-loans` with Zod validation, repo write, and a 201 response. Verified locally: missing `bookId` returns 400 with field-level error; valid create persists to D1 and is returned by the next `GET`; race condition with the cron sync handled (idempotent upsert). Integration test added in `__tests__/planned-loans-handler.test.ts`.

**Why 5:** every contract bullet has matching evidence. Edge cases tested, not just claimed.

### Score 2 — Boundary Hygiene

> New handler calls `env.DB.prepare("INSERT INTO planned_loans ...").bind(...).run()` directly instead of going through `planned-loan-repository.ts`. Schema is correct but the layer rule is broken; future schema changes will not propagate.

**Why 2:** golden principle #1 violated. Even though the SQL is correct, this trains the codebase toward inconsistent patterns.

## Pass Threshold

- All criteria ≥ 3 (no axis is broken)
- Weighted score ≥ 3.5
- **Hard gate:** any contract bullet that fails → feature fails, regardless of average

## Evaluator Execution Protocol

1. Read the sprint contract / done-when from `tasks.md` or `backlog.md`.
2. Read this file for grading standards.
3. Read relevant project docs (`docs/architecture.md`, `docs/conventions.md`).
4. Exercise the feature: API call, cron trigger, or code review of the diff.
5. Grade each criterion **with specific evidence** before assigning a score.
6. Below threshold → write findings as new `backlog.md` items → loop back to fix → re-evaluate.
7. All pass → feature done.

## Evaluator Self-Deception

Failure mode: the evaluator finds a real bug, then talks itself down ("minor interaction issue, I'll give it a 4").

Countermeasures:

1. **Grade each criterion independently.** Do not let one criterion's strength excuse another's weakness.
2. **Evidence-first grading.** List specific findings (pass/fail per contract bullet) before assigning a score.
3. **Hard contract gate** (above) — a failed contract bullet fails the feature, full stop.
4. **Penalize known anti-patterns** — raw `env.DB`, hardcoded secrets, edited migrations, swallowed errors. These are automatic score caps regardless of overall polish.

## Tuning

Calibration is iterative. After each evaluation:

1. Read the evaluator's full reasoning trace, not just the final scores.
2. Compare to your own judgment; note divergences.
3. Update the evaluator prompt with specific corrections ("you scored Boundary Hygiene 4 despite a raw `env.DB.prepare` — that's an automatic 2 cap").
4. Repeat until evaluator scores converge with human judgment (typically 3-5 rounds).
