# CLAUDE.md

## 1. Project Rules

- Do NOT add new action types.
- Do NOT change action schema.
- Do NOT expand scope without approval.
- Do NOT refactor unrelated code.

## 2. Development Workflow

Default process:

1. Understand the task.
2. For non-trivial or ambiguous work, propose a short plan.
3. Wait for explicit approval before large or risky changes (new product behavior touching schemas or contracts, multi-file refactors, anything that could surprise in production).
4. Implement in small steps.
5. Explain what was done.

**Straight-to-implement:** Small, clearly scoped follow-ups that finish already-approved work (for example fixing tests or typings after an agreed behavior change), single-file fixes with obvious intent, or documentation that only clarifies existing decisions — summarize intent briefly and implement without waiting for a separate approval round.

## 3. Coding Principles

- Use TypeScript.
- Keep functions small.
- Prefer readability over abstraction.
- Avoid unnecessary layers.

## 4. Testing Rules

- Write tests for all backend logic.
- Mock external services.
- Focus on behavior, not exact output.

## 5. Communication Rules

- If unclear, ask.
- If something is risky, stop and ask.
- Do not assume missing requirements.
