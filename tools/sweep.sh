#!/usr/bin/env bash
# sweep.sh — Automated harness garbage collection for knue-bookflow
# Usage:
#   bash tools/sweep.sh             # full sweep
#   bash tools/sweep.sh --quick     # lint scan only

set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ_DIR="$(cd "$TOOLS_DIR/.." && pwd)"

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

FINDINGS=()
QUICK_MODE=false
[[ "${1:-}" == "--quick" ]] && QUICK_MODE=true

cd "$PROJ_DIR"

echo -e "${CYAN}=== Sweep ===${NC}"
echo -e "  Date: $(date '+%Y-%m-%d %H:%M')"

# ── 1. Lint scan ─────────────────────────────────────────────
echo -e "${CYAN}[1/5] Lint scan...${NC}"
if command -v bun >/dev/null 2>&1; then
    if ! bun run lint > /tmp/sweep-lint.$$ 2>&1; then
        # Capture top-level Biome summary
        tail_summary=$(tail -n 5 /tmp/sweep-lint.$$ | tr '\n' ' ')
        FINDINGS+=("[lint] biome check reported issues — see 'bun run lint' (summary: $tail_summary)")
    else
        echo -e "  ${GREEN}biome check clean${NC}"
    fi
    rm -f /tmp/sweep-lint.$$
else
    FINDINGS+=("[harness] bun not found in PATH — cannot run lint")
fi

$QUICK_MODE && {
    if [[ ${#FINDINGS[@]} -eq 0 ]]; then
        echo -e "${GREEN}=== Sweep clean (quick mode) ===${NC}"
        exit 0
    fi
    echo -e "${YELLOW}=== ${#FINDINGS[@]} finding(s) ===${NC}"
    for f in "${FINDINGS[@]}"; do echo "  $f"; done
    exit 1
}

# ── 2. Doc drift check ──────────────────────────────────────
echo -e "${CYAN}[2/5] Doc drift...${NC}"
recent_files=$(git log --since="24 hours ago" --name-only --pretty=format: 2>/dev/null | sort -u | sed '/^$/d') || true
if [[ -n "$recent_files" ]]; then
    drift_hits=0
    while IFS= read -r f; do
        case "$f" in
            packages/backend/migrations/*.sql)
                if ! echo "$recent_files" | grep -q "^docs/architecture.md$"; then
                    FINDINGS+=("[doc] migration $f modified without docs/architecture.md update")
                    drift_hits=$((drift_hits + 1))
                fi
                ;;
            packages/backend/wrangler.toml)
                if ! echo "$recent_files" | grep -q "^docs/runbook.md$"; then
                    FINDINGS+=("[doc] wrangler.toml modified without docs/runbook.md update")
                    drift_hits=$((drift_hits + 1))
                fi
                ;;
        esac
    done <<< "$recent_files"
    [[ $drift_hits -eq 0 ]] && echo -e "  ${GREEN}No drift detected in $(echo "$recent_files" | wc -l | tr -d ' ') recent file(s)${NC}"
else
    echo -e "  ${GREEN}No recent commits${NC}"
fi

# ── 3. Golden principle spot-check ───────────────────────────
echo -e "${CYAN}[3/5] Golden principles...${NC}"
gp_hits=0

# 3a. Raw env.DB.prepare outside the repository layer (golden #1)
raw_db_hits=$(grep -rln --include='*.ts' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=__tests__ \
    'env\.DB\.prepare' packages/backend/src/ 2>/dev/null \
    | grep -v 'services/[a-z-]*-repository\.ts' || true)
if [[ -n "$raw_db_hits" ]]; then
    while IFS= read -r f; do
        FINDINGS+=("[constraint] raw env.DB.prepare outside repository layer: $f")
        gp_hits=$((gp_hits + 1))
    done <<< "$raw_db_hits"
fi

# 3b. Hardcoded telegram / library / aladin tokens (golden #3)
secret_pattern='\b(TELEGRAM_BOT_TOKEN|ALADIN_API_KEY|LIBRARY_PASSWORD)\s*=\s*["'\''][^"'\''$]+["'\'']'
secret_hits=$(grep -rEn --include='*.ts' \
    --exclude-dir=node_modules --exclude-dir=dist \
    "$secret_pattern" packages/ 2>/dev/null || true)
if [[ -n "$secret_hits" ]]; then
    FINDINGS+=("[constraint] possible hardcoded secret(s): $(echo "$secret_hits" | head -3 | tr '\n' '|')")
    gp_hits=$((gp_hits + 1))
fi

[[ $gp_hits -eq 0 ]] && echo -e "  ${GREEN}No golden-principle violations found${NC}"

# ── 4. Harness freshness ────────────────────────────────────
echo -e "${CYAN}[4/5] Harness freshness...${NC}"
harness_issues=0

# Check that all files referenced in AGENTS.md exist
if [[ -f "AGENTS.md" ]]; then
    referenced_docs=""
    while IFS= read -r _line; do
        while [[ "$_line" =~ (docs/[a-zA-Z0-9_./-]+\.(md|txt)) ]]; do
            referenced_docs+="${BASH_REMATCH[1]}"$'\n'
            _line="${_line#*"${BASH_REMATCH[0]}"}"
        done
    done < AGENTS.md
    referenced_docs="${referenced_docs%$'\n'}"
    for doc in $referenced_docs; do
        if [[ ! -f "$doc" ]]; then
            FINDINGS+=("[harness] AGENTS.md references missing file: $doc")
            harness_issues=$((harness_issues + 1))
        fi
    done
fi

for key_doc in docs/architecture.md docs/conventions.md docs/workflows.md docs/delegation.md docs/eval-criteria.md docs/runbook.md; do
    if [[ ! -f "$key_doc" ]]; then
        FINDINGS+=("[harness] Missing key doc: $key_doc")
        harness_issues=$((harness_issues + 1))
    fi
done

# CLAUDE.md pointer invariant
if [[ -f "CLAUDE.md" ]]; then
    claude_trimmed=$(tr -d '[:space:]' < CLAUDE.md)
    if [[ "$claude_trimmed" != "@AGENTS.md" ]]; then
        FINDINGS+=("[harness] CLAUDE.md is not a pure '@AGENTS.md' pointer")
        harness_issues=$((harness_issues + 1))
    fi
fi

# .agents/skills symlink invariant
if [[ ! -L .agents/skills && ! -f .agents/skills ]]; then
    FINDINGS+=("[harness] .agents/skills missing — run scripts/symlink-guard.sh")
    harness_issues=$((harness_issues + 1))
fi

[[ $harness_issues -eq 0 ]] && echo -e "  ${GREEN}All references valid${NC}"

# ── 5. Summary ──────────────────────────────────────────────
echo ""
if [[ ${#FINDINGS[@]} -eq 0 ]]; then
    echo -e "${GREEN}=== Sweep clean ===${NC}"
    # Touch a stamp so SessionStart guards (if added later) can detect cadence
    touch "$TOOLS_DIR/.sweep-stamp"
    exit 0
fi

echo -e "${YELLOW}=== ${#FINDINGS[@]} finding(s) ===${NC}"
for f in "${FINDINGS[@]}"; do echo "  $f"; done

if [[ -f "tasks.md" ]]; then
    echo "" >> tasks.md
    echo "## Sweep $(date '+%Y-%m-%d %H:%M')" >> tasks.md
    for f in "${FINDINGS[@]}"; do
        echo "- [ ] $f" >> tasks.md
    done
    echo -e "${GREEN}Added ${#FINDINGS[@]} item(s) to tasks.md${NC}"
fi

touch "$TOOLS_DIR/.sweep-stamp"
exit 1
