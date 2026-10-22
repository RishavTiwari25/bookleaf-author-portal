import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tokenStore } from './api';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

const POLL_MS = 30_000;
const RETRY_MS = 5_000;
const EVENTS = ['ticket.created', 'ticket.updated', 'ticket.response'] as const;

/**
 * Keeps ticket data fresh. Listens to the server's SSE stream and refetches
 * the affected queries on each event. It also polls every 30 s as a fallback,
 * in case events are missed while the connection is down.
 *
 * Query keys used across the app:
 *   ['tickets'] / ['ticket', id]                  (author)
 *   ['admin', 'tickets', filters] / ['admin', 'ticket', id] / ['admin', 'stats']
 */
export function useLiveTickets(enabled: boolean): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;

    const refresh = (ticketId?: string) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (ticketId) {
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', ticketId] });
      }
    };

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      const token = tokenStore.get();
      if (!token) return;
      // EventSource can't send an Authorization header, so the JWT goes in the query string.
      source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      source.onopen = () => setStatus('live');
      source.onerror = () => {
        setStatus('reconnecting');
        // The browser retries on its own unless the connection was closed for
        // good (e.g. a 401). In that case, reconnect manually after a delay.
        if (source?.readyState === EventSource.CLOSED && !closed) {
          source.close();
          retryTimer = setTimeout(connect, RETRY_MS);
        }
      };
      for (const name of EVENTS) {
        source.addEventListener(name, (e) => {
          let ticketId: string | undefined;
          try {
            const data = JSON.parse((e as MessageEvent).data) as { ticketId?: string | number };
            // Route params are strings, so normalise to match the ['ticket', id] query keys.
            if (data.ticketId != null) ticketId = String(data.ticketId);
          } catch {
            // malformed payload: still refresh the lists
          }
          refresh(ticketId);
        });
      }
    };

    connect();
    // Polling fallback: only active (mounted) queries actually refetch.
    const poll = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    }, POLL_MS);

    return () => {
      closed = true;
      source?.close();
      clearTimeout(retryTimer);
      clearInterval(poll);
    };
  }, [enabled, queryClient]);

  return status;
}
