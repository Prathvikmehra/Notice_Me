import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Logo from '../components/Logo.jsx';
import {
  IconShield,
  IconArrowRight,
  IconCheck,
  IconLock,
  IconMail,
  IconUser,
  IconEye,
  IconEyeOff,
  IconRadio,
  IconFileText,
} from '../components/Icons.jsx';

export default function LoginPage({ onBackToLanding }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
          email,
          password,
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
      <div className="login-shell">
        {/* Left: Product & Intelligence Showcase */}
        <div className="login-showcase">
          <div className="login-showcase-content">
            <div className="login-brand-header">
              <Logo size="medium" />
              <div className="login-telemetry-badge">
                <span className="live-pulse-dot" />
                <span>SURVEILLANCE RADAR LIVE</span>
              </div>
            </div>

            <div className="login-hero-copy">
              <h1 className="login-hero-title">
                Public notice intelligence, audited in real-time.
              </h1>
              <p className="login-hero-desc">
                Continuous surveillance of gazettes, regulatory circulars, and institutional mandates with cryptographic diff tracking and executive-ready dossiers.
              </p>
            </div>

            {/* Live Telemetry Mock Preview Card */}
            <div className="login-mock-card">
              <div className="login-mock-header">
                <div className="login-mock-chip">
                  <IconFileText size={12} />
                  <span>SEBI MASTER CIRCULAR</span>
                </div>
                <span className="login-mock-time">14m ago</span>
              </div>
              <div className="login-mock-body">
                <div className="login-mock-title">
                  Algorithmic Order Audits &amp; API Key Telemetry Mandate
                </div>
                <div className="login-mock-diff-snippet">
                  <span className="diff-tag diff-tag-critical">CRITICAL AMENDMENT</span>
                  <p className="diff-snippet-text">
                    &ldquo;Entities must implement dual-token cryptographic signatures across all algorithmic execution endpoints within 30 days.&rdquo;
                  </p>
                </div>
              </div>
              <div className="login-mock-footer">
                <span className="mock-footer-stat"><strong>24</strong> Watchlists Notified</span>
                <span className="mock-footer-status">
                  <IconCheck size={12} style={{ color: 'var(--status-verified-dot)' }} />
                  <span>Diff Cryptographically Verified</span>
                </span>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="login-highlights-list">
              <div className="login-highlight-item">
                <div className="highlight-icon-wrap">
                  <IconShield size={14} />
                </div>
                <div>
                  <strong>Zero-Hallucination Monitoring</strong>
                  <span>Diffs extracted directly from official PDFs &amp; public gazette registries.</span>
                </div>
              </div>
              <div className="login-highlight-item">
                <div className="highlight-icon-wrap">
                  <IconRadio size={14} />
                </div>
                <div>
                  <strong>Automated Dispatch Cadences</strong>
                  <span>Webhook triggers and scheduled executive email digests.</span>
                </div>
              </div>
            </div>

            <div className="login-showcase-footer">
              <span>Trusted by regulatory compliance, legal counsel, and intelligence teams</span>
            </div>
          </div>
        </div>

        {/* Right: Authentication Card */}
        <div className="login-card-panel">
          <div className="login-card">
            {/* Mobile Logo Fallback */}
            <div className="login-mobile-logo">
              <Logo size="medium" />
            </div>

            <div className="login-card-header">
              {onBackToLanding && (
                <button
                  type="button"
                  className="login-back-to-landing-btn"
                  onClick={onBackToLanding}
                >
                  <span>← Back to Notice Me</span>
                </button>
              )}
              {/* Segmented Auth Mode Switch */}
              <div className="auth-mode-segmented">
                <button
                  type="button"
                  className={`auth-mode-btn ${!isSignUp ? 'is-active' : ''}`}
                  onClick={() => { setIsSignUp(false); setError(''); setMessage(''); }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`auth-mode-btn ${isSignUp ? 'is-active' : ''}`}
                  onClick={() => { setIsSignUp(true); setError(''); setMessage(''); }}
                >
                  Create Account
                </button>
              </div>

              <h2 className="login-heading">
                {isSignUp ? 'Initialize your workspace' : 'Welcome back'}
              </h2>
              <p className="login-sub">
                {isSignUp
                  ? 'Track critical public notices and receive verified change alerts.'
                  : 'Access your monitored topics, diff history, and intelligence dossiers.'}
              </p>
            </div>

            {error && <div className="form-error-banner" role="alert">{error}</div>}
            {message && <div className="form-success-banner" role="status">{message}</div>}

            <form onSubmit={submit} className="login-form">
              {isSignUp && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Full name</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">
                      <IconUser size={15} />
                    </span>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                    />
                  </div>
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="auth-email">Account email</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">
                    <IconMail size={15} />
                  </span>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@organization.com"
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <div className="auth-label-row">
                  <label htmlFor="auth-password">Password</label>
                  {!isSignUp && (
                    <span className="auth-hint-text">Minimum 6 characters</span>
                  )}
                </div>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">
                    <IconLock size={15} />
                  </span>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div className="auth-field">
                  <label htmlFor="auth-confirm-password">Confirm password</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">
                      <IconLock size={15} />
                    </span>
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              )}

              <button
                className="button button-primary login-submit-btn"
                disabled={busy}
                type="submit"
              >
                <span>{busy ? 'Authenticating…' : isSignUp ? 'Create Workspace' : 'Sign In to Workspace'}</span>
                {!busy && <IconArrowRight size={14} />}
              </button>
            </form>

            <div className="login-security-footer">
              <IconShield size={13} style={{ color: 'var(--status-verified-dot)' }} />
              <span>256-Bit Encrypted Data Ingestion • End-to-End Audit Trail</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

