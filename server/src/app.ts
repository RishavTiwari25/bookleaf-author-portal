import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { aiStatus } from './ai';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { adminRouter } from './routes/admin.routes';
import { authRouter } from './routes/auth.routes';
import { booksRouter } from './routes/books.routes';
import { eventsRouter } from './routes/events.routes';
import { ticketsRouter } from './routes/tickets.routes';

const OPENAPI_PATH = path.resolve(__dirname, '../openapi.yaml');
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();

  // CSP is off because swagger-ui and the Vite bundle are served from the same origin;
  // the other helmet headers (nosniff, frameguard, etc.) still apply.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ai: aiStatus() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/books', booksRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/events', eventsRouter);

  const openapi = YAML.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openapi);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'BookLeaf API' }));

  app.use('/api', notFoundHandler);

  // In production the same service serves the React build (one deploy, no CORS).
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
