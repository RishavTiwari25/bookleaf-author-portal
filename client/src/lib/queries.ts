// Author-side data hooks. Query keys must match the ones useLiveTickets invalidates.
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Book, BookSummary, TicketDetail, TicketSummary } from './types';

export function useBooks() {
  return useQuery({
    queryKey: ['books'],
    queryFn: () => api<{ books: Book[] }>('/books').then((r) => r.books),
  });
}

export function useBookSummary() {
  return useQuery({
    queryKey: ['books', 'summary'],
    queryFn: () => api<BookSummary>('/books/summary'),
  });
}

export function useMyTickets() {
  return useQuery({
    queryKey: ['tickets'],
    queryFn: () => api<{ tickets: TicketSummary[] }>('/tickets').then((r) => r.tickets),
  });
}

export function useMyTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<{ ticket: TicketDetail }>(`/tickets/${id}`).then((r) => r.ticket),
  });
}
