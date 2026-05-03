import fs from "node:fs";
import OpenAI from "openai";
import { CLEANUP_SYSTEM, userCleanupMessage } from "./cleanupPrompt";
import { parseCleanupJson } from "./cleanupResponse";
import { applyHebrewPostCorrection } from "./hebrewCorrection";

export const VOICE_TRANSCRIPTION_MODEL = "whisper-1" as const;

export function getVoiceCleanupModel(): string {
  return (process.env.OPENAI_CLEANUP_MODEL ?? "gpt-4o").trim();
}

export interface TranscriptionResult {
  raw_text: string;
  cleaned_text: string;
  confidence_estimate: number;
  unclear_parts: string[];
  transcriptionModel: string;
  cleanupModel: string;
  transcriptionMs: number;
  cleanupMs: number;
}

let openaiSingleton: OpenAI | null = null;

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  if (!openaiSingleton) openaiSingleton = new OpenAI({ apiKey: key });
  return openaiSingleton;
}

export async function transcribeAndCleanupAudioFile(filePath: string): Promise<TranscriptionResult> {
  const openai = getOpenAI();
  const cleanupModel = getVoiceCleanupModel();

  const t0 = Date.now();
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: VOICE_TRANSCRIPTION_MODEL,
    language: "he",
  });
  const transcriptionMs = Date.now() - t0;

  const raw_text = typeof transcription === "string" ? transcription : (transcription.text ?? "");

  const c0 = Date.now();
  const completion = await openai.chat.completions.create({
    model: cleanupModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLEANUP_SYSTEM },
      { role: "user", content: userCleanupMessage(raw_text) },
    ],
  });
  const cleanupMs = Date.now() - c0;

  const content = completion.choices[0]?.message?.content ?? "{}";
  const { cleaned_text, confidence_estimate, unclear_parts } = parseCleanupJson(content, raw_text);
  const postCorrectedText = applyHebrewPostCorrection(raw_text, cleaned_text);

  const payload = {
    event: "voice_transcription_complete",
    transcriptionModel: VOICE_TRANSCRIPTION_MODEL,
    cleanupModel,
    transcriptionMs,
    cleanupMs,
    rawCharCount: raw_text.length,
    cleanedCharCount: postCorrectedText.length,
  };
  console.info(`[voice-pipeline] ${JSON.stringify(payload)}`);

  return {
    raw_text,
    cleaned_text: postCorrectedText,
    confidence_estimate,
    unclear_parts,
    transcriptionModel: VOICE_TRANSCRIPTION_MODEL,
    cleanupModel,
    transcriptionMs,
    cleanupMs,
  };
}
