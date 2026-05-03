import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/createApp";

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  (app as (req: IncomingMessage, res: ServerResponse, fn: (err?: unknown) => void) => void)(
    req,
    res,
    (err?: unknown) => {
      if (err && !res.headersSent) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : "Internal Server Error");
      }
    }
  );
}
