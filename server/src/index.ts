import { config } from './config';
import { createApp } from './app';
import { aiStatus } from './ai';
import { prisma } from './db';

const app = createApp();

const server = app.listen(config.PORT, () => {
  const ai = aiStatus();
  console.log(`BookLeaf portal listening on http://localhost:${config.PORT}`);
  console.log(ai.enabled ? `AI enabled (provider: ${ai.provider}, model: ${ai.model})` : 'AI disabled: running in keyword fallback mode');
});

// Close the DB pool cleanly when Render (or Ctrl+C) stops the process.
const shutdown = () => {
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
