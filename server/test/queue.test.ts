import { describe, expect, it } from 'vitest';
import { byUrgency } from '../src/services/tickets.service';
import { ticketNumber } from '../src/services/serializers';

type T = Parameters<typeof byUrgency>[0];
const hoursAgo = (h: number) => new Date(Date.now() - h * 36e5);
const ticket = (id: number, priority: T['priority'], status: T['status'], ageHours: number) =>
  ({ id, priority, status, createdAt: hoursAgo(ageHours) }) as T;

describe('urgency sort', () => {
  it('puts unresolved first, then higher priority, then older tickets', () => {
    const tickets = [
      ticket(1, 'LOW', 'OPEN', 100),
      ticket(2, 'CRITICAL', 'RESOLVED', 5),
      ticket(3, 'HIGH', 'OPEN', 2),
      ticket(4, 'HIGH', 'IN_PROGRESS', 50),
      ticket(5, 'CRITICAL', 'OPEN', 1),
    ];
    expect(tickets.sort(byUrgency).map((t) => t.id)).toEqual([5, 4, 3, 1, 2]);
  });
});

describe('ticket numbers', () => {
  it('formats ids as BL-xxxx', () => {
    expect(ticketNumber(42)).toBe('BL-1042');
  });
});
