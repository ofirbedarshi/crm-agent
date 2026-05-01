import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const RESIZER_WIDTH = 6;
const MIN_TRACE = 180;
const MIN_CHAT = 220;
const MIN_CRM = 200;
const STORAGE_KEY = "crm-agent-tripane-v1";

type Sizes = { tracePx: number; chatPx: number };

function loadStored(): Sizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { tracePx: 300, chatPx: 380 };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Sizes).tracePx === "number" &&
      typeof (parsed as Sizes).chatPx === "number"
    ) {
      return {
        tracePx: Math.max(MIN_TRACE, (parsed as Sizes).tracePx),
        chatPx: Math.max(MIN_CHAT, (parsed as Sizes).chatPx)
      };
    }
  } catch {
    /* ignore */
  }
  return { tracePx: 300, chatPx: 380 };
}

function persistSizes(s: Sizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function clampTraceChatPair(d: { trace0: number; chat0: number }, dx: number, availableForPair: number): Sizes {
  let t = d.trace0 + dx;
  let c = d.chat0 - dx;
  t = Math.max(MIN_TRACE, t);
  c = Math.max(MIN_CHAT, c);
  if (t + c > availableForPair) {
    const over = t + c - availableForPair;
    const sum = t + c;
    t -= (over * t) / sum;
    c -= (over * c) / sum;
    t = Math.max(MIN_TRACE, t);
    c = Math.max(MIN_CHAT, c);
    if (t + c > availableForPair) {
      c = Math.max(MIN_CHAT, availableForPair - t);
    }
  }
  return { tracePx: Math.round(t), chatPx: Math.round(c) };
}

interface TripaneShellProps {
  trace: ReactNode;
  chat: ReactNode;
  crm: ReactNode;
}

export default function TripaneShell({ trace, chat, crm }: TripaneShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [{ tracePx, chatPx }, setSizes] = useState<Sizes>(loadStored);

  const dragRef = useRef<{
    kind: "trace-chat" | "chat-crm";
    startX: number;
    trace0: number;
    chat0: number;
  } | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      const el = containerRef.current;
      if (!d || !el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const availPair = Math.max(MIN_TRACE + MIN_CHAT, rect.width - MIN_CRM - 2 * RESIZER_WIDTH - 8);
      const dx = e.clientX - d.startX;

      if (d.kind === "trace-chat") {
        setSizes(clampTraceChatPair({ trace0: d.trace0, chat0: d.chat0 }, dx, availPair));
        return;
      }

      setSizes((prev) => {
        const maxChat = availPair - prev.tracePx;
        const nextChat = Math.max(MIN_CHAT, Math.min(d.chat0 + dx, maxChat));
        return { tracePx: prev.tracePx, chatPx: Math.round(nextChat) };
      });
    }

    function onUp() {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      document.body.classList.remove("app-pane-dragging");
      setSizes((s) => {
        persistSizes(s);
        return s;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function startDrag(kind: "trace-chat" | "chat-crm", e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragRef.current = {
      kind,
      startX: e.clientX,
      trace0: tracePx,
      chat0: chatPx
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add("app-pane-dragging");
  }

  return (
    <div ref={containerRef} className="app-triple-split" dir="ltr" lang="he">
      <section
        className="app-pane app-pane-trace"
        style={{ width: tracePx, flex: "0 0 auto" }}
        aria-label="System trace"
      >
        {trace}
      </section>

      <div
        className="app-pane-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="שינוי רוחב בין מעקב מערכת לצ׳אט"
        onPointerDown={(e) => startDrag("trace-chat", e)}
      />

      <section
        className="app-pane app-pane-chat"
        style={{ width: chatPx, flex: "0 0 auto" }}
        aria-label="צ׳אט CRM"
      >
        {chat}
      </section>

      <div
        className="app-pane-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="שינוי רוחב בין צ׳אט להדגמת CRM"
        onPointerDown={(e) => startDrag("chat-crm", e)}
      />

      <section className="app-pane app-pane-crm" aria-label="הדגמת CRM">
        {crm}
      </section>
    </div>
  );
}
