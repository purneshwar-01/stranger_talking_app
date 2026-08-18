import { useEffect, useRef } from 'react';
import { leaveQueue } from '../lib/matchmaking';

/**
 * useHeartbeat
 *
 * Registers a `beforeunload` listener that calls leaveQueue so that
 * users who close the tab / refresh are removed from the matchmaking
 * pool immediately, preventing ghost queue entries.
 *
 * Also registers a `visibilitychange` listener: if the tab is hidden
 * for more than HIDDEN_TIMEOUT_MS the slot is released (e.g. phone lock
 * screen, alt-tab). When the tab comes back we do NOT auto-rejoin —
 * the user must click "Find Partner" again, which is intentional UX.
 *
 * @param {string|null} uid           – current Firebase UID
 * @param {boolean}     isSearching   – true only while in the queue
 */

const HIDDEN_TIMEOUT_MS = 30_000; // 30 s hidden = stale slot

export function useHeartbeat(uid, isSearching) {
  const hiddenTimerRef = useRef(null);

  useEffect(() => {
    if (!uid || !isSearching) return;

    // ── beforeunload ────────────────────────────────────────────────────
    const handleUnload = () => {
      leaveQueue(uid).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    // ── visibilitychange ────────────────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Start a timer — if still hidden after timeout, release slot.
        hiddenTimerRef.current = setTimeout(() => {
          leaveQueue(uid).catch(() => {});
        }, HIDDEN_TIMEOUT_MS);
      } else {
        // Tab visible again — cancel the pending release.
        if (hiddenTimerRef.current) {
          clearTimeout(hiddenTimerRef.current);
          hiddenTimerRef.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
    };
  }, [uid, isSearching]);
}
