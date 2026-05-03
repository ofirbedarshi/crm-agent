# CRM Agent Spec

## 1. Product Goal

This project is a system that converts Hebrew free-text into structured CRM actions that can be validated and executed reliably.

## 2. Core Concept

This is **not** a chatbot. It is an **Action Engine** with a strict pipeline:

Input -> Actions -> Execution -> Response

The primary objective is to transform natural-language input into machine-actionable instructions.

## 3. Supported Actions (MVP)

Only the following action types are supported in the MVP:

- `create_or_update_client`
- `create_task`

**DO NOT add more actions.**

## 4. Action Schema

All parser output must follow this exact JSON structure:

```json
{
  "actions": [],
  "missing_info": [],
  "clarification_questions": []
}
```

Rules:

- No guessing critical data.
- Use `clarification_questions` when required details are missing.
- Output must be JSON only.

## 5. Parser Requirements

- Provider: OpenAI
- Model: `gpt-4o`
- Temperature: `0`
- Response format: `json_object`
- Input language support: Hebrew

## 6. Backend Pipeline

The backend flow is:

parse -> validate -> execute -> respond

Each stage has a clear responsibility:

- **parse**: Convert Hebrew free-text into structured action candidates.
- **validate**: Ensure action types and required fields are valid.
- **execute**: Run approved actions through internal execution handlers.
- **respond**: Return execution outcomes and any required follow-up clarification.

### 6.1 Explicit parser sub-pipeline

Inside `parseMessage`, the parser stage is explicit and deterministic:

1. `detectIntent(rawModelJson)`
2. `extractEntities(rawModelJson)`
3. `validateRequiredFields(intent, entities)`
4. `decideOutput(rawModelJson, intent, validation)`

Rules:

- OpenAI output (`rawModelJson`) is the source of truth for interpretation.
- Do not re-parse original input text after model response.
- Do not use regex/heuristics on input for parser pipeline decisions.
- Keep external parser output schema unchanged:
  - `actions`
  - `missing_info`
  - `clarification_questions`
- Optional debug mode may append:
  - `_debug: { intent, entities, validation }`

## 7. Data Rules

Minimal required fields by action type:

- `create_or_update_client`
  - `name` (required)
- `create_task`
  - `title` (required)

If required data is missing, do not infer it. Ask for clarification.

## 8. Testing Strategy

Test behavior should focus on:

- Action types
- Required fields
- Missing data handling

Do **not** test exact JSON string equality as the primary assertion target.

## 9. Logging

The system should log the following for every request:

- `input`
- `parsed_output`
- `validated_actions`
- `execution_results`
- `errors`

These logs are required for traceability, debugging, and parser quality improvement.

Parser-stage logging requirement:

- `STEP 1 - Intent`
- `STEP 2 - Entities`
- `STEP 3 - Validation`
- `STEP 4 - Decision`

## 10. What NOT to Build Yet

- No real CRM integration
- No database
- No authentication
- No complex UI

Keep the scope intentionally narrow during MVP.

## 11. Current Focus

Parser quality is the top priority above all other concerns at this stage.

## 12. Engineering Principles

- Keep it simple.
- Avoid over-engineering.
- Build in small steps.

