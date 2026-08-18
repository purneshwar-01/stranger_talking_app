/**
 * textFilter.js
 * Client-side text moderation filter.
 *
 * Applies three layers of filtering to any string before it is displayed
 * or persisted in chat:
 *  1. Profanity — replaces known bad words with asterisks.
 *  2. Phone numbers — masks 7+ digit sequences that look like phone numbers.
 *  3. Harmful links — masks raw HTTP/HTTPS URLs (discourages off-platform contact).
 *
 * Deliberately minimal: heavy-handed server-side NLP should be used for
 * production-grade moderation. This is a lightweight first line of defence.
 */

// ─── 1. Profanity List ────────────────────────────────────────────────────────
// Keep this list short and factual — only the clearest-cut cases.
// Full-word matching only (word boundaries) to avoid false positives.
const PROFANITY = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick',
  'pussy', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
];

const profanityRegex = new RegExp(
  `\\b(${PROFANITY.join('|')})\\b`,
  'gi'
);

// ─── 2. Phone Number Pattern ─────────────────────────────────────────────────
// Matches sequences of 7–15 digits with optional separators (+, -, spaces, ()).
const phoneRegex = /(\+?[\d][\d\s\-().]{6,14}\d)/g;

// ─── 3. URL Pattern ──────────────────────────────────────────────────────────
const urlRegex = /https?:\/\/[^\s"'<>]+/gi;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Replace a matched substring with asterisks of the same length. */
function maskMatch(match) {
  return '*'.repeat(match.length);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * filterText(input) → { text: string, wasFiltered: boolean }
 *
 * Returns the sanitized string and whether any substitution occurred.
 * Safe to call with null / undefined — returns the input unchanged.
 */
export function filterText(input) {
  if (!input || typeof input !== 'string') return { text: input ?? '', wasFiltered: false };

  let out = input;
  let wasFiltered = false;

  // Apply each filter in order.
  const after1 = out.replace(profanityRegex, maskMatch);
  const after2 = after1.replace(phoneRegex, (m) => maskMatch(m.replace(/\s/g, '')) );
  const after3 = after2.replace(urlRegex, '[link removed]');

  if (after3 !== out) wasFiltered = true;
  out = after3;

  return { text: out, wasFiltered };
}

/**
 * isPurelyEmpty(text) → boolean
 * Returns true if the text is empty after stripping whitespace and asterisks
 * (i.e. the entire message was filtered out).
 */
export function isPurelyEmpty(text) {
  return !text || text.replace(/[\s*]/g, '').length === 0;
}
