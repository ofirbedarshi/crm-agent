import "dotenv/config";
import cors from "cors";
import express from "express";
import { runCrmAgent } from "../src/pipeline/runCrmAgent";
import type { CrmPipelineTrace } from "../src/pipeline/trace";
import type { ParseMessageResult, SupportedAction } from "../src/types/parser";

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

function actionToSentence(action: SupportedAction): string {
  if (action.type === "create_task") {
    const taskFor = action.data.client_name ? ` עבור ${action.data.client_name}` : "";
    const due = action.data.due_time ? ` ל${action.data.due_time}` : "";
    return `יצרתי משימה${taskFor}${due}: ${action.data.title}`;
  }

  const roleText =
    action.data.role === "buyer" ? " כרוכש" : action.data.role === "owner" ? " כבעל נכס" : "";
  return `עדכנתי את פרטי הלקוח ${action.data.name}${roleText}`;
}

function missingInfoToQuestion(missingInfo: string[]): string {
  const key = missingInfo[0];
  if (key === "name") {
    return "חסר לי פרט קטן, מה השם המלא של הלקוח?";
  }
  if (key === "title") {
    return "חסר לי פרט קטן, מה המשימה המדויקת שצריך לבצע?";
  }
  return "חסר לי פרט קטן כדי להמשיך, אפשר לחדד?";
}

function formatResponse(result: ParseMessageResult): string {
  if (result.actions.length > 0) {
    if (result.actions.length === 1) {
      return actionToSentence(result.actions[0]);
    }
    return "הבנתי את הבקשה וביצעתי את הפעולות שצריך";
  }

  if (result.clarification_questions.length > 0) {
    return result.clarification_questions[0] ?? "אפשר לחדד רגע את הבקשה?";
  }

  if (result.missing_info.length > 0) {
    return missingInfoToQuestion(result.missing_info);
  }

  return "לא בטוח שהבנתי עד הסוף, אפשר לחדד?";
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
    const reply = formatResponse(result.parsed);
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
