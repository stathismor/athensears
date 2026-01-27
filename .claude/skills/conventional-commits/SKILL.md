---
name: conventional-commits
description: Enforces conventional commits format for all git commits in this project
user-invocable: false
---

# Conventional Commits Standard

**CRITICAL**: ALL git commits in this project MUST follow the Conventional Commits format.

## Format

```
<type>: <description>
```

## Commit Types

Use one of these types for every commit:

- **feat**: A new feature or functionality
  - Example: `feat: add logout button`
  - Example: `feat: add venue search functionality`

- **fix**: A bug fix
  - Example: `fix: auth error when logging in`
  - Example: `fix: postgres connection timeout`

- **chore**: Maintenance tasks, dependencies, configuration
  - Example: `chore: update dependencies`
  - Example: `chore: remove extra newlines`
  - Example: `chore: configure docker for local development`

## Rules

1. **No scopes**: Keep it simple without parentheses
   - ✅ `feat: add venues API`
   - ❌ `feat(api): add venues`

2. **Lowercase type**: Always use lowercase for the type
   - ✅ `fix: docker build error`
   - ❌ `Fix: docker build error`

3. **No period at end**: Don't end the description with a period
   - ✅ `chore: update lockfile`
   - ❌ `chore: update lockfile.`

4. **Imperative mood**: Use present tense, imperative mood
   - ✅ `feat: add user authentication`
   - ❌ `feat: added user authentication`
   - ❌ `feat: adds user authentication`

5. **Keep it concise**: Description should be clear but brief
   - ✅ `fix: cms startup with postgres`
   - ❌ `fix: fixed the issue where the cms wouldn't start up properly when connecting to postgres database`

## Choosing the Right Type

When analyzing changes to determine the type:

- **feat**: New capabilities, endpoints, features, UI elements
- **fix**: Correcting broken functionality, errors, bugs
- **chore**: Everything else - config, dependencies, cleanup, refactoring, docs

## Implementation

When creating a commit:

1. Analyze the staged changes using `git diff --staged`
2. Determine the primary purpose of the changes
3. Choose the appropriate type (feat, fix, or chore)
4. Write a clear, concise description in imperative mood
5. Format as: `<type>: <description>`
6. Ensure no period at the end

## Examples from This Project

```bash
feat: add docker-compose for local development
fix: pnpm lockfile sync issue
chore: remove version field from docker-compose
feat: add conventional commits skill
fix: strapi database connection
chore: update postgres to version 16
```

Remember: This format makes the commit history scannable and helps with automated changelog generation.
