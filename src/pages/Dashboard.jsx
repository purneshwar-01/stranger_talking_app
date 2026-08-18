import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Video,
  SlidersHorizontal,
  Loader2,
  X,
  LogOut,
  Briefcase,
  ShieldCheck,
  PhoneCall,
  MessageSquare,
  Trash2,
  Settings,
  Lock,
  Clock,
  Globe,
  BookOpen,
  Gamepad2,
  Mic,
  Coffee,
  AlertTriangle,
  PlayCircle,
  Check,
  Users,
  PhoneOff,
} from 'lucide-react';
import {
  joinQueue,
  leaveQueue,
  tryMatch,
  listenForMatch,
  listenToWaitingQueue,
  ensureCallRoom,
} from '../lib/matchmaking';
import { getExclusionSet, checkIsBanned } from '../lib/moderation';
import {
  listenToFriends,
  listenToPendingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from '../lib/friends';
import {
  sendCallInvite,
  listenForIncomingCall,
  listenForCallResponse,
  cancelCallInvite,
} from '../lib/directCalls';
import { dmRoomId } from '../lib/dm';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import PrivateRoomModal from '../components/PrivateRoomModal';
import DmDrawer from '../components/DmDrawer';
import IncomingCallModal from '../components/IncomingCallModal';
import SettingsModal from '../components/SettingsModal';
import CallingOverlay from '../components/CallingOverlay';

const POLL_MS = 2000;
const DECLINE_CHIME_URL = 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3';

// Focus Pod modes — professional/student oriented
const FOCUS_MODES = ['professional', 'study', 'language', 'deeptalk'];
// Casual Lounge modes — social / entertainment
const LOUNGE_MODES = ['quicktalk', 'gaming', 'casual', 'voiceonly'];

const MODES = [
  { id: 'quicktalk',    label: 'Quick Talk (5-Min)',    icon: Clock,       description: 'Fast 5-minute timed casual video chat.',           bg: 'bg-amber-50 text-amber-700 border-amber-200',   activeBg: 'bg-amber-500 text-white' },
  { id: 'deeptalk',     label: 'Deep Talk',             icon: MessageSquare, description: 'Meaningful conversations, philosophy & life topics.', bg: 'bg-purple-50 text-purple-700 border-purple-200', activeBg: 'bg-purple-600 text-white' },
  { id: 'professional', label: 'Professional & Tech',   icon: Briefcase,   description: 'Network with developers, founders & creators.',    bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', activeBg: 'bg-indigo-600 text-white' },
  { id: 'language',     label: 'Language Exchange',     icon: Globe,       description: 'Practice English, Spanish, Hindi & world languages.', bg: 'bg-blue-50 text-blue-700 border-blue-200',    activeBg: 'bg-blue-600 text-white' },
  { id: 'study',        label: 'Study & Work Buddy',    icon: BookOpen,    description: 'Focus sessions, co-working & homework partners.',  bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', activeBg: 'bg-emerald-600 text-white' },
  { id: 'gaming',       label: 'Gaming Buddy',          icon: Gamepad2,    description: 'Find co-op, FPS & RPG gaming partners.',          bg: 'bg-rose-50 text-rose-700 border-rose-200',     activeBg: 'bg-rose-600 text-white' },
  { id: 'voiceonly',    label: 'Voice Only',            icon: Mic,         description: 'Mic-only audio call with camera disabled.',       bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',     activeBg: 'bg-cyan-600 text-white' },
  { id: 'casual',       label: 'Casual Coffee',         icon: Coffee,      description: 'Relaxed, open global stranger chat.',             bg: 'bg-slate-100 text-slate-700 border-slate-200', activeBg: 'bg-slate-800 text-white' },
];

// ─── Friend Card ─────────────────────────────────────────────────────────────
function FriendCard({ friend, myUid, unreadCount, onCall, onMessage, onRemove }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 transition">
      {/* Avatar + online dot */}
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
          {friend.username?.charAt(0).toUpperCase() || '?'}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
      </div>

      {/* Name + occupation */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900 truncate">{friend.username}</p>
        <p className="text-[10px] text-indigo-500 truncate">{friend.occupation || 'Friend'}</p>
      </div>

      {/* Action tray — always visible */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onCall(friend)}
          className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white transition"
          title="Direct Call"
        >
          <PhoneCall size={13} />
        </button>

        {/* Message button with unread badge */}
        <button
          onClick={() => onMessage(friend)}
          className="relative p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition"
          title="Direct Message"
        >
          <MessageSquare size={13} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center px-0.5 shadow-sm border border-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onRemove(friend)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
          title="Remove Friend"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Pending Request Card ─────────────────────────────────────────────────────
function RequestCard({ req, onAccept, onReject }) {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const handleAccept = async () => { setAccepting(true); await onAccept(req); setAccepting(false); };
  const handleReject = async () => { setRejecting(true); await onReject(req.id); setRejecting(false); };
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center text-white font-bold text-[11px] shrink-0">
          {req.fromUsername?.charAt(0).toUpperCase() || '?'}
        </div>
        <span className="font-semibold text-slate-800 truncate">{req.fromUsername}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={handleAccept} disabled={accepting || rejecting}
          className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50" title="Accept">
          {accepting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button onClick={handleReject} disabled={accepting || rejecting}
          className="p-1.5 rounded-lg bg-slate-200 text-slate-600 hover:bg-red-500 hover:text-white transition disabled:opacity-50" title="Decline">
          {rejecting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── Call Declined Toast ──────────────────────────────────────────────────────
function DeclineToast({ calleeName, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] animate-slide-down">
      <div className="bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-sans">
        <PhoneOff size={18} className="shrink-0" />
        <div>
          <p className="font-bold text-sm">{calleeName || 'User'} declined your call</p>
          <p className="text-xs text-red-200">They are busy or unavailable right now.</p>
        </div>
        <button onClick={onDismiss} className="ml-2 p-1 rounded-full hover:bg-red-700 transition">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  const [matchMode, setMatchMode]       = useState(profile?.preferredMode || 'professional');
  const [loungeMode, setLoungeMode]     = useState('focus'); // 'focus' | 'casual'
  const [filterGender, setFilterGender] = useState('Any');
  const [searching, setSearching]       = useState(false);
  const [searchStatusText, setSearchStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [friends, setFriends]           = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [privateModalOpen, setPrivateModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [isBanned, setIsBanned]           = useState(false);
  const [dmFriend, setDmFriend]           = useState(null);
  const [incomingCall, setIncomingCall]   = useState(null);
  const [declineToast, setDeclineToast]   = useState(null); // { calleeName }
  const [callingFriend, setCallingFriend] = useState(null); // friend being called — show overlay
  // unreadCounts: { [friendUid]: number }
  const [unreadCounts, setUnreadCounts]   = useState({});

  const pollRef              = useRef(null);
  const unsubRef             = useRef(null);
  const queueUnsubRef        = useRef(null);
  const declineUnsubRef      = useRef(null);
  const navigatedRef         = useRef(false);
  const searchAttemptsRef    = useRef(0);
  // Track which friend's DM is currently open (to suppress their badge)
  const openDmUidRef         = useRef(null);

  const activeModeObj = MODES.find((m) => m.id === matchMode) || MODES[0];

  // ── Cleanup queue on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (user?.uid) leaveQueue(user.uid).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // ── Ban check, friends, pending requests ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    checkIsBanned(user.uid).then(setIsBanned);
    const unsubFriends  = listenToFriends(user.uid, setFriends);
    const unsubRequests = listenToPendingRequests(user.uid, setPendingRequests);
    return () => { unsubFriends(); unsubRequests(); };
  }, [user]);

  // ── DM unread badge counters (one listener per friend) ─────────────────
  useEffect(() => {
    if (!user?.uid || friends.length === 0) return;
    const unsubs = friends.map((friend) => {
      const roomId = dmRoomId(user.uid, friend.uid);
      // Listen to messages from the friend that arrived after we last opened the drawer.
      // We track unread as messages where senderUid !== myUid that we haven't "seen"
      // by proxy: count messages from the friend in the room. Badge clears when drawer opens.
      const q = query(
        collection(db, 'dms', roomId, 'messages'),
        where('senderUid', '==', friend.uid)
      );
      const unsub = onSnapshot(q, (snap) => {
        // If this friend's DM drawer is currently open, count = 0.
        if (openDmUidRef.current === friend.uid) {
          setUnreadCounts((prev) => ({ ...prev, [friend.uid]: 0 }));
          return;
        }
        // Store total count in session; on open we reset to 0.
        // A proper implementation would track a lastRead timestamp in Firestore,
        // but for session-level UX this is sufficient and requires no extra writes.
        setUnreadCounts((prev) => {
          const prevCount = prev[friend.uid] ?? null;
          const newCount  = snap.size;
          // Only increment if new messages arrived since component mount.
          if (prevCount === null) {
            // First snapshot — treat all existing as "read" (were there before open)
            return { ...prev, [friend.uid]: 0, [`_base_${friend.uid}`]: newCount };
          }
          const base = prev[`_base_${friend.uid}`] ?? newCount;
          return { ...prev, [friend.uid]: Math.max(0, newCount - base) };
        });
      }, () => {});
      return unsub;
    });
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, friends]);

  // ── Global incoming call listener ───────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenForIncomingCall(user.uid, setIncomingCall);
    return unsub;
  }, [user?.uid]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => { stopSearching(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Matchmaking helpers ─────────────────────────────────────────────────
  const stopSearching = (removeFromQueue = true) => {
    setSearching(false);
    setSearchStatusText('');
    searchAttemptsRef.current = 0;
    if (pollRef.current)       clearInterval(pollRef.current);
    if (unsubRef.current)      unsubRef.current();
    if (queueUnsubRef.current) queueUnsubRef.current();
    if (declineUnsubRef.current) { declineUnsubRef.current(); declineUnsubRef.current = null; }
    pollRef.current = null; unsubRef.current = null; queueUnsubRef.current = null;
    if (removeFromQueue && user) leaveQueue(user.uid).catch(() => {});
  };

  const goToRoom = (roomId) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    stopSearching(false);
    navigate(`/call/${roomId}?mode=${matchMode}`);
  };

  const startMatch = async () => {
    if (!user || !profile || searching) return;
    if (isBanned || profile.strikeCount >= 3) {
      setErrorMessage('Your account has been suspended due to 3 community policy strikes.');
      return;
    }
    setErrorMessage('');
    navigatedRef.current = false;
    searchAttemptsRef.current = 0;
    setSearching(true);
    setSearchStatusText('Joining matchmaking queue...');
    try {
      const excluded = await getExclusionSet(user.uid);
      await joinQueue({ uid: user.uid, username: profile.username, gender: profile.gender, genderFilter: filterGender, mode: matchMode, occupation: profile.occupation || '', age: profile.age });
      unsubRef.current = listenForMatch(user.uid, (roomId) => goToRoom(roomId), (err) => {
        if (err?.code === 'permission-denied' || err?.code === 'unauthenticated') {
          setErrorMessage('Matchmaking permission error — ensure Firestore rules are deployed.');
          stopSearching(true);
        }
      });
      queueUnsubRef.current = listenToWaitingQueue(() => {});
      const attempt = async () => {
        searchAttemptsRef.current += 1;
        const attempts = searchAttemptsRef.current;
        if (attempts <= 4)      setSearchStatusText(`Looking for a ${activeModeObj.label} partner...`);
        else if (attempts <= 8) setSearchStatusText('Expanding search to nearby modes...');
        else                    setSearchStatusText('Opening to all available strangers...');
        try {
          const roomId = await tryMatch(user.uid, { gender: profile.gender, genderFilter: filterGender, mode: matchMode, excluded, searchAttemptCount: attempts });
          if (roomId) goToRoom(roomId);
        } catch (err) {
          if (err?.code === 'permission-denied' || err?.code === 'unauthenticated') {
            setErrorMessage('Matchmaking cannot create a room. Deploy the Firestore rules and try again.');
            stopSearching(true);
          }
        }
      };
      await attempt();
      pollRef.current = setInterval(attempt, POLL_MS);
    } catch (err) {
      console.error('Start match error:', err);
      setErrorMessage('Failed to start matchmaking. Please try again.');
      stopSearching(true);
    }
  };

  const startPracticeCall = async () => {
    const roomId = `practice_${user.uid}_${Date.now()}`;
    try {
      await ensureCallRoom(roomId, [user.uid], { isPractice: true, createdBy: user.uid });
    } catch (err) {
      setErrorMessage('Failed to open the solo test room. Please try again.');
      return;
    }
    navigate(`/call/${roomId}?mode=${matchMode}`);
  };

  const startDirectCall = async (friend) => {
    const roomId = await sendCallInvite({ callerUid: user.uid, callerName: profile?.username || 'Friend', receiverUid: friend.uid });
    try {
      await ensureCallRoom(roomId, [user.uid, friend.uid], { isDirect: true });
    } catch {
      setErrorMessage('Failed to start direct call. Please try again.');
      return;
    }

    // Show calling overlay — caller stays on dashboard until accept/decline.
    setCallingFriend({ ...friend, roomId });

    // Listen for receiver's response.
    if (declineUnsubRef.current) declineUnsubRef.current();
    declineUnsubRef.current = listenForCallResponse(friend.uid, (status) => {
      if (status === 'declined') {
        if (declineUnsubRef.current) { declineUnsubRef.current(); declineUnsubRef.current = null; }
        cancelCallInvite(friend.uid).catch(() => {});
        try { new Audio(DECLINE_CHIME_URL).play().catch(() => {}); } catch { /* no-op */ }
        setCallingFriend(null);
        setDeclineToast({ calleeName: friend.username });
      } else if (status === 'gone') {
        // Doc deleted = receiver accepted → navigate caller into the room.
        if (declineUnsubRef.current) { declineUnsubRef.current(); declineUnsubRef.current = null; }
        setCallingFriend(null);
        navigate(`/call/${roomId}?mode=direct`);
      }
    });
  };

  const cancelOutgoingCall = () => {
    if (!callingFriend) return;
    if (declineUnsubRef.current) { declineUnsubRef.current(); declineUnsubRef.current = null; }
    cancelCallInvite(callingFriend.uid).catch(() => {});
    setCallingFriend(null);
  };

  const openDm = useCallback((friend) => {
    openDmUidRef.current = friend.uid;
    // Clear badge for this friend instantly.
    setUnreadCounts((prev) => ({ ...prev, [friend.uid]: 0, [`_base_${friend.uid}`]: prev[`_base_${friend.uid}`] ?? 0 }));
    setDmFriend(friend);
  }, []);

  const closeDm = useCallback(() => {
    openDmUidRef.current = null;
    setDmFriend(null);
  }, []);

  const handleAcceptRequest = async (req) => { await acceptFriendRequest(req); };
  const handleLogout = async () => { await stopSearching(true); await logout(); };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900 font-sans">

      {callingFriend && (
        <CallingOverlay friend={callingFriend} onCancel={cancelOutgoingCall} />
      )}

      {/* ── Call Decline Toast ───────────────────────────────────────── */}
      {declineToast && (
        <DeclineToast calleeName={declineToast.calleeName} onDismiss={() => setDeclineToast(null)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-full md:w-80 bg-white border-r border-slate-200/90 p-5 flex flex-col gap-5 shadow-sm">
        {/* Profile summary */}
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              {profile?.username?.charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="font-bold text-slate-900 text-sm truncate">{profile?.username}</h3>
              <ShieldCheck size={13} className="text-emerald-600 shrink-0" title="Verified" />
            </div>
            <p className="text-xs text-indigo-600 font-medium truncate">{profile?.occupation || 'Member'}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
              <span>{profile?.country || 'Global'}</span>
              <span>•</span>
              {profile?.totalChatsCount > 0
                ? <span className="text-emerald-600 font-semibold">{profile.trustScore ?? 100}% Trust</span>
                : <span className="text-slate-400 font-medium">New Member</span>
              }
            </div>
          </div>
        </div>

        {/* Ban alert */}
        {isBanned && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-1">
            <p className="font-bold flex items-center gap-1"><AlertTriangle size={13} /> Account Suspended</p>
            <p className="text-[11px]">3 policy strikes. You cannot match until reviewed.</p>
          </div>
        )}

        {/* Incoming requests */}
        {pendingRequests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center justify-between">
              <span>Friend Requests</span>
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{pendingRequests.length}</span>
            </h4>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
              {pendingRequests.map((req) => (
                <RequestCard key={req.id} req={req} onAccept={handleAcceptRequest} onReject={rejectFriendRequest} />
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-700">
              <Users size={13} className="text-indigo-600" /> Your Friends
            </span>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">{friends.length}</span>
          </h4>

          {friends.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl text-center space-y-1">
              <p className="text-xs font-medium text-slate-600">No friends yet</p>
              <p className="text-[11px] text-slate-400">Click "Add Friend" during any video call to connect!</p>
            </div>
          ) : (
            <div className="space-y-1.5 overflow-y-auto pr-0.5 max-h-64">
              {friends.map((f) => (
                <FriendCard
                  key={f.uid}
                  friend={f}
                  myUid={user.uid}
                  unreadCount={unreadCounts[f.uid] ?? 0}
                  onCall={startDirectCall}
                  onMessage={openDm}
                  onRemove={(f) => removeFriend(user.uid, f.uid)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar bottom actions */}
        <div className="space-y-2 pt-3 border-t border-slate-200/80">
          <button
            onClick={() => setPrivateModalOpen(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <Lock size={13} className="text-indigo-600" /> Private Code Room
          </button>

          {/* ⚙️ Settings button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <Settings size={13} className="text-slate-600" /> Settings
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-red-600 transition py-1"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────────────────────── */}
      <main className="flex-1 p-6 md:p-10 flex flex-col items-center justify-center relative overflow-y-auto">
        <div className="max-w-3xl w-full text-center space-y-8 animate-fade-in">
          {/* ── Focus Pods / Casual Lounge Segmented Toggle ───────────── */}
          <div className="flex items-center justify-center">
            <div className="inline-flex bg-slate-100 border border-slate-200/80 p-1 rounded-2xl gap-1 shadow-inner">
              <button
                onClick={() => { setLoungeMode('focus'); if (!FOCUS_MODES.includes(matchMode)) setMatchMode('professional'); }}
                className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all duration-200 ${
                  loungeMode === 'focus'
                    ? 'bg-white shadow-md text-indigo-700 border border-indigo-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>⚡</span> Focus Pods
                <span className="hidden sm:inline text-[10px] font-medium text-slate-400">
                  {loungeMode === 'focus' && '— Dev, Study, Language'}
                </span>
              </button>
              <button
                onClick={() => { setLoungeMode('casual'); if (!LOUNGE_MODES.includes(matchMode)) setMatchMode('casual'); }}
                className={`px-5 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all duration-200 ${
                  loungeMode === 'casual'
                    ? 'bg-white shadow-md text-amber-700 border border-amber-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>☕</span> Casual Lounge
                <span className="hidden sm:inline text-[10px] font-medium text-slate-400">
                  {loungeMode === 'casual' && '— Social, Games, Banter'}
                </span>
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> Global Stranger &amp; Friends Platform
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Purpose-Based Discovery</h1>
            <p className="text-slate-500 text-sm max-w-lg mx-auto leading-relaxed">
              Select your conversation goal to match with strangers who share the exact same intent.
            </p>
          </div>

          {/* Mode cards — filtered by lounge mode */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
            {MODES.filter((m) =>
              loungeMode === 'focus' ? FOCUS_MODES.includes(m.id) : LOUNGE_MODES.includes(m.id)
            ).map((mode) => {
              const Icon = mode.icon;
              const active = matchMode === mode.id;
              return (
                <button key={mode.id} disabled={searching} onClick={() => setMatchMode(mode.id)}
                  className={`p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between h-32 animate-scale-pop ${active ? `${mode.activeBg} shadow-md scale-[1.03] border-transparent` : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'}`}>
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-xl text-sm ${active ? 'bg-white/20 text-white' : mode.bg}`}><Icon size={16} /></div>
                    {active && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                  </div>
                  <div>
                    <h4 className={`font-bold text-xs ${active ? 'text-white' : 'text-slate-900'}`}>{mode.label}</h4>
                    <p className={`text-[10px] leading-tight mt-1 line-clamp-2 ${active ? 'text-white/80' : 'text-slate-500'}`}>{mode.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filter & CTA */}
          <div className="bg-white border border-slate-200/90 p-8 rounded-3xl shadow-lg space-y-6">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
                <SlidersHorizontal size={13} className="text-indigo-600" />
                <span>Filter Gender:</span>
                <select value={filterGender} disabled={searching}
                  className="bg-transparent text-slate-900 font-bold focus:outline-none disabled:opacity-50 cursor-pointer"
                  onChange={(e) => setFilterGender(e.target.value)}>
                  <option value="Any">Any Gender</option>
                  <option value="Female">Female Only</option>
                  <option value="Male">Male Only</option>
                </select>
              </div>
              <button onClick={startPracticeCall} disabled={searching}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-full border border-indigo-200 transition">
                <PlayCircle size={14} /> Solo Test Call Room
              </button>
            </div>

            {errorMessage && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-xl border border-red-200">{errorMessage}</p>
            )}

            {!searching ? (
              <button onClick={startMatch} disabled={isBanned}
                className="group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white transition-all duration-150 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-2xl shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50">
                <Video className="mr-2.5 group-hover:scale-110 transition" size={21} />
                <span className="text-base tracking-tight">Find Partner for {activeModeObj.label}</span>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-5 py-4">
                {/* Radar pulse animation */}
                <div className="relative flex items-center justify-center w-20 h-20">
                  <span className="absolute w-full h-full rounded-full bg-indigo-400/30 animate-radar" />
                  <span className="absolute w-full h-full rounded-full bg-indigo-400/20 animate-radar-2" />
                  <span className="absolute w-full h-full rounded-full bg-indigo-400/10 animate-radar-3" />
                  <div className="relative z-10 w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/40">
                    <Video size={20} className="text-white" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-indigo-700 font-extrabold text-base tracking-tight">
                    {searchStatusText || `Searching for ${activeModeObj.label} partner...`}
                  </p>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 dot-1" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 dot-2" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 dot-3" />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Tip: Open a second account in <strong>Incognito</strong> to test matching.
                  </p>
                </div>
                <button onClick={() => stopSearching(true)}
                  className="flex items-center gap-2 px-7 py-2.5 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 transition text-sm font-semibold active:scale-95">
                  <X size={14} /> Cancel Search
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modals & Drawers ──────────────────────────────────────────────── */}
      {privateModalOpen && (
        <PrivateRoomModal user={user} profile={profile} onClose={() => setPrivateModalOpen(false)} />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {dmFriend && (
        <DmDrawer myUid={user.uid} friend={dmFriend} onClose={closeDm} />
      )}

      <IncomingCallModal invite={incomingCall} myUid={user?.uid} />
    </div>
  );
}
