import { useEffect, useRef, useCallback, useState } from 'react';
import {
  joinQueue,
  leaveQueue,
  tryMatch,
  listenForMatch,
  listenToWaitingQueue,
} from '../lib/matchmaking';
import { getExclusionSet } from '../lib/moderation';

const POLL_MS = 2000;

/**
 * useMatchmaker
 *
 * Encapsulates the entire matchmaking lifecycle:
 *   - join / leave queue
 *   - real-time match listener
 *   - polling tryMatch with 3-stage cascade
 *   - beforeunload cleanup so a tab-close removes the user from the queue
 *
 * @param {object} opts
 *   uid          – current user UID
 *   profile      – Firestore user profile object
 *   matchMode    – selected mode string (e.g. 'professional')
 *   filterGender – 'Any' | 'Male' | 'Female'
 *   isBanned     – boolean, prevents queue join
 *   onRoomReady  – callback(roomId) fired the moment a match is found
 *   onError      – callback(message) for user-facing errors
 */
export function useMatchmaker({
  uid,
  profile,
  matchMode,
  filterGender,
  isBanned,
  onRoomReady,
  onError,
}) {
  const [searching, setSearching]         = useState(false);
  const [statusText, setStatusText]       = useState('');

  const pollRef           = useRef(null);
  const matchUnsubRef     = useRef(null);
  const queueUnsubRef     = useRef(null);
  const navigatedRef      = useRef(false);
  const searchAttemptsRef = useRef(0);
  const activeRef         = useRef(false); // true while we own the queue slot

  // ── Internal: tear down everything ─────────────────────────────────────────
  const stopSearching = useCallback((removeFromQueue = true) => {
    activeRef.current = false;
    setSearching(false);
    setStatusText('');
    searchAttemptsRef.current = 0;

    if (pollRef.current)       { clearInterval(pollRef.current); pollRef.current = null; }
    if (matchUnsubRef.current) { matchUnsubRef.current(); matchUnsubRef.current = null; }
    if (queueUnsubRef.current) { queueUnsubRef.current(); queueUnsubRef.current = null; }

    if (removeFromQueue && uid) leaveQueue(uid).catch(() => {});
  }, [uid]);

  // ── Internal: navigate once ─────────────────────────────────────────────
  const handleMatch = useCallback((roomId) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    stopSearching(false); // keep queue doc — server / other user will clean it
    onRoomReady(roomId);
  }, [onRoomReady, stopSearching]);

  // ── Expose: start matching ──────────────────────────────────────────────
  const startSearching = useCallback(async () => {
    if (!uid || !profile || searching) return;
    if (isBanned || profile.strikeCount >= 3) {
      onError?.('Your account has been suspended due to 3 community policy strikes.');
      return;
    }

    setSearching(true);
    activeRef.current = true;
    navigatedRef.current = false;
    searchAttemptsRef.current = 0;
    setStatusText('Joining matchmaking queue…');

    try {
      const excluded = await getExclusionSet(uid);

      await joinQueue({
        uid,
        username:     profile.username,
        gender:       profile.gender,
        genderFilter: filterGender,
        mode:         matchMode,
        occupation:   profile.occupation || '',
        age:          profile.age,
      });

      // Real-time listener: fires if ANOTHER user locks onto us first.
      matchUnsubRef.current = listenForMatch(
        uid,
        (roomId) => handleMatch(roomId),
        (err) => {
          if (err?.code === 'permission-denied' || err?.code === 'unauthenticated') {
            onError?.('Matchmaking permission error — ensure Firestore rules are deployed.');
            stopSearching(true);
          }
        }
      );

      // Informational queue listener (used by Dashboard for waiting count).
      queueUnsubRef.current = listenToWaitingQueue(() => {});

      // Polling: we actively try to lock onto a waiting user.
      const attempt = async () => {
        if (!activeRef.current) return;
        searchAttemptsRef.current += 1;
        const n = searchAttemptsRef.current;

        if (n <= 4)      setStatusText(`Looking for a ${matchMode} partner…`);
        else if (n <= 8) setStatusText('Expanding search to nearby modes…');
        else             setStatusText('Opening to all available strangers…');

        try {
          const roomId = await tryMatch(uid, {
            gender:             profile.gender,
            genderFilter:       filterGender,
            mode:               matchMode,
            excluded,
            searchAttemptCount: n,
          });
          if (roomId) handleMatch(roomId);
        } catch (err) {
          if (err?.code === 'permission-denied' || err?.code === 'unauthenticated') {
            onError?.('Matchmaking cannot create a room. Deploy the Firestore rules first.');
            stopSearching(true);
          }
        }
      };

      await attempt();
      pollRef.current = setInterval(attempt, POLL_MS);

    } catch (err) {
      console.error('[useMatchmaker] startSearching error:', err);
      onError?.('Failed to start matchmaking. Please try again.');
      stopSearching(true);
    }
  }, [uid, profile, searching, isBanned, filterGender, matchMode, handleMatch, onError, stopSearching]);

  // ── beforeunload: clean queue when user closes tab / navigates away ───────
  useEffect(() => {
    const cleanup = () => {
      if (activeRef.current && uid) {
        // Synchronous best-effort — browsers allow a brief window.
        leaveQueue(uid).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  }, [uid]);

  // ── Unmount: always clean up ─────────────────────────────────────────────
  useEffect(() => {
    return () => { stopSearching(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { searching, statusText, startSearching, stopSearching };
}
