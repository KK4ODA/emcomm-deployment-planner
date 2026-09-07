import { useCallback, useEffect, useState } from 'react';
import { listIntents, INTENTS_CHANGED_EVENT } from '@/api/assignmentIntents';

/**
 * Queued assignment-status intents (pending and failed), refreshed whenever
 * the outbox changes. Lets screens show "saved on this device" states.
 */
export function useIntents() {
  const [intents, setIntents] = useState(/** @type {Object[]} */ ([]));
  const refresh = useCallback(async () => { setIntents(await listIntents()); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(INTENTS_CHANGED_EVENT, refresh);
    window.addEventListener('online', refresh);
    return () => { window.removeEventListener(INTENTS_CHANGED_EVENT, refresh); window.removeEventListener('online', refresh); };
  }, [refresh]);
  return { intents, pending: intents.filter(i => !i.error), failed: intents.filter(i => i.error), refresh };
}
