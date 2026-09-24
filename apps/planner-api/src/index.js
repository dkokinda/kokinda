import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`planner-api listening on port ${config.port} (auth mode: ${config.graph.authMode})`);
});
