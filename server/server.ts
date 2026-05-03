import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./createApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = createApp();

const clientDist = path.resolve(__dirname, "../client/dist");
const clientIndex = path.join(clientDist, "index.html");
if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(clientIndex);
  });
} else {
  console.warn("client/dist missing — run `npm run build` to serve the web UI from this process.");
}

const port = Number(process.env.PORT ?? 3001);

app.listen(port, "0.0.0.0", () => {
  console.log(`Chat server listening on http://0.0.0.0:${port}`);
});
