import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import MessageBubble from "./MessageBubble";

export type Message = {
  role: "user" | "bot";
  text: string;
};

export type ChatTrace = Record<string, unknown>;

const THINKING_TEXT = "חושב...";
const ERROR_TEXT = "קרה משהו, ננסה שוב?";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface ChatProps {
  onTraceChange?: (trace: ChatTrace | null) => void;
}

function Chat({ onTraceChange }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    const userMessage: Message = { role: "user", text };
    const thinkingMessage: Message = { role: "bot", text: THINKING_TEXT };

    setInput("");
    setIsSending(true);
    setMessages((prev) => [...prev, userMessage, thinkingMessage]);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = (await response.json()) as { reply?: string; trace?: ChatTrace };
      const reply =
        typeof data.reply === "string" && data.reply.trim().length > 0 ? data.reply.trim() : ERROR_TEXT;
      const nextTrace = data.trace && typeof data.trace === "object" ? data.trace : null;
      onTraceChange?.(nextTrace);

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "bot", text: reply };
        return updated;
      });
    } catch {
      onTraceChange?.(null);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "bot", text: ERROR_TEXT };
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="chat-pane-root" dir="rtl">
      <section className="chat-shell chat-shell-fill">
        <header className="chat-header">CRM Chat</header>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <p className="chat-empty">אפשר להתחיל עם הודעה קצרה ונמשיך משם</p>
          ) : (
            messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}`} role={message.role} text={message.text} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-row" onSubmit={handleSubmit}>
          <textarea
            className="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="כתבו הודעה..."
            rows={1}
          />
          <button className="chat-send-button" type="submit" disabled={!canSend}>
            שליחה
          </button>
        </form>
      </section>
    </main>
  );
}

export default Chat;
