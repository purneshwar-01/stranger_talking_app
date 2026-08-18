import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ─── Defensive env-var validation ────────────────────────────────────────────
// Vite bakes VITE_* values into the bundle at build time via import.meta.env.
// If a key is missing (e.g. not added to Vercel/GitHub Secrets), Firebase
// throws `auth/invalid-api-key` and the app goes blank. We catch that here
// with a clear, actionable error instead.
const REQUIRED_VARS = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(REQUIRED_VARS)
  .filter(([, v]) => !v || v === 'undefined')
  .map(([k]) => `VITE_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

if (missing.length > 0) {
  // In development: loud console error so devs can see exactly what's missing.
  // In production: still log, but don't throw — Firebase will give its own error,
  // which is less confusing than a blank crash during a CI issue.
  console.error(
    `[Firebase] ❌ Missing environment variables:\n  ${missing.join('\n  ')}\n\n` +
    `  → For LOCAL dev: add them to your .env file (copy from .env.example)\n` +
    `  → For VERCEL: add them in Project Settings → Environment Variables\n` +
    `  → For FIREBASE/GITHUB: add them as Repository Secrets in GitHub Settings`
  );
}

// Firebase web config values identify your project — they're safe to ship to
// the browser. Env vars keep them out of source control. See .env.example.
const firebaseConfig = {
  apiKey:            REQUIRED_VARS.apiKey,
  authDomain:        REQUIRED_VARS.authDomain,
  projectId:         REQUIRED_VARS.projectId,
  storageBucket:     REQUIRED_VARS.storageBucket,
  messagingSenderId: REQUIRED_VARS.messagingSenderId,
  appId:             REQUIRED_VARS.appId,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
