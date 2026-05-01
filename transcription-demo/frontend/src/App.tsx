import { useCallback, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4001";

type TranscribeResponse = {
  raw_text: string;
  cleaned_text: string;
  confidence_estimate?: number;
  unclear_parts?: string[];
};

export default function App() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscribeResponse | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const stopTracks = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);
    chunksRef.current = [];

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("לא ניתן לגשת למיקרופון. אשר הרשאה בדפדפן.");
      return;
    }

    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));

    const rec = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      stopTracks(stream);
      stream = null;
    };

    mediaRef.current = rec;
    rec.start(250);
    setRecording(true);
  }, [stopTracks]);

  const stopRecording = useCallback(async () => {
    const rec = mediaRef.current;
    if (!rec || rec.state === "inactive") {
      setRecording(false);
      return;
    }

    await new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
      rec.stop();
    });

    mediaRef.current = null;
    setRecording(false);

    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
    chunksRef.current = [];

    if (blob.size === 0) {
      setError("לא נקלט אודיו. נסה שוב.");
      return;
    }

    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", blob, `recording.${ext}`);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        body: form,
      });

      const data = (await res.json()) as TranscribeResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || `שגיאת שרת (${res.status})`);
      }

      setResult({
        raw_text: data.raw_text ?? "",
        cleaned_text: data.cleaned_text ?? "",
        confidence_estimate: data.confidence_estimate,
        unclear_parts: data.unclear_parts,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה לא צפויה";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    if (loading) return;
    if (recording) void stopRecording();
    else void startRecording();
  };

  return (
    <main className="shell">
      <header className="header">
        <h1>הדגמת תמלול קולי בעברית</h1>
        <p className="subtitle">הקלטה אחת → תמלול גולמי → ניסוח מנוקה (דמו CRM)</p>
      </header>

      <section className="controls">
        <button
          type="button"
          className={`record-btn ${recording ? "recording" : ""}`}
          onClick={toggle}
          disabled={loading}
          aria-pressed={recording}
        >
          {loading ? "מעבד…" : recording ? "עצור והעלה" : "התחל הקלטה"}
        </button>
        {recording && (
          <span className="pulse" aria-hidden>
            מקליט
          </span>
        )}
      </section>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="banner loading" aria-live="polite">
          שולח לשירות התמלול ומנקה טקסט…
        </div>
      )}

      {result && (
        <section className="results">
          <article className="card">
            <h2>טקסט גולמי (ASR)</h2>
            <p className="text-block">{result.raw_text || "(ריק)"}</p>
          </article>
          <article className="card">
            <h2>טקסט מנוקה</h2>
            <p className="text-block">{result.cleaned_text || "(ריק)"}</p>
          </article>
          {(result.confidence_estimate !== undefined ||
            (result.unclear_parts && result.unclear_parts.length > 0)) && (
            <article className="card meta">
              <h2>מטא-דאטה (בונוס)</h2>
              {result.confidence_estimate !== undefined && (
                <p>
                  <strong>הערכת ביטחון:</strong>{" "}
                  {(result.confidence_estimate * 100).toFixed(0)}%
                </p>
              )}
              {result.unclear_parts && result.unclear_parts.length > 0 && (
                <p>
                  <strong>חלקים לא ברורים:</strong> {result.unclear_parts.join(" · ")}
                </p>
              )}
            </article>
          )}
        </section>
      )}

      <style>{`
        .shell {
          width: min(560px, 100%);
        }
        .header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .header h1 {
          margin: 0 0 0.5rem;
          font-size: 1.5rem;
          font-weight: 700;
        }
        .subtitle {
          margin: 0;
          color: var(--muted);
          font-size: 0.95rem;
        }
        .controls {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .record-btn {
          appearance: none;
          border: none;
          border-radius: 999px;
          padding: 0.85rem 1.75rem;
          font-size: 1rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          background: linear-gradient(145deg, var(--accent), #256bb5);
          color: #fff;
          box-shadow: 0 4px 20px rgba(61, 156, 245, 0.35);
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
        }
        .record-btn:hover:not(:disabled) {
          background: linear-gradient(145deg, var(--accent-hover), #2f7fcf);
          transform: translateY(-1px);
        }
        .record-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .record-btn.recording {
          background: linear-gradient(145deg, var(--danger), #c73e4e);
          box-shadow: 0 4px 20px rgba(240, 98, 114, 0.35);
        }
        .pulse {
          font-size: 0.9rem;
          color: var(--danger);
          font-weight: 600;
          animation: blink 1s ease-in-out infinite;
        }
        @keyframes blink {
          50% {
            opacity: 0.45;
          }
        }
        .banner {
          border-radius: var(--radius);
          padding: 0.85rem 1rem;
          margin-bottom: 1rem;
          font-size: 0.95rem;
          border: 1px solid var(--border);
        }
        .banner.error {
          background: rgba(240, 98, 114, 0.12);
          border-color: rgba(240, 98, 114, 0.35);
          color: #ffb4bc;
        }
        .banner.loading {
          background: rgba(61, 156, 245, 0.1);
          border-color: rgba(61, 156, 245, 0.25);
          color: var(--text);
        }
        .results {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.1rem 1.25rem;
        }
        .card h2 {
          margin: 0 0 0.65rem;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .text-block {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 1.05rem;
          line-height: 1.55;
        }
        .card.meta p {
          margin: 0.35rem 0;
          font-size: 0.95rem;
          color: var(--muted);
        }
        .card.meta strong {
          color: var(--text);
        }
      `}</style>
    </main>
  );
}
