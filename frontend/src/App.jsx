import React, { useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import './styles.css';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));

function AppContent() {
  const { session, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('auth') === 'login' || params.get('auth') === 'signup';
  });

  if (loading) return <div className="empty-page">Loading…</div>;

  return (
    <Suspense fallback={<div className="empty-page">Loading…</div>}>
      {!session ? (
        showAuth ? (
          <LoginPage
            onBackToLanding={() => {
              setShowAuth(false);
              const url = new URL(window.location.href);
              url.searchParams.delete('auth');
              window.history.replaceState(null, '', url);
            }}
          />
        ) : (
          <LandingPage
            onOpenAuth={(mode = 'login') => {
              setShowAuth(true);
              const url = new URL(window.location.href);
              url.searchParams.set('auth', mode);
              window.history.replaceState(null, '', url);
            }}
          />
        )
      ) : (
        <Dashboard />
      )}
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
