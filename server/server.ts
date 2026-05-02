import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  getChatTranscriptSnapshot,
  getInternalChatSegmentId,
  resetChatTranscript
} from "../src/chat/chatTranscriptStore";
import { processDemoChatTurn } from "../src/chat/processDemoChatTurn";
import { getDemoCrmState, resetDemoCrmStore } from "../src/crm/demoCrmStore";
import { resetFakeCrm } from "../src/crm/fakeCrmAdapter";
import { buildPipelineInput } from "../src/pipeline/buildPipelineInput";
import type { CrmPipelineTrace } from "../src/pipeline/trace";

interface ChatRequestBody {
  message?: unknown;
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
  resetChatTranscript();
  res.status(200).json({ ok: true, state: getDemoCrmState() });
});

app.post("/chat", async (req, res) => {
  const { message }: ChatRequestBody = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ reply: "צריך הודעה כדי שאוכל לעזור" });
  }

  const normalizedMessage = message.trim();

  try {
    const result = await processDemoChatTurn(normalizedMessage);
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
    return res.json({
      reply,
      trace,
      segmentId: getInternalChatSegmentId()
    });
  } catch (error) {
    const reply = "קרה משהו, ננסה שוב?";
    const prior = getChatTranscriptSnapshot();
    const trace: CrmPipelineTrace = {
      input: {
        rawMessage: normalizedMessage,
        pipelineInput: buildPipelineInput(normalizedMessage, prior),
        historyCount: prior.length
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
    return res.status(500).json({ reply, trace, segmentId: getInternalChatSegmentId() });
  }
});

app.listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port}`);
});
