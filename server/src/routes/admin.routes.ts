import { Router } from 'express';
import { aiStatus } from '../ai';
import { prisma } from '../db';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import * as tickets from '../services/tickets.service';
import {
  draftSchema,
  noteSchema,
  queueQuerySchema,
  responseSchema,
  ticketIdParam,
  updateTicketSchema,
} from './schemas';

/** Support-team endpoints. Admins can see and act on every ticket. */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/stats', async (_req, res) => {
  res.json({ ...(await tickets.getStats()), aiEnabled: aiStatus().enabled });
});

/** Support team members, for the "assign to" dropdown. */
adminRouter.get('/team', async (_req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  res.json({ admins });
});

adminRouter.get('/tickets', validateQuery(queueQuerySchema), async (req, res) => {
  res.json(await tickets.listQueue(currentUser(req), res.locals.query));
});

adminRouter.get('/tickets/:id', async (req, res) => {
  res.json({ ticket: await tickets.getAdminTicket(ticketIdParam.parse(req.params.id)) });
});

adminRouter.patch('/tickets/:id', validateBody(updateTicketSchema), async (req, res) => {
  const ticket = await tickets.updateTicket(ticketIdParam.parse(req.params.id), req.body);
  res.json({ ticket });
});

adminRouter.post('/tickets/:id/assign-me', async (req, res) => {
  const ticket = await tickets.assignToMe(currentUser(req), ticketIdParam.parse(req.params.id));
  res.json({ ticket });
});

adminRouter.post('/tickets/:id/draft', validateBody(draftSchema), async (req, res) => {
  const draft = await tickets.getDraft(ticketIdParam.parse(req.params.id), req.body.regenerate);
  res.json({ draft });
});

adminRouter.post('/tickets/:id/responses', validateBody(responseSchema), async (req, res) => {
  const { body, usedDraft } = req.body;
  const response = await tickets.addResponse(currentUser(req), ticketIdParam.parse(req.params.id), body, usedDraft);
  res.status(201).json({ response });
});

adminRouter.post('/tickets/:id/notes', validateBody(noteSchema), async (req, res) => {
  const note = await tickets.addInternalNote(currentUser(req), ticketIdParam.parse(req.params.id), req.body.body);
  res.status(201).json({ note });
});
