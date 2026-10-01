import "dotenv/config";
import { createApp } from "./app.js";
import { initSchema } from "./db.js";

const port = Number(process.env.PORT ?? 3001);
await initSchema();
createApp().listen(port, () => console.log(`API em http://localhost:${port}`));
