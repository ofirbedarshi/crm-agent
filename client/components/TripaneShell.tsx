import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

const RESIZER_WIDTH = 6;
const MIN_TRACE = 180;
const MIN_CHAT = 220;
const MIN_CRM = 200;
const STORAGE_KEY = "crm-agent-tripane-v1";
const NARROW_MAX_WIDTH_PX = 768;
const MOBILE_MEDIA_QUERY = `(max-width: ${NARROW_MAX_WIDTH_PX}px)`;

type Sizes = { tracePx: number; chatPx: number };
type MobileTab = "trace" | "chat" | "crm";

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

function subscribeNarrowViewport(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getNarrowSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getNarrowServerSnapshot(): boolean {
  return false;
}

function mobileTabOrder(tracePaneVisible: boolean): MobileTab[] {
  return tracePaneVisible ? ["trace", "chat", "crm"] : ["chat", "crm"];
}

function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribeNarrowViewport, getNarrowSnapshot, getNarrowServerSnapshot);
}

interface TripaneShellProps {
  trace: ReactNode | null;
  chat: ReactNode;
  crm: ReactNode;
}

export default function TripaneShell({ trace, chat, crm }: TripaneShellProps) {
  const tracePaneVisible = trace != null;
  const tracePaneVisibleRef = useRef(tracePaneVisible);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [{ tracePx, chatPx }, setSizes] = useState<Sizes>(loadStored);
  const isNarrow = useNarrowViewport();
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const dragRef = useRef<{
    kind: "trace-chat" | "chat-crm";
    startX: number;
    trace0: number;
    chat0: number;
  } | null>(null);

  useEffect(() => {
    tracePaneVisibleRef.current = tracePaneVisible;
  }, [tracePaneVisible]);

  useEffect(() => {
    if (!tracePaneVisible && mobileTab === "trace") {
      setMobileTab("chat");
    }
  }, [tracePaneVisible, mobileTab]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      const el = containerRef.current;
      if (!d || !el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - d.startX;

      if (tracePaneVisibleRef.current) {
        const availPair = Math.max(MIN_TRACE + MIN_CHAT, rect.width - MIN_CRM - 2 * RESIZER_WIDTH - 8);

        if (d.kind === "trace-chat") {
          setSizes(clampTraceChatPair({ trace0: d.trace0, chat0: d.chat0 }, dx, availPair));
          return;
        }

        setSizes((prev) => {
          const maxChat = availPair - prev.tracePx;
          const nextChat = Math.max(MIN_CHAT, Math.min(d.chat0 + dx, maxChat));
          return { tracePx: prev.tracePx, chatPx: Math.round(nextChat) };
        });
        return;
      }

      const availChatOnly = Math.max(MIN_CHAT + MIN_CRM, rect.width - MIN_CRM - RESIZER_WIDTH - 8);
      setSizes((prev) => {
        const nextChat = Math.max(MIN_CHAT, Math.min(d.chat0 + dx, availChatOnly));
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

  function handleMobileTabKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const order = mobileTabOrder(tracePaneVisible);
    const key = e.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") {
      return;
    }
    e.preventDefault();
    const i = order.indexOf(mobileTab);
    let nextIndex = i;
    if (key === "ArrowRight") {
      nextIndex = (i + 1) % order.length;
    } else if (key === "ArrowLeft") {
      nextIndex = (i - 1 + order.length) % order.length;
    } else if (key === "Home") {
      nextIndex = 0;
    } else {
      nextIndex = order.length - 1;
    }
    const next = order[nextIndex];
    setMobileTab(next);
    queueMicrotask(() => {
      document.getElementById(`tab-${next}`)?.focus();
    });
  }

  if (isNarrow) {
    return (
      <div
        ref={containerRef}
        className="app-triple-split app-triple-split--narrow"
        dir="ltr"
        lang="he"
      >
        <div
          className="app-mobile-tabs"
          role="tablist"
          aria-label="מעבר בין אזורי הממשק"
          onKeyDown={handleMobileTabKeyDown}
        >
          {tracePaneVisible ? (
            <button
              type="button"
              id="tab-trace"
              role="tab"
              aria-selected={mobileTab === "trace"}
              aria-controls="panel-trace"
              tabIndex={mobileTab === "trace" ? 0 : -1}
              className={`app-mobile-tab${mobileTab === "trace" ? " app-mobile-tab--active" : ""}`}
              onClick={() => setMobileTab("trace")}
            >
              מעקב
            </button>
          ) : null}
          <button
            type="button"
            id="tab-chat"
            role="tab"
            aria-selected={mobileTab === "chat"}
            aria-controls="panel-chat"
            tabIndex={mobileTab === "chat" ? 0 : -1}
            className={`app-mobile-tab${mobileTab === "chat" ? " app-mobile-tab--active" : ""}`}
            onClick={() => setMobileTab("chat")}
          >
            צ׳אט
          </button>
          <button
            type="button"
            id="tab-crm"
            role="tab"
            aria-selected={mobileTab === "crm"}
            aria-controls="panel-crm"
            tabIndex={mobileTab === "crm" ? 0 : -1}
            className={`app-mobile-tab${mobileTab === "crm" ? " app-mobile-tab--active" : ""}`}
            onClick={() => setMobileTab("crm")}
          >
            CRM
          </button>
        </div>

        <div className="app-mobile-panel-host">
          {tracePaneVisible ? (
            <section
              id="panel-trace"
              role="tabpanel"
              aria-labelledby="tab-trace"
              hidden={mobileTab !== "trace"}
              className="app-pane app-pane-trace app-mobile-tabpanel"
              aria-label="System trace"
            >
              {trace}
            </section>
          ) : null}

          <section
            id="panel-chat"
            role="tabpanel"
            aria-labelledby="tab-chat"
            hidden={mobileTab !== "chat"}
            className="app-pane app-pane-chat app-mobile-tabpanel"
            aria-label="צ׳אט CRM"
          >
            {chat}
          </section>

          <section
            id="panel-crm"
            role="tabpanel"
            aria-labelledby="tab-crm"
            hidden={mobileTab !== "crm"}
            className="app-pane app-pane-crm app-mobile-tabpanel"
            aria-label="הדגמת CRM"
          >
            {crm}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="app-triple-split" dir="ltr" lang="he">
      {tracePaneVisible ? (
        <>
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
        </>
      ) : null}

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
