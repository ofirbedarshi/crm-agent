/** API origin without trailing slash. Empty string = same origin (typical single Railway service). */
export function getApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }
  return "";
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiOrigin()}${normalized}`;
}
