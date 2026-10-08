import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import './styles.css';

function AppContent() {
  const { session, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('auth') === 'login' || params.get('auth') === 'signup';
  });

  if (loading) return <div className="empty-page">Loading…</div>;

  if (!session) {
    if (showAuth) {
      return (
        <LoginPage
          onBackToLanding={() => {
            setShowAuth(false);
            const url = new URL(window.location.href);
            url.searchParams.delete('auth');
            window.history.replaceState(null, '', url);
          }}
        />
      );
    }
    return (
      <LandingPage
        onOpenAuth={(mode = 'login') => {
          setShowAuth(true);
          const url = new URL(window.location.href);
          url.searchParams.set('auth', mode);
          window.history.replaceState(null, '', url);
        }}
      />
    );
  }

  return <Dashboard />;
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
