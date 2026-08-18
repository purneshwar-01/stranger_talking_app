import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const DMS = 'dms';

/** Deterministic DM room ID — same for both users, no server needed. */
export function dmRoomId(uid1, uid2) {
  return [uid1, uid2].sort().join('_dm_');
}

/** Send a DM message. Creates the parent DM doc if it doesn't exist. */
export async function sendDm(myUid, friendUid, text) {
  if (!myUid || !friendUid || !text?.trim()) return;
  const roomId = dmRoomId(myUid, friendUid);

  // Ensure the parent DM doc exists (needed for Firestore rules).
  await setDoc(
    doc(db, DMS, roomId),
    { participants: [myUid, friendUid], updatedAt: serverTimestamp() },
    { merge: true }
  );

  // Write the message into the sub-collection.
  await addDoc(collection(db, DMS, roomId, 'messages'), {
    senderUid: myUid,
    text: text.trim().slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

/** Load the last N messages for history display. */
export async function loadDmHistory(myUid, friendUid, messageLimit = 50) {
  const roomId = dmRoomId(myUid, friendUid);
  try {
    const snap = await getDocs(
      query(
        collection(db, DMS, roomId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(messageLimit)
      )
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .reverse(); // oldest first
  } catch {
    return [];
  }
}

/** Real-time listener for new DMs. Returns unsubscribe fn. */
export function listenToDm(myUid, friendUid, onMessages) {
  const roomId = dmRoomId(myUid, friendUid);
  const q = query(
    collection(db, DMS, roomId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => onMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('[DM] listener error:', err)
  );
}
