import { Router } from 'express';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import * as tickets from '../services/tickets.service';
import { createTicketSchema, ticketIdParam } from './schemas';

/** Author-facing ticket endpoints. Every service call is scoped to the caller's authorId. */
export const ticketsRouter = Router();
ticketsRouter.use(requireAuth, requireRole('AUTHOR'));

ticketsRouter.post('/', validateBody(createTicketSchema), async (req, res) => {
  const ticket = await tickets.createTicket(currentUser(req), req.body);
  res.status(201).json({ ticket });
});

ticketsRouter.get('/', async (req, res) => {
  res.json({ tickets: await tickets.listAuthorTickets(currentUser(req)) });
});

ticketsRouter.get('/:id', async (req, res) => {
  const ticket = await tickets.getAuthorTicket(currentUser(req), ticketIdParam.parse(req.params.id));
  res.json({ ticket });
});
