# CRM Agent MVP

This project turns Hebrew free-text from a real estate workflow into structured CRM actions, validates them, executes them on a fake in-memory CRM, and returns a Hebrew response.

## Current MVP Status

The project is in an **early functional MVP** stage.

What already works:
- OpenAI-based parser (`gpt-4o-mini`) with strict JSON output shape.
- Strict action normalization and validation.
- Fake CRM execution with in-memory IDs and state.
- Hebrew response generation based on executed actions or clarifications.
- CLI demo runner for interactive testing.
- LLM-based evaluation runner for parser quality scoring.

What is intentionally not built yet:
- Real CRM integration (e.g. bmby).
- Database/persistence layer.
- Authentication/authorization.
- Web UI/dashboard integration.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with:

```bash
OPENAI_API_KEY=your_key_here
```

3. Run tests:

```bash
npm test
```

4. Run CLI demo:

```bash
npm run demo
```

5. Run parser evaluation:

```bash
npm run eval:llm
```

## Project Flow (High Level)

The runtime chain is:

`input -> parseMessage -> validateParseResult -> executeActions -> generateResponse`

For a full architecture + business-logic walkthrough, see:

- [System Architecture and Flow](docs/system-architecture-and-flow.md)
- [Product/MVP Spec](docs/crm-agent-spec.md)

## Strengths Today

- Clear, layered pipeline with strict contracts.
- Conservative parser behavior with clarification-first strategy.
- Repeatable evaluation flow with exported reports.
- Easy local demo and test setup.

## Weaknesses / Risks Today

- No persistence (in-memory fake CRM only).
- LLM variability still exists; strict prompt helps but does not eliminate drift.
- No production API/security/monitoring yet.
- Evaluation quality depends on a second LLM judge (not absolute ground truth).
