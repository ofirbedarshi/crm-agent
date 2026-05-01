import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import fs from "fs";
import multer from "multer";
import OpenAI from "openai";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { CLEANUP_SYSTEM, userCleanupMessage } from "./cleanupPrompt.js";
import { applyHebrewPostCorrection } from "./hebrewCorrection.js";
import { parseCleanupJson } from "./cleanupResponse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
/** Resolve .env next to this package, not process.cwd() (fixes missing OPENAI_API_KEY when cwd differs). */
dotenv.config({ path: path.join(backendRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, "..", ".env") });
dotenv.config({ path: path.join(backendRoot, "..", "..", ".env") });

const PORT = Number(process.env.PORT) || 4001;
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3001";

let openaiSingleton = null;
function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!openaiSingleton) openaiSingleton = new OpenAI({ apiKey: key });
  return openaiSingleton;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || "") || ".webm";
      cb(null, `transcribe-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  const openai = getOpenAI();
  if (!openai) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: "OPENAI_API_KEY is not set" });
    return;
  }

  if (!req.file?.path) {
    res.status(400).json({ error: "Missing audio file (field name: audio)" });
    return;
  }

  const filePath = req.file.path;

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
      language: "he",
    });

    const raw_text =
      typeof transcription === "string" ? transcription : transcription.text || "";

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CLEANUP_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CLEANUP_SYSTEM },
        { role: "user", content: userCleanupMessage(raw_text) },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const { cleaned_text, confidence_estimate, unclear_parts } = parseCleanupJson(
      content,
      raw_text,
    );
    const postCorrectedText = applyHebrewPostCorrection(raw_text, cleaned_text);

    res.json({
      raw_text,
      cleaned_text: postCorrectedText,
      confidence_estimate,
      unclear_parts,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Transcription failed";
    res.status(502).json({ error: message });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

app.listen(PORT, () => {
  console.log(`Transcription demo backend listening on http://localhost:${PORT}`);
});
