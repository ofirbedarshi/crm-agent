import { createApp } from "./createApp";

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port}`);
});
