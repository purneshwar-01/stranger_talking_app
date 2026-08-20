import { useEffect, useState, useRef } from 'react';
import { Sparkles, MessageSquare, AlertCircle, RefreshCw, X } from 'lucide-react';

const KEYWORD_PROMPTS = [
  {
    keywords: ['movie', 'film', 'netflix', 'show', 'cinema', 'actor', 'watch'],
    topic: 'Movies & Shows 🎬',
    prompt: "What's a movie or show you've watched recently that you would highly recommend?"
  },
  {
    keywords: ['code', 'coding', 'programming', 'tech', 'developer', 'computer', 'software', 'ai', 'react', 'js'],
    topic: 'Technology & Coding 💻',
    prompt: "What is your favorite programming language or a cool tech project you've built recently?"
  },
  {
    keywords: ['college', 'university', 'school', 'study', 'class', 'major', 'exam', 'professor'],
    topic: 'Academics & Career 🎓',
    prompt: "What are you studying, and what's your ultimate career goal after you graduate?"
  },
  {
    keywords: ['game', 'gaming', 'play', 'xbox', 'playstation', 'nintendo', 'steam', 'pc', 'minecraft'],
    topic: 'Gaming 🎮',
    prompt: "If you could live inside the universe of any video game for a week, which one would you choose?"
  },
  {
    keywords: ['music', 'song', 'artist', 'band', 'album', 'listen', 'concert', 'spotify'],
    topic: 'Music 🎵',
    prompt: "What's the best live concert you've ever been to, or who is your current favorite artist?"
  },
  {
    keywords: ['travel', 'trip', 'vacation', 'visit', 'country', 'city', 'flight', 'explore'],
    topic: 'Travel ✈️',
    prompt: "Where is the most beautiful or interesting place you've ever traveled to, and why?"
  },
  {
    keywords: ['food', 'eat', 'cook', 'restaurant', 'dinner', 'recipe', 'pizza', 'chef', 'baking'],
    topic: 'Food & Cooking 🍕',
    prompt: "What's your absolute signature dish to cook, or a type of cuisine you can't live without?"
  },
  {
    keywords: ['sport', 'sports', 'football', 'basketball', 'soccer', 'gym', 'workout', 'train'],
    topic: 'Sports & Fitness ⚽',
    prompt: "Do you follow any professional sports teams, or what's your favorite way to stay active?"
  },
  {
    keywords: ['book', 'read', 'author', 'novel', 'story', 'literature', 'page'],
    topic: 'Books & Reading 📚',
    prompt: "What is a book that has had a profound impact on how you think, or your favorite genre?"
  }
];

const GENERAL_ICEBREAKERS = [
  "If you had a million dollars but could only spend it on experiences, what would you do first?",
  "What's a skill you've always wanted to learn but haven't had the chance or time for?",
  "What is the most interesting rabbit hole you've gone down recently?",
  "If you could have dinner with any historical figure, who would it be and why?",
  "What's your absolute favorite way to spend a lazy Sunday afternoon?",
  "What is one thing people often misunderstand about you?",
  "What is the most useful piece of advice you've ever received in your life?",
  "If you could teleport to any city in the world right now, where would you go?",
  "What's a hobby or interest you have that most people wouldn't expect?"
];

