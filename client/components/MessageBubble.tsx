type MessageBubbleProps = {
  role: "user" | "bot";
  text: string;
};

function MessageBubble({ role, text }: MessageBubbleProps) {
  return (
    <div className={`message-row ${role === "user" ? "message-row-user" : "message-row-bot"}`}>
      <div className={`message-bubble ${role === "user" ? "message-user" : "message-bot"}`}>{text}</div>
    </div>
  );
}

export default MessageBubble;
