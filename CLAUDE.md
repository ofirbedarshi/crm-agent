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

## 6. Deployment (Railway)

- Production target is **Railway** only; Vercel artifacts are not used.
- **Ship code:** Usually `git push` to the branch Railway watches (see `railway.toml` + `docs/deploying.md`).
- **CLI deploy from disk:** `npm run deploy:railway` (requires Railway CLI + `railway link`).
- Details, env vars, and health check: **`docs/deploying.md`**.

## 7. CRM pipeline — mandatory resolution order

Backend handling of a single user turn MUST follow this sequence (see `runCrmAgent` + `resolveAndEnrichCrmActions`):

1. **Parse** — LLM outputs candidate `actions` / clarifications (intent + structured fields only).
2. **Validate** — schema, required fields, task/property rules (`validateParseResult`).
3. **Identity resolution** — match people references (client upserts, `client_name` on tasks, `owner_client_name` on properties) against persisted clients + batch overlay; block or clarify on ambiguity (`resolveAndEnrichCrmActions` loop).
4. **Property linkage** — match structured listing references from actions (e.g. `interactions[].property_address`, existing `create_or_update_property`) against persisted properties (CRM SSOT); when interactions tie to exactly one known listing and no property action was emitted, append a consolidated `create_or_update_property` merge (`propertyListingConsolidation.ts`).
5. **Execute** — run validated, resolved actions in linkage order (client → property → task).

**Constraints:**

- Deterministic stages use **structured parser output + CRM snapshot only**. Do not add regex/heuristic re-parsing of raw Hebrew for pipeline decisions (aligned with parser spec).
- Prefer extending **`resolution/`** for new linkage behavior instead of ad hoc hooks after resolve in `runCrmAgent`.