export default function AIWingman({
  subtitle = '',
  remoteStream = null,
  otherProfile = null,
  myProfile = null,
  onAskWingmanRef = null
}) {
  const [suggestion, setSuggestion] = useState(null);
  const [suggestionSource, setSuggestionSource] = useState(null); // 'keyword' | 'silence' | 'manual'
  const [isActive, setIsActive] = useState(false);

  // References for silence tracking
  const lastActivityTimeRef = useRef(Date.now());
  const remoteAnalyserRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Generate a prompt manually
  const generateManualPrompt = () => {
    // 1. Try to find common interests first
    const myInterests = myProfile?.interests || [];
    const theirInterests = otherProfile?.interests || [];
    const common = myInterests.filter(i => theirInterests.includes(i));

    if (common.length > 0) {
      const interest = common[Math.floor(Math.random() * common.length)];
      setSuggestion({
        topic: `Shared Interest: #${interest} 🤝`,
        prompt: `Ask them: "I notice we both enjoy #${interest}. What got you into that or what's your favorite aspect of it?"`
      });
    } else {
      // 2. Pick a random engaging general icebreaker
      const randPrompt = GENERAL_ICEBREAKERS[Math.floor(Math.random() * GENERAL_ICEBREAKERS.length)];
      setSuggestion({
        topic: 'AI Wingman Starter 💡',
        prompt: randPrompt
      });
    }

    setSuggestionSource('manual');
    setIsActive(true);
    lastActivityTimeRef.current = Date.now(); // reset silence
  };

  // Bind the manual button trigger to the ref
  useEffect(() => {
    if (onAskWingmanRef) {
      onAskWingmanRef.current = generateManualPrompt;
    }
    return () => {
      if (onAskWingmanRef) onAskWingmanRef.current = null;
    };
  }, [onAskWingmanRef, otherProfile, myProfile]);

  // Track local speech activity (via subtitle prop)
  useEffect(() => {
    if (!subtitle) return;
    
    // Update activity time
    lastActivityTimeRef.current = Date.now();

    // Check for keywords in the subtitle
    const lowerText = subtitle.toLowerCase();
    for (const item of KEYWORD_PROMPTS) {
      const matched = item.keywords.some(keyword => lowerText.includes(keyword));
      if (matched) {
        setSuggestion({
          topic: item.topic,
          prompt: item.prompt
        });
        setSuggestionSource('keyword');
        setIsActive(true);
        break; // Show the first matching keyword prompt
      }
    }
  }, [subtitle]);

  // Set up Audio Analyser on remote stream to track remote speaking activity
  useEffect(() => {
    if (!remoteStream) return;

    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let localCtx = null;
    let sourceNode = null;
    let analyserNode = null;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      localCtx = new AudioContextClass();
      audioCtxRef.current = localCtx;

      sourceNode = localCtx.createMediaStreamSource(remoteStream);
      analyserNode = localCtx.createAnalyser();
      analyserNode.fftSize = 128;
      remoteAnalyserRef.current = analyserNode;

      sourceNode.connect(analyserNode);
    } catch (err) {
      console.warn('Speech analyzer failed to bind to remote audio stream:', err);
    }

    return () => {
      if (sourceNode) {
        try { sourceNode.disconnect(); } catch { /* ignore */ }
      }
      if (localCtx && localCtx.state !== 'closed') {
        localCtx.close().catch(() => {});
      }
      audioCtxRef.current = null;
      remoteAnalyserRef.current = null;
    };
  }, [remoteStream]);

  // Silence Detection Loop (Checks every 1 second)
  useEffect(() => {
    const dataArray = new Uint8Array(64);

    const interval = setInterval(() => {
      let isRemoteSpeaking = false;

      // Analyze remote stream volume
      if (remoteAnalyserRef.current) {
        remoteAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        if (avg > 15) { // Speak threshold
          isRemoteSpeaking = true;
        }
      }

      if (isRemoteSpeaking) {
        lastActivityTimeRef.current = Date.now();
      }

      // Check if silence exceeds 6 seconds
      const elapsed = Date.now() - lastActivityTimeRef.current;
      if (elapsed > 6000) {
        // Trigger silence rescue prompt
        const randPrompt = GENERAL_ICEBREAKERS[Math.floor(Math.random() * GENERAL_ICEBREAKERS.length)];
        setSuggestion({
          topic: 'Awkward Silence Rescue! 🚨',
          prompt: randPrompt
        });
        setSuggestionSource('silence');
        setIsActive(true);
        lastActivityTimeRef.current = Date.now(); // reset timer
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isActive || !suggestion) return null;

  return (
    <div className="bg-black/50 border border-white/10 p-3.5 rounded-2xl shadow-2xl backdrop-blur-md text-white w-full space-y-2 animate-fade-in pointer-events-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-indigo-400 font-extrabold text-xs tracking-wider uppercase">
          <Sparkles size={14} className="animate-pulse" />
          <span>{suggestion.topic}</span>
        </div>
        <button
          onClick={() => setIsActive(false)}
          className="text-white/40 hover:text-white/80 p-0.5 rounded-full hover:bg-white/5 transition"
        >
          <X size={14} />
        </button>
      </div>

      <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
        <p className="text-xs font-medium leading-relaxed text-slate-200">
          {suggestion.prompt}
        </p>
      </div>

      <div className="flex items-center justify-between text-[9px] text-white/50 pt-1">
        <span className="flex items-center gap-1">
          {suggestionSource === 'keyword' && (
            <>
              <MessageSquare size={10} className="text-emerald-400" />
              <span>Keyword matched</span>
            </>
          )}
          {suggestionSource === 'silence' && (
            <>
              <AlertCircle size={10} className="text-amber-400" />
              <span>Silence detected</span>
            </>
          )}
          {suggestionSource === 'manual' && (
            <>
              <Sparkles size={10} className="text-indigo-400" />
              <span>Manual recommendation</span>
            </>
          )}
        </span>
        <button
          onClick={generateManualPrompt}
          className="hover:text-white flex items-center gap-1 font-bold uppercase tracking-wider transition"
        >
          <RefreshCw size={10} /> Next Starter
        </button>
      </div>
    </div>
  );
}
