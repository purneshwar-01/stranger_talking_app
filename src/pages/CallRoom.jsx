import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import {
  Sparkles,
  MessageCircle,
  Flag,
  X,
  UserPlus,
  Check,
  Briefcase,
  ShieldCheck,
  Zap,
  Clock,
  Lock,
  Monitor,
  FileText,
} from 'lucide-react';
import { leaveQueue, getCallParticipants, markCallEnded, listenForCallEnd } from '../lib/matchmaking';
import { blockUser, reportUser } from '../lib/moderation';
import { sendFriendRequest, checkIsFriend, checkPendingRequest } from '../lib/friends';
import ChatPanel from '../components/ChatPanel';
import ReportModal from '../components/ReportModal';
import FeedbackModal from '../components/FeedbackModal';
import NetworkingModal from '../components/NetworkingModal';

const SERVER_URL = import.meta.env.VITE_SERVER_URL;
const DEV_APP_ID = Number(import.meta.env.VITE_ZEGO_DEV_APP_ID);
const DEV_SERVER_SECRET = import.meta.env.VITE_ZEGO_DEV_SERVER_SECRET;

const QUICK_TALK_SECONDS = 5 * 60; // 5 mins

export default function CallRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'casual';
  const isPrivateRoom = roomId?.startsWith('private_') || mode === 'group';

  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const recognitionRef = useRef(null);
  const zpRef = useRef(null);
  const cleanedUpRef    = useRef(false);
  const leaveTargetRef  = useRef(null);
  const exitHandledRef  = useRef(false);
  const remoteEndRef    = useRef(false); // prevents double-exit if we triggered the end
  const END_CHIME       = 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3';

  const [icebreaker, setIcebreaker]     = useState('');
  const [subtitle, setSubtitle]         = useState('');
  const [otherUid, setOtherUid]         = useState(null);
  const [otherProfile, setOtherProfile] = useState(null);
  const [chatOpen, setChatOpen]         = useState(false);
  const [reportOpen, setReportOpen]     = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [friendStatus, setFriendStatus] = useState('none');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [timeLeft, setTimeLeft]         = useState(mode === 'quicktalk' ? QUICK_TALK_SECONDS : null);
  const [callError, setCallError]       = useState('');
  // Privacy Shield: blur overlay for first 3 seconds
  const [privacyShield, setPrivacyShield] = useState(true);
  const [shieldCountdown, setShieldCountdown] = useState(3);
  // Professional tools
  const [screenSharing, setScreenSharing] = useState(false);
  const [notesOpen, setNotesOpen]         = useState(false);
  const [notes, setNotes]                 = useState('');
  // Networking modal
  const [networkingOpen, setNetworkingOpen] = useState(false);

  const stopStreamTracks = useCallback((stream) => {
    stream?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        /* best effort */
      }
    });
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      /* recognition may already be stopped */
    }
    recognitionRef.current = null;
  }, []);

  const cleanupCallResources = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    stopRecognition();

    const zp = zpRef.current;
    zpRef.current = null;

    try {
      stopStreamTracks(zp?.localStream);
    } catch {
      /* SDK stream may already be gone */
    }

    const mediaElements = containerRef.current?.querySelectorAll('video, audio') || [];
    mediaElements.forEach((element) => {
      const mediaStream = element.srcObject;
      stopStreamTracks(mediaStream);
      try {
        element.pause?.();
      } catch {
        /* no-op */
      }
      try {
        element.srcObject = null;
      } catch {
        /* no-op */
      }
      element.removeAttribute('src');
    });

    try {
      zp?.hangUp?.();
    } catch {
      /* already left */
    }

    try {
      zp?.destroy?.();
    } catch {
      /* already destroyed */
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, [stopRecognition, stopStreamTracks]);

  const finishRoomExit = useCallback(
    (target) => {
      if (exitHandledRef.current) return;
      exitHandledRef.current = true;

      if (target === 'feedback' && !isPrivateRoom) {
        setFeedbackOpen(true);
        return;
      }

      // Show networking modal before navigating (only for matched calls, not practice)
      if (!roomId?.startsWith('practice_')) {
        setNetworkingOpen(true);
        return;
      }

      navigate('/dashboard');
    },
    [isPrivateRoom, navigate, roomId]
  );

  const leaveCall = useCallback(
    (target) => {
      leaveTargetRef.current = target;
      // Mark the call as ended in Firestore so the other participant
      // gets redirected immediately via their onSnapshot listener.
      if (!remoteEndRef.current && !roomId?.startsWith('practice_')) {
        markCallEnded(roomId).catch(() => {});
      }
      cleanupCallResources();
      finishRoomExit(target);
    },
    [cleanupCallResources, finishRoomExit, roomId]
  );

  // Clean up queue entry — dep on uid string not user object to avoid
  // firing on every Firebase token refresh (user object identity changes).
  useEffect(() => {
    if (user?.uid) leaveQueue(user.uid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Load participant details & friend status
  useEffect(() => {
    if (!user) return;
    (async () => {
      const participants = await getCallParticipants(roomId);
      const other = participants.find((id) => id !== user.uid);
      setOtherUid(other || null);

      if (other) {
        const snap = await getDoc(doc(db, 'users', other));
        if (snap.exists()) {
          setOtherProfile(snap.data());
        }

        const isFriend = await checkIsFriend(user.uid, other);
        if (isFriend) {
          setFriendStatus('friends');
        } else {
          const pending = await checkPendingRequest(user.uid, other);
          if (pending) setFriendStatus('pending');
        }
      }
    })();
  }, [roomId, user]);

  // 5-Minute Timer for Quick Talk
  useEffect(() => {
    if (mode !== 'quicktalk' || timeLeft === null) return;
    if (timeLeft <= 0) {
      leaveCall('feedback');
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearInterval(timer);
  }, [leaveCall, mode, timeLeft]);

  // ── Remote call-end detection ─────────────────────────────────────────
  // If the OTHER user leaves first, the call doc status flips to 'ended'.
  // We catch it here and redirect immediately with a toast-like chime.
  useEffect(() => {
    if (!roomId || roomId.startsWith('practice_')) return;
    const unsub = listenForCallEnd(roomId, () => {
      if (exitHandledRef.current || remoteEndRef.current) return;
      remoteEndRef.current = true;
      try { new Audio(END_CHIME).play().catch(() => {}); } catch { /* no-op */ }
      cleanupCallResources();
      // Skip feedback + networking modal on remote-initiated exit — go straight home.
      navigate('/dashboard');
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Privacy Shield ────────────────────────────────────────────────────
  useEffect(() => {
    if (!privacyShield) return;
    let remaining = 3;
    setShieldCountdown(remaining);
    const tick = setInterval(() => {
      remaining -= 1;
      setShieldCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(tick);
        setPrivacyShield(false);
      }
    }, 1000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Video call setup via ZegoUIKit — GroupCall for Private Rooms, 1-on-1 for Random Match
  useEffect(() => {
    if (!user || !containerRef.current) return;
    cleanedUpRef.current = false;
    leaveTargetRef.current = null;
    exitHandledRef.current = false;
    setCallError('');

    let cancelled = false;

    const initZego = async () => {
      let kitToken;

      try {
        if (SERVER_URL) {
          const res = await fetch(`${SERVER_URL}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: user.uid, username: profile?.username, roomId }),
          });
          if (res.ok) {
            const data = await res.json();
            kitToken = data.token;
          } else {
            console.warn(`Falling back to dev token because /token failed with status ${res.status}.`);
          }
        }

        if (!kitToken) {
          if (!DEV_APP_ID || !DEV_SERVER_SECRET) {
            throw new Error('No valid Zego token source is available.');
          }
          kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
            DEV_APP_ID,
            DEV_SERVER_SECRET,
            roomId,
            user.uid,
            profile?.username || 'Stranger'
          );
        }

        if (cancelled) return;

        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;

        const callScenario = isPrivateRoom
          ? { mode: ZegoUIKitPrebuilt.GroupCall }
          : { mode: ZegoUIKitPrebuilt.OneONoneCall };

        zp.joinRoom({
          container: containerRef.current,
          sharedLinks: [{ name: 'Room Link', url: window.location.href }],
          scenario: callScenario,
          // Disable duplicate Zego chat & unnecessary features
          showTextChat: false,
          showInRoomMessageButton: false,
          showScreenSharingButton: false,
          showPreJoinView: false,
          showUserList: false,
          turnOnCameraWhenJoining: profile?.cameraDefaultOn !== false && mode !== 'voiceonly',
          turnOnMicrophoneWhenJoining: true,
          onLeaveRoom: () => {
            const target = leaveTargetRef.current || (isPrivateRoom ? 'dashboard' : 'feedback');
            cleanupCallResources();
            finishRoomExit(target);
          },
          branding: { logoURL: '' },
        });
      } catch (err) {
        console.error('Zego video call error:', err);
        if (!cancelled) {
          setCallError('Unable to connect to this room right now. Please try matching again.');
        }
      }
    };

    initZego();
    return () => {
      cancelled = true;
      cleanupCallResources();
    };
  }, [roomId, user, profile, mode, isPrivateRoom, cleanupCallResources, finishRoomExit]);

  // Live mic captioning
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      setSubtitle(r[0].transcript);
    };
    recognition.onend = () => {
      try {
        recognition.start();
      } catch {
        /* intentional */
      }
    };
    try {
      recognition.start();
    } catch {
      /* mic permission */
    }
    recognitionRef.current = recognition;

    return stopRecognition;
  }, [stopRecognition]);

  const handleAddFriend = async () => {
    if (!otherUid || friendStatus !== 'none' || sendingRequest) return;
    setSendingRequest(true);
    try {
      await sendFriendRequest({
        fromUid: user.uid,
        fromUsername: profile?.username || 'Stranger',
        toUid: otherUid,
      });
      setFriendStatus('pending');
    } catch (err) {
      console.error('Failed to send friend request:', err);
    }
    setSendingRequest(false);
  };

  const handleSkip = () => {
    leaveCall(isPrivateRoom ? 'dashboard' : 'feedback');
  };

  const finishFeedbackAndLeave = () => {
    cleanupCallResources();
    navigate('/dashboard');
  };

  const generateIcebreaker = async () => {
    if (SERVER_URL) {
      try {
        const res = await fetch(`${SERVER_URL}/icebreaker`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            myInterests: profile?.interests || [],
            otherInterests: otherProfile?.interests || [],
          }),
        });
        const data = await res.json();
        if (data.question) {
          setIcebreaker(data.question);
          return;
        }
      } catch {
        /* fallback */
      }
    }
    const FALLBACK = [
      "What's a project or topic you're passionate about?",
      'If you could teleport anywhere right now, where to?',
      "What's the best advice you've ever received?",
      'Do you think AI will change your daily work in 5 years?',
    ];
    setIcebreaker(FALLBACK[Math.floor(Math.random() * FALLBACK.length)]);
  };

  const handleReportSubmit = async ({ reason, details, alsoBlock }) => {
    await reportUser({ reporterUid: user.uid, reportedUid: otherUid, roomId, reason, details });
    if (alsoBlock && otherUid) await blockUser(user.uid, otherUid);
    setReportOpen(false);
    cleanupCallResources();
    navigate('/dashboard');
  };

  const formatTimer = (secs) => {
    if (secs === null) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Screen Share toggle
  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen share: replace screen stream with camera
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const videoTracks = cameraStream.getVideoTracks();
        const sender = zpRef.current?.localStream?.getVideoTracks?.()[0];
        if (sender) {
          zpRef.current.localStream.removeTrack(sender);
          sender.stop();
        }
        videoTracks.forEach((t) => zpRef.current?.localStream?.addTrack?.(t));
      } catch { /* best effort */ }
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = () => setScreenSharing(false);
        // Replace camera track in Zego local stream
        const existingTrack = zpRef.current?.localStream?.getVideoTracks?.()[0];
        if (existingTrack) {
          zpRef.current.localStream.removeTrack(existingTrack);
          existingTrack.stop();
        }
        zpRef.current?.localStream?.addTrack?.(screenTrack);
        setScreenSharing(true);
      } catch (err) {
        if (err.name !== 'NotAllowedError') console.error('Screen share error:', err);
      }
    }
  };

  return (
    <div className="w-screen h-screen bg-slate-900 relative overflow-hidden flex items-center justify-center font-sans text-slate-900">
      <div className="absolute inset-0 w-full h-full" ref={containerRef} />

      {/* ── Pre-Call Privacy Shield ─────────────────────────────────────── */}
      {privacyShield && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-2xl bg-slate-900/60">
          {/* Frosted glass card */}
          <div className="bg-white/10 border border-white/20 rounded-3xl px-10 py-8 text-center shadow-2xl space-y-4 max-w-sm w-full mx-4 backdrop-blur-md">
            {/* Animated shield icon */}
            <div className="relative mx-auto w-20 h-20">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/40">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              {/* Countdown ring */}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white flex items-center justify-center border-2 border-indigo-500 shadow font-black text-indigo-700 text-xs">
                {shieldCountdown}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-white/60 uppercase tracking-wider">Privacy Shield Active</p>
              <h3 className="text-xl font-extrabold text-white mt-1">Camera Protected</h3>
              <p className="text-xs text-white/50 mt-1">
                Your camera is blurred for {shieldCountdown}s. Tap below to reveal earlier.
              </p>
            </div>

            <button
              onClick={() => setPrivacyShield(false)}
              className="w-full py-3 rounded-xl bg-white text-slate-900 font-extrabold text-sm hover:bg-slate-100 transition shadow-md active:scale-95"
            >
              Reveal Now 👁️
            </button>
          </div>
        </div>
      )}

      {callError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="max-w-sm rounded-3xl border border-red-200 bg-white p-6 text-center shadow-2xl space-y-4">
            <p className="text-base font-bold text-slate-900">Room connection failed</p>
            <p className="text-sm text-slate-500">{callError}</p>
            <button
              onClick={() => finishRoomExit('dashboard')}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Top Controls Header */}
      <div className="absolute top-5 left-5 right-5 flex justify-between items-center pointer-events-none z-10">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="bg-white/90 border border-slate-200 px-4 py-2 rounded-full backdrop-blur-md shadow-md flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              {isPrivateRoom ? <Lock size={13} className="text-indigo-600" /> : null}
              {isPrivateRoom ? 'PRIVATE CODE ROOM' : `${mode.toUpperCase()} MODE`}
            </span>
          </div>

          {timeLeft !== null && (
            <div className="bg-amber-500 text-white font-black px-3.5 py-1.5 rounded-full shadow-md text-xs flex items-center gap-1.5">
              <Clock size={14} /> {formatTimer(timeLeft)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 pointer-events-auto">
          {/* Add Friend Button */}
          {otherUid && (
            <button
              onClick={handleAddFriend}
              disabled={friendStatus !== 'none' || sendingRequest}
              className={`px-4 py-2 rounded-full font-bold text-xs flex items-center gap-1.5 border transition shadow-md ${
                friendStatus === 'friends'
                  ? 'bg-emerald-500 text-white border-transparent'
                  : friendStatus === 'pending'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent'
              }`}
            >
              {friendStatus === 'friends' ? (
                <>
                  <Check size={14} /> Friends
                </>
              ) : friendStatus === 'pending' ? (
                <>
                  <Check size={14} /> Request Sent
                </>
              ) : (
                <>
                  <UserPlus size={14} /> Add Friend
                </>
              )}
            </button>
          )}

          {/* SKIP / NEXT BUTTON */}
          {!isPrivateRoom && (
            <button
              onClick={handleSkip}
              className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs px-4 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95"
              title="Skip to next stranger"
            >
              <Zap size={14} /> Skip Stranger
            </button>
          )}

          <button
            onClick={() => setChatOpen((v) => !v)}
            className="bg-white/90 border border-slate-200 p-2.5 rounded-full hover:bg-white text-slate-700 shadow-md transition"
            title="In-App Chat"
          >
            <MessageCircle size={18} />
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`p-2.5 rounded-full border shadow-md transition ${
              screenSharing
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-white'
            }`}
            title={screenSharing ? 'Stop Sharing' : 'Share Screen'}
          >
            <Monitor size={18} />
          </button>

          {/* Quick Notes */}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className={`p-2.5 rounded-full border shadow-md transition ${
              notesOpen
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-white'
            }`}
            title="Quick Notes / Code Scratchpad"
          >
            <FileText size={18} />
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="bg-white/90 border border-slate-200 p-2.5 rounded-full hover:bg-red-50 text-red-600 shadow-md transition"
            title="Report & Add Strike"
          >
            <Flag size={18} />
          </button>

          <button
            onClick={() => leaveCall(isPrivateRoom ? 'dashboard' : 'feedback')}
            className="bg-white/90 border border-slate-200 p-2.5 rounded-full hover:bg-white text-slate-700 shadow-md transition"
            title="Leave Call"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Stranger Trust Card Overlay */}
      {otherProfile && (
        <div className="absolute top-20 left-5 pointer-events-auto z-10 max-w-xs">
          <div className="bg-white/95 border border-slate-200/90 p-4 rounded-2xl backdrop-blur-md shadow-xl text-slate-900 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-sm">
                {otherProfile.username?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <h4 className="font-bold text-xs truncate">{otherProfile.username}</h4>
                  <ShieldCheck size={13} className="text-emerald-600 shrink-0" title="Verified Member" />
                </div>
                <p className="text-[10px] text-indigo-600 font-semibold truncate flex items-center gap-1">
                  <Briefcase size={10} /> {otherProfile.occupation || 'Member'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium pt-0.5">
              <span>{otherProfile.country || 'Global'}</span>
              <span>•</span>
              <span className="text-emerald-600 font-bold">
                {otherProfile.trustScore || 100}% Behavior Score
              </span>
            </div>

            {Array.isArray(otherProfile.interests) && otherProfile.interests.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {otherProfile.interests.map((t, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Icebreaker button */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 flex flex-col gap-4 pointer-events-auto z-10">
        <button
          onClick={generateIcebreaker}
          className="bg-white/90 border border-slate-200 p-3.5 rounded-2xl flex flex-col items-center gap-1.5 hover:border-indigo-500 transition group text-slate-700 hover:text-indigo-600 backdrop-blur-md shadow-xl"
        >
          <Sparkles size={20} className="group-hover:animate-spin text-indigo-600" />
          <span className="text-[10px] font-extrabold">AI Icebreaker</span>
        </button>
      </div>

      {icebreaker && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-white/95 border border-indigo-200 text-slate-800 px-6 py-3 rounded-full z-10 pointer-events-none backdrop-blur-md shadow-xl max-w-md text-center">
          <p className="text-xs font-bold flex items-center gap-2 justify-center text-indigo-900">
            <Sparkles size={14} className="text-indigo-600" /> {icebreaker}
          </p>
        </div>
      )}

      {subtitle && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md pointer-events-none z-10">
          <div className="bg-slate-900/90 backdrop-blur-md text-white text-center px-6 py-3 rounded-2xl border border-slate-700 shadow-2xl">
            <p className="text-xs font-medium flex items-center justify-center gap-2">
              <MessageCircle size={14} className="text-indigo-400" />
              {subtitle}
            </p>
          </div>
        </div>
      )}

      {chatOpen && user && (
        <ChatPanel
          roomId={roomId}
          uid={user.uid}
          username={profile?.username || 'Stranger'}
          onClose={() => setChatOpen(false)}
        />
      )}

      {/* Quick Notes / Code Scratchpad Drawer */}
      {notesOpen && (
        <div className="absolute top-5 right-20 z-20 w-80 bg-white/95 border border-slate-200 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 text-white">
            <div className="flex items-center gap-2">
              <FileText size={14} />
              <span className="font-bold text-sm">Quick Notes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-emerald-200">Scratchpad / Code Snippets</span>
              <button onClick={() => setNotesOpen(false)} className="p-1 rounded-full hover:bg-emerald-700 transition">
                <X size={13} />
              </button>
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`# Notes\nWrite code, ideas, or share snippets here...\n\nThis is local to your session.`}
            className="flex-1 h-64 p-4 text-xs font-mono text-slate-800 bg-slate-50 resize-none focus:outline-none focus:bg-white placeholder-slate-300 border-0"
            spellCheck={false}
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-white">
            <span className="text-[10px] text-slate-400">{notes.length} chars</span>
            <button onClick={() => setNotes('')}
              className="text-[10px] font-semibold text-red-500 hover:text-red-700 transition">
              Clear
            </button>
          </div>
        </div>
      )}

      {reportOpen && <ReportModal onSubmit={handleReportSubmit} onClose={() => setReportOpen(false)} />}

      {feedbackOpen && otherUid && (
        <FeedbackModal
          fromUid={user.uid}
          toUid={otherUid}
          roomId={roomId}
          onComplete={finishFeedbackAndLeave}
        />
      )}

      {/* Networking Modal — post-call contact exchange */}
      {networkingOpen && (
        <NetworkingModal
          roomId={roomId}
          myUid={user?.uid}
          myProfile={profile}
          otherUid={otherUid}
          onClose={() => { setNetworkingOpen(false); navigate('/dashboard'); }}
        />
      )}
    </div>
  );
}
