# System Architecture and Flow

This document explains how the system works end-to-end in plain language.

## What this system does

A real estate agent writes a free-text message in Hebrew.  
The system tries to convert it into valid CRM actions safely.

It does not try to be a chat bot. It is a pipeline that decides:
- What actions can be executed safely.
- What information is missing.
- What clarification should be asked.

## End-to-end chain

1. **Input received**
   - User provides one free-text message.

2. **Parser (LLM)**
   - File: `src/parser/parseMessage.ts`
   - Uses OpenAI `gpt-4o-mini`.
   - Temperature is `0` for deterministic behavior as much as possible.
   - Response format is `json_object`.
   - The system prompt enforces:
     - allowed action types only,
     - required fields expectations,
     - conservative behavior (prefer clarification over guessing).

3. **Normalization inside parser stage**
   - Keeps only supported action types and known fields.
   - Produces:
     - `actions`
     - `missing_info`
     - `clarification_questions`

4. **Validation stage**
   - File: `src/validation/validateParseResult.ts`
   - Enforces strict contracts:
     - `create_or_update_client` requires `data.name`.
     - `create_task` requires `data.title`.
   - Drops unsupported fields.
   - Adds clarification questions if required data is missing.

5. **Execution stage (fake CRM)**
   - Files:
     - `src/orchestrator/executeActions.ts`
     - `src/crm/fakeCrmAdapter.ts`
   - Executes only validated actions.
   - Uses in-memory storage.
   - Returns mock IDs like `client_0001`, `task_0001`.

6. **Response generation**
   - File: `src/response/generateResponse.ts`
   - Returns Hebrew output:
     - clarification if needed,
     - success summary when actions executed,
     - “need more info” when nothing can be done safely.

7. **Pipeline entrypoint**
   - File: `src/pipeline/runCrmAgent.ts`
   - Orchestrates all stages in one function:
     - `runCrmAgent(input: string)`

## LLM usage in this repository

There are currently two LLM roles:

1. **Parser LLM** (runtime)
   - Converts Hebrew free-text into structured action candidates.
   - Must follow strict schema and conservative rules.

2. **Judge LLM** (evaluation only)
   - Files under `src/eval/`
   - Scores parser output quality (`score`, `is_valid`, `issues`, `suggestions`).
   - This is for analysis and iteration, not for runtime decision making.

## Business logic rules (current)

- Only two action types exist in MVP:
  - `create_or_update_client`
  - `create_task`
- Missing required data should lead to clarification, not guessing.
- Unsupported fields are removed during normalization/validation.
- No external CRM calls yet.

## Current strengths

- Clear separation of responsibilities across layers.
- Strong safety posture (conservative assumptions).
- Easy to test via unit tests and CLI demo.
- Quality loop exists via LLM judge evaluation with exportable reports.

## Current weaknesses

- No real persistence (state resets on process restart).
- No real CRM integration yet.
- LLM output can still vary across runs.
- No API/auth/UI delivery layer yet.
- Evaluation depends on an LLM judge, which can also be imperfect.

## MVP phase status

The system is in **backend-core MVP**:
- Parser + validation + fake execution are functional.
- Developer tooling (demo CLI + evaluation runner) is functional.
- Product delivery surfaces (API/UI/integrations/security) are still pending.

In short: the core decision engine is in place, but production integration is not.
