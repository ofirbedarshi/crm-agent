import { describe, expect, it } from "vitest";
import {
  appendChatTurns,
  clearChatTranscriptAndRotateSegment,
  getChatTranscriptSnapshot,
  getInternalChatSegmentId,
  resetChatTranscript
} from "./chatTranscriptStore";

describe("chatTranscriptStore", () => {
  it("append then snapshot preserves order", () => {
    resetChatTranscript();
    appendChatTurns({ role: "user", text: "א" }, { role: "bot", text: "ב" });
    expect(getChatTranscriptSnapshot()).toEqual([
      { role: "user", text: "א" },
      { role: "bot", text: "ב" }
    ]);
  });

  it("clear rotates segment id", () => {
    resetChatTranscript();
    const before = getInternalChatSegmentId();
    appendChatTurns({ role: "user", text: "x" });
    clearChatTranscriptAndRotateSegment();
    expect(getChatTranscriptSnapshot()).toHaveLength(0);
    expect(getInternalChatSegmentId()).not.toBe(before);
  });
});
