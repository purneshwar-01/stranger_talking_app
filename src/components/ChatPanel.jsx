import { useEffect, useRef, useState } from 'react';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Send, X, Lock, ShieldAlert } from 'lucide-react';
import { filterText, isPurelyEmpty } from '../lib/textFilter';

export default function ChatPanel({ roomId, uid, username, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  const [snapError, setSnapError] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'calls', roomId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSnapError(null);
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error('[ChatPanel] snapshot error:', err);
        setSnapError('Chat unavailable right now.');
      }
    );
    return unsub;
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [sendError, setSendError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    const raw = text.trim();
    if (!raw) return;

    // Apply moderation filter before persisting.
    const { text: filtered, wasFiltered } = filterText(raw);

    // If the entire message was filtered out, silently reject it.
    if (isPurelyEmpty(filtered)) {
      setSendError('Message blocked by content filter.');
      return;
    }

    setText('');
    setSendError('');
    if (wasFiltered) setSendError('Part of your message was filtered.');

    try {
      await addDoc(collection(db, 'calls', roomId, 'messages'), {
        uid,
        username,
        text: filtered.slice(0, 500),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[ChatPanel] send error:', err);
      setSendError('Message failed. Please try again.');
      setText(raw); // restore so user can retry
    }
  };

  return (
    <div className="absolute right-5 top-20 bottom-24 w-80 bg-white border border-slate-200/90 rounded-3xl flex flex-col overflow-hidden z-20 pointer-events-auto shadow-2xl font-sans text-slate-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
          <Lock size={13} className="text-indigo-600" /> Private Chat
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {snapError && (
          <p className="text-xs text-red-500 text-center mt-6 font-medium">{snapError}</p>
        )}
        {!snapError && messages.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-6">
            Say hi — messages here are private to your call.
          </p>
        )}
        {messages.map((m) => {
          const { text: displayText, wasFiltered } = filterText(m.text);
          return (
            <div key={m.id} className={m.uid === uid ? 'text-right' : 'text-left'}>
              <span
                className={`inline-block px-3 py-2 rounded-2xl max-w-[85%] text-xs font-medium ${
                  m.uid === uid
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 border border-slate-200/80 text-slate-900'
                }`}
              >
                {displayText}
                {wasFiltered && (
                  <ShieldAlert size={10} className="inline ml-1 opacity-50" title="Content filtered" />
                )}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <p className="px-4 pb-1 text-[10px] text-red-500 font-semibold">{sendError}</p>
      )}
      <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-slate-100 bg-white">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-900 font-medium"
        />
        <button type="submit" className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
