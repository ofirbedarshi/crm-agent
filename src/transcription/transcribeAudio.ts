import fs from "node:fs";
import OpenAI from "openai";
import { CLEANUP_SYSTEM, userCleanupMessage } from "./cleanupPrompt";
import { parseCleanupJson } from "./cleanupResponse";
import { applyHebrewPostCorrection } from "./hebrewCorrection";

export interface TranscriptionResult {
  raw_text: string;
  cleaned_text: string;
  confidence_estimate: number;
  unclear_parts: string[];
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

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "he",
  });

  const raw_text = typeof transcription === "string" ? transcription : (transcription.text ?? "");

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_CLEANUP_MODEL ?? "gpt-5",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLEANUP_SYSTEM },
      { role: "user", content: userCleanupMessage(raw_text) },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const { cleaned_text, confidence_estimate, unclear_parts } = parseCleanupJson(content, raw_text);
  const postCorrectedText = applyHebrewPostCorrection(raw_text, cleaned_text);

  return { raw_text, cleaned_text: postCorrectedText, confidence_estimate, unclear_parts };
}
