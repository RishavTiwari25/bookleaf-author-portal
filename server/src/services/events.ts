import { EventEmitter } from 'node:events';

export type TicketEventType = 'ticket.created' | 'ticket.updated' | 'ticket.response';

export interface TicketEvent {
  type: TicketEventType;
  ticketId: number;
  /** Used to decide which authors may receive the event. */
  authorId: string;
  /** Internal-note events are only sent to admins. */
  adminOnly?: boolean;
}

/**
 * In-process pub/sub used by the SSE endpoint.
 * Good enough for a single server instance; with several instances this would
 * move to Redis pub/sub or Postgres LISTEN/NOTIFY.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open SSE connection

export function publishTicketEvent(event: TicketEvent) {
  bus.emit('ticket', event);
}

export function subscribeToTicketEvents(listener: (event: TicketEvent) => void): () => void {
  bus.on('ticket', listener);
  return () => bus.off('ticket', listener);
}
