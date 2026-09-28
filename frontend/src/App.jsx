import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import './styles.css';

function AppContent() {
  const { session, loading } = useAuth();
  if (loading) return <div className="empty-page">Loading…</div>;
  if (!session) return <LoginPage />;
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
