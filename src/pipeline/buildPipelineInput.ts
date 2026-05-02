export type PipelineHistoryMessage = {
  role: "user" | "bot";
  text: string;
};

export function historyToText(history: PipelineHistoryMessage[]): string {
  return history.map((item) => `${item.role}: ${item.text}`).join("\n");
}

export function buildPipelineInput(message: string, history: PipelineHistoryMessage[]): string {
  const contextText = historyToText(history);
  if (!contextText) {
    return message;
  }

  return `הקשר שיחה קודם:\n${contextText}\n\nהודעה חדשה:\n${message}`;
}
