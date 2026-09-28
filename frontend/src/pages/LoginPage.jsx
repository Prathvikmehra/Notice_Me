import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <div className="brand" style={{ justifyContent: 'center', marginBottom: '32px' }}>
          <span className="brand-symbol" aria-hidden="true">✳</span>
          <span>notice<span className="brand-accent">me</span></span>
        </div>
        <h2 className="login-heading">{isSignUp ? 'Create account' : 'Welcome back'}</h2>
        <p className="login-sub">{isSignUp ? 'Track what matters to you.' : 'Sign in to your watchlist.'}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <form onSubmit={submit} className="login-form">
          {isSignUp && (
            <>
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" />
            </>
          )}
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
          <button className="button button-primary login-button" disabled={busy} type="submit">{busy ? 'Please wait…' : isSignUp ? 'Sign up' : 'Sign in'}</button>
        </form>
        <p className="login-toggle">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" className="link-button" onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}>
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}
