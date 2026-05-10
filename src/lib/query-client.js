import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // 'always' = run the queryFn even when navigator.onLine is false.
      // We don't depend on online state for reads — listTasksLocal etc. all
      // read from IndexedDB, so we want them to fire regardless.
      networkMode: 'always',
    },
    mutations: {
      // CRITICAL: default 'online' makes React Query PAUSE mutations when
      // the browser reports offline — mutate() is called but mutationFn
      // never runs until reconnect. That's catastrophic for the event-log
      // architecture: our dispatch() handles offline correctly (queues to
      // outbox locally) and the whole point is that writes should succeed
      // immediately offline. 'always' lets mutationFn fire regardless.
      networkMode: 'always',
    },
  },
});
