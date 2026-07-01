---
name: git-conventions
description: Branch-naming and commit-message conventions for this project. Use whenever creating a git branch or writing a commit message. Branches are named <type>-<short-kebab-desc> (feat-…, fix-…, chore-…); commits follow Conventional Commits as a single one-line "type: description" with no body/description.
user-invocable: false
---

# Git Conventions

**CRITICAL**: All branches and commits in this project follow the conventions below.

## Branches

Name every branch `<type>-<short-kebab-description>` — the same type as the commit, a
hyphen, then a short lowercase kebab-case description:

- `feat-<desc>` — e.g. `feat-venue-search`
- `fix-<desc>` — e.g. `fix-timeout-issue`
- `chore-<desc>` — e.g. `chore-update-deps`

## Commits — Conventional Commits

Follow the Conventional Commits spec: https://www.conventionalcommits.org/en/v1.0.0/

Format is a **single line**: `<type>: <description>`

- **feat** — a new feature or functionality
- **fix** — a bug fix
- **chore** — maintenance, dependencies, config, tooling, refactoring, docs

### Rules

1. **One line only — no body, no extended description.**
2. Lowercase `type`, and no scope (no parentheses).
3. No period at the end.
4. Imperative mood, concise.

### Examples

```
fix: timeout issue
feat: add venue search
chore: update dependencies
```
