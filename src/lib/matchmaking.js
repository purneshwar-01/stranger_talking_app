import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const QUEUE = 'matchQueue';
const CALLS  = 'calls';

function queueRef(uid) {
  return doc(db, QUEUE, uid);
}

// ---------------------------------------------------------------------------
// joinQueue — writes the caller into the public waiting pool.
// ---------------------------------------------------------------------------
export async function joinQueue({ uid, username, gender, genderFilter, mode, occupation, age }) {
  await setDoc(queueRef(uid), {
    uid,
    username:     username     || 'Stranger',
    gender:       gender       || 'Any',
    genderFilter: genderFilter || 'Any',
    mode:         mode         || 'casual',
    occupation:   occupation   || '',
    age:          age          || null,
    status:       'waiting',
    roomId:       null,
    matchedWith:  null,
    joinedAt:     serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// leaveQueue — removes the caller from the queue.
// ---------------------------------------------------------------------------
export async function leaveQueue(uid) {
  if (!uid) return;
  await deleteDoc(queueRef(uid)).catch(() => {});
}

// ---------------------------------------------------------------------------
// ensureCallRoom — idempotently creates a /calls/{roomId} document.
// ---------------------------------------------------------------------------
export async function ensureCallRoom(roomId, participants, extraFields = {}) {
  const ref = doc(db, CALLS, roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: participants || [],
      status:       'active',
      createdAt:    serverTimestamp(),
      ...extraFields,
    });
  }
}

// ---------------------------------------------------------------------------
// markCallEnded — sets status:'ended' on the call doc so all participants'
// onSnapshot listeners can detect it and redirect back to dashboard.
// ---------------------------------------------------------------------------
export async function markCallEnded(roomId) {
  if (!roomId) return;
  try {
    await updateDoc(doc(db, CALLS, roomId), {
      status:  'ended',
      endedAt: serverTimestamp(),
    });
  } catch {
    // Doc might not exist for practice rooms — ignore.
  }
}

// ---------------------------------------------------------------------------
// listenForCallEnd — real-time listener on the call doc.
// Fires onEnded() when status becomes 'ended' (the other user hung up).
// Returns unsubscribe fn.
// ---------------------------------------------------------------------------
export function listenForCallEnd(roomId, onEnded) {
  if (!roomId) return () => {};
  return onSnapshot(
    doc(db, CALLS, roomId),
    (snap) => {
      if (snap.exists() && snap.data()?.status === 'ended') {
        onEnded();
      }
    },
    (err) => {
      console.error('[Matchmaking] listenForCallEnd error:', err);
    }
  );
}

// ---------------------------------------------------------------------------
// tryMatch — polling-based candidate search with 3-stage mode cascade.
// ---------------------------------------------------------------------------
export async function tryMatch(uid, { gender, genderFilter, mode, excluded, searchAttemptCount = 0 }) {
  const excludedSet = excluded instanceof Set ? excluded : new Set(excluded || []);
  const myMode = mode || 'casual';

  try {
    const snap = await getDocs(
      query(collection(db, QUEUE), where('status', '==', 'waiting'), limit(80))
    );

    const all = snap.docs
      .map((d) => d.data())
      .filter((c) => c && c.uid && c.uid !== uid && !excludedSet.has(c.uid));

    if (all.length === 0) return null;

    // voiceonly is hermetically isolated at ALL stages.
    function isCompatibleMode(candidateMode) {
      const cm = candidateMode || 'casual';
      if (myMode === 'voiceonly') return cm === 'voiceonly';
      if (cm   === 'voiceonly') return false;

      if (searchAttemptCount <= 4) {
        // Stage 1: exact mode (casual is universal)
        return myMode === 'casual' || cm === 'casual' || cm === myMode;
      }
      // Stage 2 & 3: all non-voiceonly modes are compatible
      return true;
    }

    const modePool = all.filter((c) => isCompatibleMode(c.mode));
    if (modePool.length === 0) return null;

    // Gender filter — both sides must accept each other.
    const myGF = genderFilter || 'Any';
    const myG  = gender       || 'Any';

    const genderPool = modePool.filter((c) => {
      const cGF = c.genderFilter || 'Any';
      const cG  = c.gender       || 'Any';
      const iAccept    = myGF === 'Any' || cG  === myGF;
      const theyAccept = cGF  === 'Any' || myG === cGF;
      return iAccept && theyAccept;
    });

    const finalPool = genderPool.length > 0 ? genderPool : modePool;

    for (const candidate of finalPool) {
      const roomId = await attemptLock(uid, candidate.uid);
      if (roomId) return roomId;
    }
  } catch (err) {
    console.error('[Matchmaking] tryMatch error:', err);
    if (err?.code === 'permission-denied' || err?.code === 'unauthenticated') throw err;
  }

  return null;
}

// ---------------------------------------------------------------------------
// attemptLock — atomic transaction.
// ---------------------------------------------------------------------------
async function attemptLock(myUid, otherUid) {
  const roomId = [myUid, otherUid].sort().join('_');
  try {
    return await runTransaction(db, async (tx) => {
      const otherRef = queueRef(otherUid);
      const meRef    = queueRef(myUid);

      const [otherSnap, meSnap] = await Promise.all([tx.get(otherRef), tx.get(meRef)]);

      if (!otherSnap.exists() || otherSnap.data().status !== 'waiting') {
        throw new Error('candidate-taken');
      }
      if (!meSnap.exists() || meSnap.data().status !== 'waiting') {
        throw new Error('self-taken');
      }

      tx.update(otherRef, { status: 'matched', roomId, matchedWith: myUid });
      tx.update(meRef,    { status: 'matched', roomId, matchedWith: otherUid });
      tx.set(doc(db, CALLS, roomId), {
        participants: [myUid, otherUid],
        status:       'active',
        createdAt:    serverTimestamp(),
      });

      return roomId;
    });
  } catch (err) {
    if (err?.message !== 'candidate-taken' && err?.message !== 'self-taken') {
      console.error('[Matchmaking] Transaction error:', err);
      if (err?.code === 'permission-denied' || err?.code === 'unauthenticated') throw err;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// listenForMatch — real-time listener on OUR queue doc.
// ---------------------------------------------------------------------------
export function listenForMatch(uid, onMatched, onError) {
  return onSnapshot(
    queueRef(uid),
    (snap) => {
      const data = snap.data();
      if (data?.status === 'matched' && data.roomId) {
        onMatched(data.roomId);
      }
    },
    (err) => {
      console.error('[Matchmaking] listenForMatch error:', err);
      if (typeof onError === 'function') onError(err);
    }
  );
}

// ---------------------------------------------------------------------------
// listenToWaitingQueue — informational real-time snapshot.
// ---------------------------------------------------------------------------
export function listenToWaitingQueue(onUpdate) {
  const q = query(collection(db, QUEUE), where('status', '==', 'waiting'), limit(80));
  return onSnapshot(
    q,
    (snap) => { onUpdate(snap.docs.map((d) => d.data())); },
    (err) => { console.warn('[Matchmaking] listenToWaitingQueue error:', err); }
  );
}

// ---------------------------------------------------------------------------
// getCallParticipants — one-time read of participants for a room.
// ---------------------------------------------------------------------------
export async function getCallParticipants(roomId) {
  try {
    const snap = await getDoc(doc(db, CALLS, roomId));
    return snap.exists() ? snap.data().participants || [] : [];
  } catch {
    return [];
  }
}
