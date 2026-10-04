import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Logo from '../components/Logo.jsx';
import { IconShield, IconArrowRight } from '../components/Icons.jsx';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name: name.trim() || undefined } },
        });
        if (error) throw error;
        setMessage('Check your email for a confirmation link.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <Logo size="large" />
        </div>
        <h2 className="login-heading">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
        <p className="login-sub">
          {isSignUp
            ? 'Track critical public notices and receive verified change alerts.'
            : 'Sign in to access your monitored circulars and verified change history.'}
        </p>

        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}

        <form onSubmit={submit} className="login-form">
          {isSignUp && (
            <>
              <label htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
              />
            </>
          )}

          <label htmlFor="auth-email">Account email</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
            required
          />

          {isSignUp && (
            <>
              <label htmlFor="auth-confirm-password">Confirm password</label>
              <input
                id="auth-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
              />
            </>
          )}

          <button
            className="button button-primary login-button"
            disabled={busy}
            type="submit"
          >
            <span>{busy ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}</span>
            <IconArrowRight size={14} />
          </button>
        </form>

        <p className="login-toggle">
          {isSignUp ? 'Already registered?' : "Don't have an account?"}{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => { setIsSignUp(!isSignUp); setConfirmPassword(''); setError(''); setMessage(''); }}
          >
            {isSignUp ? 'Sign in' : 'Create account'}
          </button>
        </p>

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <IconShield size={13} style={{ color: 'var(--status-verified-dot)' }} />
          <span>Verified Government &amp; Public Notice Surveillance</span>
        </div>
      </div>
    </div>
  );
}
