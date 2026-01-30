# Agent Instructions

## Git Commits

**CRITICAL**: All git commits in this project MUST follow [Conventional Commits](https://www.conventionalcommits.org/) format.

Format: `<type>: <description>`

Allowed types:
- `feat`: New features or functionality
- `fix`: Bug fixes
- `chore`: Maintenance, config, dependencies, cleanup

Rules:
- No scopes (no parentheses)
- Lowercase type
- No period at end
- Imperative mood (e.g., "add" not "added")
- Keep description concise

Examples:
```
feat: add docker-compose for local development
fix: postgres connection timeout
chore: update dependencies
```

See `.claude/skills/conventional-commits/SKILL.md` for complete details.
