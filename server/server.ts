import "dotenv/config";
import cors from "cors";
import express from "express";
import { getDemoCrmState, resetDemoCrmStore } from "../src/crm/demoCrmStore";
import { resetFakeCrm } from "../src/crm/fakeCrmAdapter";
import { runCrmAgent } from "../src/pipeline/runCrmAgent";
import type { CrmPipelineTrace } from "../src/pipeline/trace";

type Message = {
  role: "user" | "bot";
  text: string;
};

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
}

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/crm-demo/state", (_req, res) => {
  res.status(200).json(getDemoCrmState());
});

app.post("/crm-demo/reset", (_req, res) => {
  resetDemoCrmStore();
  resetFakeCrm();
  res.status(200).json({ ok: true, state: getDemoCrmState() });
});

function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { role?: unknown }).role !== undefined &&
    ((value as { role?: unknown }).role === "user" || (value as { role?: unknown }).role === "bot") &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

function normalizeHistory(value: unknown): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isMessage)
    .map((item) => ({
      role: item.role,
      text: item.text.trim()
    }))
    .filter((item) => item.text.length > 0);
}

function historyToText(history: Message[]): string {
  return history.map((item) => `${item.role}: ${item.text}`).join("\n");
}

function buildPipelineInput(message: string, history: Message[]): string {
  const contextText = historyToText(history);
  if (!contextText) {
    return message;
  }

  return `הקשר שיחה קודם:\n${contextText}\n\nהודעה חדשה:\n${message}`;
}

app.post("/chat", async (req, res) => {
  const { message, history }: ChatRequestBody = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ reply: "צריך הודעה כדי שאוכל לעזור" });
  }

  const normalizedMessage = message.trim();
  const normalizedHistory = normalizeHistory(history);

  try {
    const pipelineInput = buildPipelineInput(normalizedMessage, normalizedHistory);
    const result = await runCrmAgent({
      rawMessage: normalizedMessage,
      pipelineInput,
      historyCount: normalizedHistory.length
    });
    const reply = result.response;
    const trace: CrmPipelineTrace = {
      ...result.trace,
      response: result.trace.response
        ? {
            ...result.trace.response,
            formattedReply: reply
          }
        : undefined
    };
    return res.json({ reply, trace });
  } catch (error) {
    const reply = "קרה משהו, ננסה שוב?";
    const trace: CrmPipelineTrace = {
      input: {
        rawMessage: normalizedMessage,
        pipelineInput: buildPipelineInput(normalizedMessage, normalizedHistory),
        historyCount: normalizedHistory.length
      },
      timing: {},
      error: {
        stage: "chat_route",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      response: {
        generatedResponse: reply,
        formattedReply: reply,
        replyType: "fallback"
      }
    };
    return res.status(500).json({ reply, trace });
  }
});

app.listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port}`);
});
