# Hebrew Voice Transcription Demo

Standalone demo: record Hebrew audio → Whisper ASR → GPT cleanup.

## Prerequisites

- Node.js 18+
- OpenAI API key with access to Whisper and chat models

## Setup

```bash
cd transcription-demo/backend
cp .env.example .env
# Edit .env and set OPENAI_API_KEY

npm install

cd ../frontend
npm install
```

## Run

**Terminal 1 — backend (port 4001)**

```bash
cd transcription-demo/backend
npm run dev
```

**Terminal 2 — frontend (port 3001)**

```bash
cd transcription-demo/frontend
npm run dev
```

Open http://localhost:3001

## API

`POST http://localhost:4001/transcribe`

- Body: `multipart/form-data` with field `audio` (file blob from recorder)

Response JSON:

```json
{
  "raw_text": "...",
  "cleaned_text": "...",
  "confidence_estimate": 0.85,
  "unclear_parts": []
}
```

`confidence_estimate` and `unclear_parts` are heuristic estimates from the cleanup step, not ASR probabilities.
