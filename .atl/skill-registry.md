# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | ~/.gemini/antigravity/skills/branch-pr/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | ~/.gemini/antigravity/skills/issue-creation/SKILL.md |
| When user says "judgment day", "review adversarial", "dual review", "juzgar" | judgment-day | ~/.gemini/antigravity/skills/judgment-day/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | ~/.gemini/antigravity/skills/skill-creator/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage | go-testing | ~/.gemini/antigravity/skills/go-testing/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue (`Closes #N` / `Fixes #N` / `Resolves #N`)
- Every PR MUST have exactly one `type:*` label
- Branch names: `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`
- Commits: `type(scope): description` — conventional commits only, no `Co-Authored-By`
- PR body: linked issue + type checkbox + summary + changes table + test plan + checklist
- Run `shellcheck` on modified scripts before pushing

### issue-creation
- MUST use a template (bug report or feature request) — blank issues disabled
- Every issue gets `status:needs-review` automatically
- A maintainer MUST add `status:approved` before any PR can be opened
- Questions go to Discussions, not issues
- Search for duplicates before creating

### judgment-day
- Launch TWO judge sub-agents in parallel (async) — never sequential, never self-review
- Judges are blind: neither knows about the other
- Resolve skills from registry before launching judges — inject same `## Project Standards` into both
- WARNING classification: real (normal user can trigger) vs theoretical (contrived scenario)
- Fix only confirmed issues; re-judge after fixes; escalate after 2 iterations if still failing
- NEVER declare APPROVED until re-judgment passes clean

### skill-creator
- Structure: `skills/{skill-name}/SKILL.md` + optional `assets/` and `references/`
- Frontmatter required: name, description (with Trigger), license, metadata.author, metadata.version
- Start with Critical Patterns, use tables for decision trees, keep examples minimal
- References point to LOCAL files, not web URLs
- Register in AGENTS.md after creation

### go-testing
- Use table-driven tests with `t.Run()` for multiple cases
- Test Bubbletea models by calling `Update()` directly with `tea.KeyMsg`
- Use `teatest.NewTestModel()` for integration TUI tests
- Golden file testing: store in `testdata/` directory, use `-update` flag
- Mock system dependencies via interfaces; use `t.TempDir()` for file operations

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| — | — | No project-level convention files found |
