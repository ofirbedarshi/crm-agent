import fs from "node:fs";
import { Readable } from "node:stream";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { transcriptionsCreate, chatCompletionsCreate } = vi.hoisted(() => ({
  transcriptionsCreate: vi.fn(),
  chatCompletionsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class {
    audio = { transcriptions: { create: transcriptionsCreate } };
    chat = { completions: { create: chatCompletionsCreate } };
  },
}));

describe("transcribeAndCleanupAudioFile", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    transcriptionsCreate.mockReset();
    chatCompletionsCreate.mockReset();
    transcriptionsCreate.mockResolvedValue({ text: "שלום גולמי" });
    chatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              cleaned_text: "שלום",
              confidence_estimate: 0.9,
              unclear_parts: [],
            }),
          },
        },
      ],
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(fs, "createReadStream").mockImplementation(
      () => Readable.from([Buffer.from("fake-audio")]) as fs.ReadStream
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns whisper model, default cleanup model, and latency fields", async () => {
    delete process.env.OPENAI_CLEANUP_MODEL;
    const { transcribeAndCleanupAudioFile, VOICE_TRANSCRIPTION_MODEL } = await import("./transcribeAudio");
    const r = await transcribeAndCleanupAudioFile("/tmp/nonexistent-but-mocked.webm");
    expect(r.raw_text).toBe("שלום גולמי");
    expect(r.transcriptionModel).toBe(VOICE_TRANSCRIPTION_MODEL);
    expect(r.cleanupModel).toBe("gpt-5");
    expect(Number.isFinite(r.transcriptionMs)).toBe(true);
    expect(Number.isFinite(r.cleanupMs)).toBe(true);
    expect(r.transcriptionMs).toBeGreaterThanOrEqual(0);
    expect(r.cleanupMs).toBeGreaterThanOrEqual(0);
    expect(transcriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "whisper-1", language: "he" })
    );
    expect(chatCompletionsCreate).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5" }));
  });

  it("uses OPENAI_CLEANUP_MODEL for correction when set", async () => {
    process.env.OPENAI_CLEANUP_MODEL = "  gpt-4o-mini  ";
    const { transcribeAndCleanupAudioFile } = await import("./transcribeAudio");
    const r = await transcribeAndCleanupAudioFile("/tmp/nonexistent-but-mocked.webm");
    expect(r.cleanupModel).toBe("gpt-4o-mini");
    expect(chatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini" })
    );
  });
});
