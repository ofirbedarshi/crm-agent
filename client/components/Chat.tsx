import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { apiUrl } from "../src/apiOrigin";
import MessageBubble from "./MessageBubble";

export type Message = {
  role: "user" | "bot";
  text: string;
};

export type ChatTrace = Record<string, unknown>;

const THINKING_TEXT = "חושב...";
const ERROR_TEXT = "קרה משהו, ננסה שוב?";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

interface ChatProps {
  onTraceChange?: (trace: ChatTrace | null) => void;
  messageTraceOpen: boolean;
  onMessageTraceToggle: () => void;
}

function Chat({ onTraceChange, messageTraceOpen, onMessageTraceToggle }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending && !isRecording, [input, isSending, isRecording]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleChatResponse(data: { reply?: string; trace?: ChatTrace; userMessage?: string }) {
    const reply =
      typeof data.reply === "string" && data.reply.trim().length > 0 ? data.reply.trim() : ERROR_TEXT;
    const nextTrace = data.trace && typeof data.trace === "object" ? data.trace : null;
    onTraceChange?.(nextTrace);

    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: "bot", text: reply };
      return updated;
    });
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text },
      { role: "bot", text: THINKING_TEXT },
    ]);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = (await response.json()) as { reply?: string; trace?: ChatTrace };
      handleChatResponse(data);
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

  const startRecording = useCallback(async () => {
    audioChunksRef.current = [];

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }

    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream?.getTracks().forEach((t) => t.stop());
    };

    mediaRecorderRef.current = rec;
    rec.start(250);
    setIsRecording(true);
  }, []);

  const stopRecordingAndSend = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      setIsRecording(false);
      return;
    }

    await new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
      rec.stop();
    });

    mediaRecorderRef.current = null;
    setIsRecording(false);

    const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || "audio/webm" });
    audioChunksRef.current = [];

    if (blob.size === 0) return;

    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", blob, `recording.${ext}`);

    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "🎙 מעבד הקלטה..." },
      { role: "bot", text: THINKING_TEXT },
    ]);

    try {
      const response = await fetch(apiUrl("/api/voice-chat"), {
        method: "POST",
        body: form,
      });

      const data = (await response.json()) as {
        reply?: string;
        trace?: ChatTrace;
        userMessage?: string;
      };

      const transcriptText =
        typeof data.userMessage === "string" && data.userMessage.trim().length > 0
          ? data.userMessage.trim()
          : "🎙 הודעה קולית";

      setMessages((prev) => {
        const updated = [...prev];
        // Replace the interim user bubble with the actual transcript
        updated[updated.length - 2] = { role: "user", text: transcriptText };
        return updated;
      });

      handleChatResponse(data);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMicClick() {
    if (isSending) return;
    if (isRecording) void stopRecordingAndSend();
    else void startRecording();
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
          <button
            type="button"
            className={`chat-mic-button${isRecording ? " chat-mic-button--recording" : ""}`}
            onClick={handleMicClick}
            disabled={isSending}
            aria-label={isRecording ? "עצור הקלטה" : "הקלט הודעה קולית"}
            title={isRecording ? "עצור הקלטה" : "הקלט הודעה קולית"}
          >
            {isRecording ? "⏹" : "🎙"}
          </button>
          <textarea
            className="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="כתבו הודעה..."
            rows={1}
            disabled={isRecording || isSending}
          />
          <button className="chat-send-button" type="submit" disabled={!canSend}>
            שליחה
          </button>
        </form>

        <div className="chat-trace-toggle-row">
          <button
            type="button"
            className={`chat-trace-toggle${messageTraceOpen ? " chat-trace-toggle--on" : ""}`}
            onClick={onMessageTraceToggle}
            aria-pressed={messageTraceOpen}
          >
            {messageTraceOpen
              ? "הסתר לוגים ומסלול עיבוד"
              : "הצגת לוגים ומסלול עיבוד (בעברית)"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default Chat;
