import { useState, useCallback } from 'react';

/**
 * EmojiReactions
 *
 * Renders a floating emoji reaction toolbar fixed to the bottom-left of the
 * call screen. Clicking any emoji fires it as a floating particle that
 * rises up and fades out via CSS animation, giving a fun, lightweight
 * reaction UX without any third-party library.
 *
 * Props:
 *   className – optional extra Tailwind classes for positioning
 */

const EMOJIS = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '❤️',  label: 'Heart' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👋', label: 'Wave' },
  { emoji: '🎉', label: 'Party' },
];

let _particleId = 0;

export default function EmojiReactions({ className = '' }) {
  // Each particle: { id, emoji, x }  — x is a random horizontal drift %
  const [particles, setParticles] = useState([]);

  const fireEmoji = useCallback((emoji) => {
    const id = ++_particleId;
    // Random horizontal position within ±40px of center so multiple overlap nicely.
    const x = Math.random() * 80 - 40;
    setParticles((prev) => [...prev, { id, emoji, x }]);

    // Remove after animation completes (1.8 s).
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1800);
  }, []);

  return (
    <>
      {/* Toolbar */}
      <div className={`flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xl rounded-2xl p-2 pointer-events-auto ${className}`}>
        {EMOJIS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => fireEmoji(emoji)}
            title={label}
            aria-label={label}
            className="text-lg w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-125 transition-all duration-100 select-none"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Floating particles — rendered in a portal-like fixed container */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="emoji-particle pointer-events-none fixed bottom-28 select-none text-3xl z-50"
          style={{ left: `calc(50% + ${p.x}px)` }}
          aria-hidden="true"
        >
          {p.emoji}
        </span>
      ))}
    </>
  );
}
