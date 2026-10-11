import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { initSchema } from "./db.js";

env(); // falha logo na subida se faltar variável obrigatória
const port = Number(process.env.PORT ?? 3001);
await initSchema();
createApp().listen(port, () => console.log(`API em http://localhost:${port}`));
