import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { emptyCrmDemoState, parseServerDemoPayload } from "./parseServerDemoState";
import type { CrmDemoState } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const POLL_MS = 2000;

interface CrmDemoContextValue extends CrmDemoState {
  pollError: boolean;
  resetDemoData: () => Promise<void>;
}

const CrmDemoContext = createContext<CrmDemoContextValue | null>(null);

export function CrmDemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CrmDemoState>(() => emptyCrmDemoState());
  const [pollError, setPollError] = useState(false);

  const pullState = useCallback(async () => {
    const response = await fetch(`${API_URL}/crm-demo/state`);
    if (!response.ok) {
      throw new Error(`crm-demo/state ${response.status}`);
    }
    const raw: unknown = await response.json();
    setState(parseServerDemoPayload(raw));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        await pullState();
        if (!cancelled) {
          setPollError(false);
        }
      } catch {
        if (!cancelled) {
          setPollError(true);
        }
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pullState]);

  const resetDemoData = useCallback(async () => {
    const response = await fetch(`${API_URL}/crm-demo/reset`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`crm-demo/reset ${response.status}`);
    }
    const raw: unknown = await response.json();
    if (isRecord(raw) && raw.state !== undefined) {
      setState(parseServerDemoPayload(raw.state));
      setPollError(false);
      return;
    }
    await pullState();
  }, [pullState]);

  const value = useMemo<CrmDemoContextValue>(
    () => ({
      ...state,
      pollError,
      resetDemoData
    }),
    [state, pollError, resetDemoData]
  );

  return <CrmDemoContext.Provider value={value}>{children}</CrmDemoContext.Provider>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function useCrmDemo(): CrmDemoContextValue {
  const ctx = useContext(CrmDemoContext);
  if (!ctx) {
    throw new Error("useCrmDemo must be used within CrmDemoProvider");
  }
  return ctx;
}
