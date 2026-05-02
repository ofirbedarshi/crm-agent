import { randomUUID } from "node:crypto";

export type ChatTranscriptTurn = {
  role: "user" | "bot";
  text: string;
};

const messages: ChatTranscriptTurn[] = [];
let internalSegmentId = randomUUID();

export function getChatTranscriptSnapshot(): ChatTranscriptTurn[] {
  return [...messages];
}

export function appendChatTurns(...turns: ChatTranscriptTurn[]): void {
  messages.push(...turns);
}

/** Clears transcript and rotates segment id (after successful CRM execution). */
export function clearChatTranscriptAndRotateSegment(): void {
  messages.length = 0;
  internalSegmentId = randomUUID();
}

/** Full demo/test reset — same as CRM reset hooks. */
export function resetChatTranscript(): void {
  clearChatTranscriptAndRotateSegment();
}

export function getInternalChatSegmentId(): string {
  return internalSegmentId;
}
