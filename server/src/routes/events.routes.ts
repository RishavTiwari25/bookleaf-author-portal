import { Router } from 'express';
import { AppError } from '../lib/errors';
import { verifyToken } from '../middleware/auth';
import { subscribeToTicketEvents } from '../services/events';

/**
 * Server-Sent Events stream for live ticket updates.
 * EventSource can't send an Authorization header, so the JWT comes as ?token=.
 * Events only carry the ticket id; clients refetch through the normal (RBAC-checked) API.
 */
export const eventsRouter = Router();

const HEARTBEAT_MS = 25_000; // keeps proxies (e.g. Render) from closing an idle connection

eventsRouter.get('/', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) throw new AppError('UNAUTHORIZED', 'Missing token');
  const user = verifyToken(token);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);

  const unsubscribe = subscribeToTicketEvents((event) => {
    const allowed = user.role === 'ADMIN' || (!event.adminOnly && event.authorId === user.authorId);
    if (!allowed) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify({ ticketId: event.ticketId })}\n\n`);
  });

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
