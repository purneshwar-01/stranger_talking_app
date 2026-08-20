import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RadioTower, Mail, Lock, ShieldCheck, Users, Briefcase, Sparkles, ArrowLeft, CheckCircle } from 'lucide-react';

function friendlyError(err) {
  const code = err?.code || '';
  if (code.includes('email-already-in-use'))
    return 'That email is already registered — try signing in instead.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Incorrect email or password.';
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if (code.includes('auth/operation-not-allowed'))
    return 'Email/Password sign-in is disabled in Firebase Console > Authentication.';
  if (code.includes('too-many-requests'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (code.includes('user-not-found') || code.includes('auth/user-not-found'))
    return 'No account found with that email address.';
  return err?.message || 'Something went wrong. Please try again.';
}

export default function Landing() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  // mode: 'signin' | 'signup' | 'forgot'
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email);
        setResetSent(true);
      } else if (mode === 'signup') {
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setResetSent(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-slate-900 font-sans py-8">
      <div className="bg-white border border-slate-200/90 p-8 md:p-10 max-w-md w-full rounded-3xl shadow-xl space-y-6 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-50 blur-2xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-50 blur-2xl rounded-full pointer-events-none" />

        {/* Brand */}
        <div className="relative z-10 flex flex-col items-center text-center space-y-3">
          <div className="p-3.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <RadioTower className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">RandomTalks Pro</h1>
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
            Purpose-Based Stranger &amp; Friends Network
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-[11px] font-bold flex items-center gap-1 text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              <Briefcase size={12} /> Tech &amp; Career
            </span>
            <span className="text-[11px] font-bold flex items-center gap-1 text-cyan-700 bg-cyan-50 px-3 py-1 rounded-full border border-cyan-100">
              <Users size={12} /> Friends
            </span>
            <span className="text-[11px] font-bold flex items-center gap-1 text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
              <Sparkles size={12} /> Verified
            </span>
          </div>
        </div>

        {/* ── FORGOT PASSWORD success state ── */}
        {mode === 'forgot' && resetSent ? (
          <div className="relative z-10 text-center space-y-4">
            <CheckCircle size={48} className="text-emerald-500 mx-auto" />
            <h3 className="text-lg font-bold text-slate-900">Check your inbox</h3>
            <p className="text-sm text-slate-500">
              A password-reset link has been sent to <strong>{email}</strong>. Check your spam folder if you don't see it.
            </p>
            <button
              onClick={() => switchMode('signin')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition flex items-center justify-center gap-1 mx-auto"
            >
              <ArrowLeft size={14} /> Back to Sign In
            </button>
          </div>
        ) : (
          /* ── AUTH FORM ── */
          <form onSubmit={handleSubmit} className="relative z-10 space-y-4 text-left">
            {/* Back link for forgot mode */}
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
              >
                <ArrowLeft size={13} /> Back to Sign In
              </button>
            )}

            {mode === 'forgot' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 font-medium">
                Enter your registered email. We'll send a secure reset link — no OTP to copy, just click the link.
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <Mail size={14} className="text-indigo-600" />
                {mode === 'forgot' ? 'Your Registered Email' : 'Email Address'}
              </label>
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition text-sm font-medium"
              />
            </div>

            {/* Password — hidden in forgot mode */}
            {mode !== 'forgot' && (
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Lock size={14} className="text-indigo-600" /> Password
                </label>
                <input
                  required
                  type="password"
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition text-sm font-medium"
                />
                {/* Forgot Password trigger — only on sign-in */}
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="mt-1.5 text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition float-right"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-xl border border-red-200 clear-both">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 font-bold text-white shadow-md hover:shadow-lg transition-all duration-150 disabled:opacity-50 text-sm clear-both"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'signup'
                ? 'Create Account'
                : mode === 'forgot'
                ? 'Send Reset Link'
                : 'Sign In'}
            </button>
          </form>
        )}

        {/* Mode switcher */}
        {!resetSent && (
          <div className="relative z-10 text-center space-y-2 pt-2 border-t border-slate-100">
            {mode !== 'forgot' && (
              <button
                onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
              >
                {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            )}
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <ShieldCheck size={13} className="text-emerald-500" /> 18+ Only • Safe &amp; Moderated Environment
            </p>
          </div>
        )}
      </div>

      {/* SEO Section for Search Engine Indexing */}
      <footer className="mt-8 max-w-2xl text-center space-y-4 text-slate-600 px-4">
        <section className="bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-2xl p-6 shadow-sm text-left space-y-3">
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
            Why Use Stranger Talking App?
          </h2>
          <p className="text-xs leading-relaxed text-slate-600">
            Stranger Talking App is the premier global platform designed for safe, purpose-driven video discovery. Connect instantly with like-minded individuals worldwide for professional networking, language learning, gaming, or casual video chat.
          </p>
          <h3 className="text-sm font-bold text-slate-800 pt-1">
            Best Free Omegle Alternative for Video Calls
          </h3>
          <p className="text-xs leading-relaxed text-slate-600">
            Looking for a reliable Omegle alternative? Stranger Talking App offers verified profiles, interest-based matching, real-time AI conversation co-pilots, and end-to-end moderated video rooms with zero registration fees.
          </p>
        </section>
        <p className="text-[11px] text-slate-400 font-medium">
          © {new Date().getFullYear()} Stranger Talking App. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
