import { config as loadDotenv } from "dotenv";
import cors from "cors";
import express from "express";
import type { Express } from "express";
import fs from "node:fs";
import os from "node:os";
import multer from "multer";
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
import { transcribeAndCleanupAudioFile } from "../src/transcription/transcribeAudio";

interface ChatRequestBody {
  message?: unknown;
}

/**
 * HTTP app for the Express server (local + Railway). JSON routes live under `/api`.
 */
export function createApp(): Express {
  loadDotenv();

  const app = express();
  app.use(cors());
  app.use(express.json());

  const api = express.Router();

  api.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  api.get("/crm-demo-state", (_req, res) => {
    res.status(200).json(getDemoCrmState());
  });

  api.post("/crm-demo-reset", (_req, res) => {
    resetDemoCrmStore();
    resetFakeCrm();
    resetChatTranscript();
    res.status(200).json({ ok: true, state: getDemoCrmState() });
  });

  api.post("/chat", async (req, res) => {
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

  const upload = multer({
    storage: multer.diskStorage({
      destination: os.tmpdir(),
      filename(_req, file, cb) {
        const ext = file.originalname ? file.originalname.replace(/.*(\.[^.]+)$/, "$1") : ".webm";
        cb(null, `transcribe-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  api.post("/voice-chat", upload.single("audio"), async (req, res) => {
    if (!req.file?.path) {
      return res.status(400).json({ error: "Missing audio file (field name: audio)" });
    }

    const filePath = req.file.path;

    try {
      const voiceMeta = await transcribeAndCleanupAudioFile(filePath);
      const { cleaned_text, transcriptionModel, cleanupModel, transcriptionMs, cleanupMs } = voiceMeta;

      const userMessage = cleaned_text.trim();
      if (!userMessage) {
        return res.status(400).json({ error: "Could not extract text from audio" });
      }

      const result = await processDemoChatTurn(userMessage);
      const reply = result.response;
      const crmPipelineMs = result.trace.timing.totalMs ?? 0;
      const voicePipelineMs = transcriptionMs + cleanupMs;
      const trace: CrmPipelineTrace = {
        ...result.trace,
        voice: {
          transcriptionModel,
          cleanupModel,
          transcriptionMs,
          cleanupMs,
        },
        timing: {
          ...result.trace.timing,
          voiceTranscribeMs: transcriptionMs,
          voiceCleanupMs: cleanupMs,
          totalMs: voicePipelineMs + crmPipelineMs,
        },
        response: result.trace.response
          ? { ...result.trace.response, formattedReply: reply }
          : undefined,
      };

      console.info(
        `[voice-pipeline] ${JSON.stringify({
          event: "voice_chat_turn_complete",
          transcriptionModel,
          cleanupModel,
          transcriptionMs,
          cleanupMs,
          voicePipelineMs,
          crmPipelineMs,
          totalMs: trace.timing.totalMs,
        })}`
      );

      return res.json({ reply, trace, segmentId: getInternalChatSegmentId(), userMessage });
    } catch (error) {
      const reply = "קרה משהו, ננסה שוב?";
      const prior = getChatTranscriptSnapshot();
      const trace: CrmPipelineTrace = {
        input: {
          rawMessage: "",
          pipelineInput: buildPipelineInput("", prior),
          historyCount: prior.length,
        },
        timing: {},
        error: {
          stage: "voice_chat_route",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        response: { generatedResponse: reply, formattedReply: reply, replyType: "fallback" },
      };
      return res.status(500).json({ reply, trace, segmentId: getInternalChatSegmentId() });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });

  app.use("/api", api);
  return app;
}
