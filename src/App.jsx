import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import ProfileSetup from './pages/ProfileSetup';
import Dashboard from './pages/Dashboard';

const CallRoom = lazy(() => import('./pages/CallRoom'));

function CallRoomLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 gap-6 font-sans text-white">
      <div className="relative flex items-center justify-center w-20 h-20">
        <span className="absolute w-full h-full rounded-full bg-indigo-500/30 animate-radar" />
        <span className="absolute w-full h-full rounded-full bg-indigo-500/20 animate-radar-2" />
        <div className="relative z-10 w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
          <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-slate-200">Entering Call Room</p>
        <p className="text-xs text-slate-400">Loading components…</p>
      </div>
    </div>
  );
}

/**
 * Full-screen loading splash — shown while Firebase Auth resolves the
 * session on the first page load / hard refresh.
 */
function LoadingSplash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-6 font-sans">
      {/* Radar loader */}
      <div className="relative flex items-center justify-center w-20 h-20">
        <span className="absolute w-full h-full rounded-full bg-indigo-400/30 animate-radar" />
        <span className="absolute w-full h-full rounded-full bg-indigo-400/20 animate-radar-2" />
        <div className="relative z-10 w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15 10l4.553-2.07A1 1 0 0121 8.82V5a1 1 0 00-1-1H4a1 1 0 00-1 1v3.82a1 1 0 00.447.91L8 12M15 10l-7 2m7-2v9m-7-9v9m0 0l7-2" />
          </svg>
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-slate-700">Random Talks</p>
        <p className="text-xs text-slate-400">Connecting to your session…</p>
      </div>
    </div>
  );
}

/**
 * ProtectedRoute — redirects unauthenticated users to landing.
 * requireProfile: also redirects to /setup if profile isn't complete yet.
 */
const ProtectedRoute = ({ children, requireProfile = false }) => {
  const { user, profile } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (requireProfile && !profile?.isProfileComplete) return <Navigate to="/setup" replace />;
  return children;
};

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  // Show loading splash while Firebase resolves auth state on mount.
  // This prevents the redirect flicker on page refresh.
  if (loading) return <LoadingSplash />;

  // Determine where to send an authenticated user on the root route.
  const authedRedirect = profile?.isProfileComplete ? '/dashboard' : '/setup';

  return (
    <Routes>
      {/* Public landing — if already signed in, skip to the right destination */}
      <Route path="/" element={user ? <Navigate to={authedRedirect} replace /> : <Landing />} />

      {/* Profile setup — accessible even if profile exists (for re-editing) */}
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <ProfileSetup />
          </ProtectedRoute>
        }
      />

      {/* Main app — requires completed profile */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireProfile>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/call/:roomId"
        element={
          <ProtectedRoute requireProfile>
            <Suspense fallback={<CallRoomLoading />}>
              <CallRoom />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
