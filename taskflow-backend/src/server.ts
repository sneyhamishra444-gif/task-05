import "dotenv/config";
import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`TaskFlow API listening on port ${config.port} (${config.nodeEnv})`);
});
