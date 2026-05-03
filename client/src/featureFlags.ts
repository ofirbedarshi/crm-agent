/**
 * Message pipeline trace pane (third column in chat).
 * - Unset: on in local Vite dev (`import.meta.env.DEV`), off in production builds (e.g. Vercel).
 * - Override: `VITE_SHOW_MESSAGE_TRACE=true` or `false` (string).
 */
const raw = import.meta.env.VITE_SHOW_MESSAGE_TRACE;
export const showMessageTraceUi =
  raw === "true" ? true : raw === "false" ? false : import.meta.env.DEV;
