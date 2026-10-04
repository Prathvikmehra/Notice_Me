import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { supabase } from '../lib/supabase.js';
import { updateProfile } from '../api/client.js';
import {
  IconUser,
  IconSun,
  IconMoon,
  IconShield,
  IconX,
  IconCheck,
} from './Icons.jsx';

const PRESET_AVATARS = [
  { id: 'owl', icon: '🦉', label: 'Watcher' },
  { id: 'gazette', icon: '📰', label: 'Gazette' },
  { id: 'institution', icon: '🏛️', label: 'Civic' },
  { id: 'justice', icon: '⚖️', label: 'Compliance' },
  { id: 'scholar', icon: '🎓', label: 'Scholar' },
  { id: 'sentinel', icon: '🛡️', label: 'Sentinel' },
  { id: 'executive', icon: '💼', label: 'Executive' },
  { id: 'investigator', icon: '🕵️', label: 'Auditor' },
];

export default function ProfileModal({ isOpen, onClose, userProfile, onProfileUpdated }) {
  const { user, signOut } = useAuth();
  const { theme, setTheme, toggleTheme, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'appearance' | 'security'
  const [name, setName] = useState(userProfile?.name || user?.user_metadata?.name || '');
  const [avatar, setAvatar] = useState(() => {
    const userId = user?.id || 'default';
    return localStorage.getItem(`notice_me_avatar_${userId}`) || user?.user_metadata?.avatar_url || '';
  });
  const [showEmail, setShowEmail] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passBusy, setPassBusy] = useState(false);
  const [passMessage, setPassMessage] = useState('');
  const [passError, setPassError] = useState('');

  // Profile save state
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (userProfile?.name !== undefined) {
      setName(userProfile.name || '');
    }
  }, [userProfile?.name]);

  useEffect(() => {
    if (isOpen) {
      const userId = user?.id || 'default';
      const current = localStorage.getItem(`notice_me_avatar_${userId}`) || user?.user_metadata?.avatar_url || '';
      setAvatar(current);
    }
  }, [isOpen, user]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const userEmail = user?.email || 'user@noticeme.local';
  const initial = (name?.trim()?.[0] || userEmail[0] || 'U').toUpperCase();

  // Compress & save uploaded image
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setNameError('Please select a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Center crop square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        saveAvatar(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveAvatar = async (avatarValue) => {
    setAvatar(avatarValue);
    const userId = user?.id || 'default';
    if (avatarValue) {
      localStorage.setItem(`notice_me_avatar_${userId}`, avatarValue);
    } else {
      localStorage.removeItem(`notice_me_avatar_${userId}`);
    }

    // Sync to Supabase auth metadata if configured
    try {
      if (supabase?.auth?.updateUser) {
        await supabase.auth.updateUser({
          data: { avatar_url: avatarValue },
        });
      }
    } catch {
      // Local fallback is already saved
    }

    if (onProfileUpdated) {
      onProfileUpdated({ avatar: avatarValue, name });
    }
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    setNameError('');
    setNameMessage('');
    try {
      const trimmed = name.trim();
      await updateProfile({ name: trimmed });
      try {
        if (supabase?.auth?.updateUser) {
          await supabase.auth.updateUser({ data: { name: trimmed } });
        }
      } catch {}
      setNameMessage('Display name updated successfully.');
      if (onProfileUpdated) {
        onProfileUpdated({ name: trimmed, avatar });
      }
    } catch (err) {
      setNameError(err.message || 'Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassMessage('');

    if (newPassword.length < 6) {
      setPassError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.');
      return;
    }

    setPassBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPassMessage('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPassError(err.message || 'Failed to update password.');
    } finally {
      setPassBusy(false);
    }
  };

  const maskEmail = (emailStr) => {
    if (!emailStr) return '';
    const parts = emailStr.split('@');
    if (parts.length !== 2) return emailStr;
    const namePart = parts[0];
    const visible = namePart.length > 3 ? namePart.slice(0, 3) : namePart.slice(0, 1);
    return `${visible}•••@${parts[1]}`;
  };

  return (
    <div className="profile-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="profile-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-modal-title">
            <IconUser size={18} style={{ color: 'var(--brand-primary)' }} />
            <span>Account &amp; Workspace Settings</span>
          </div>
          <button
            type="button"
            className="profile-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="profile-tabs-nav" role="tablist">
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'profile' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <IconUser size={14} />
              <span>Profile &amp; Avatar</span>
            </span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'appearance' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {isDark ? <IconMoon size={14} /> : <IconSun size={14} />}
              <span>Appearance</span>
            </span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'security' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <IconShield size={14} />
              <span>Security</span>
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="profile-modal-body">
          {/* TAB 1: PROFILE & AVATAR */}
          {activeTab === 'profile' && (
            <div className="profile-tab-content">
              {/* Avatar Showcase */}
              <div className="avatar-showcase-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px' }}>
                <div className="avatar-preview-container" style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-default)', display: 'grid', placeItems: 'center' }}>
                  {avatar?.startsWith('data:image') || avatar?.startsWith('http') ? (
                    <img src={avatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : avatar ? (
                    <div style={{ fontSize: '30px', lineHeight: 1 }}>{avatar}</div>
                  ) : (
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-secondary)' }}>{initial}</div>
                  )}
                </div>

                <div className="avatar-actions-wrap" style={{ flex: 1 }}>
                  <div className="avatar-upload-row" style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                    />
                    <button 
                      type="button" 
                      className="button button-primary"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload Photo
                    </button>
                    {avatar && (
                      <button 
                        type="button" 
                        className="button button-quiet"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                        onClick={() => saveAvatar('')}
                        title="Revert to initial letter"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <small style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Upload an image or choose a professional persona below.
                  </small>
                </div>
              </div>

              {/* Preset Personas */}
              <div className="profile-section-block" style={{ marginBottom: '20px' }}>
                <div className="section-label">AVATAR PERSONA</div>
                <div className="avatar-presets-grid">
                  {PRESET_AVATARS.map((p) => {
                    const isSelected = avatar === p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`avatar-preset-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => saveAvatar(p.icon)}
                        title={p.label}
                        aria-label={p.label}
                      >
                        <span className="avatar-preset-symbol">{p.icon}</span>
                        <span className="avatar-preset-title">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Display Name Edit Form */}
              <form onSubmit={handleSaveName} className="profile-form-block">
                <div className="section-label">PERSONAL DETAILS</div>
                {nameError && <p className="form-error" role="alert">{nameError}</p>}
                {nameMessage && <p className="form-success" role="status">{nameMessage}</p>}
                
                <div style={{ display: 'flex', gap: '8px', margin: '8px 0 16px' }}>
                  <input 
                    id="profile-name-input"
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Your name"
                    maxLength={120}
                    style={{ flex: 1 }}
                  />
                  <button 
                    type="submit" 
                    className="button button-primary"
                    disabled={savingName}
                  >
                    {savingName ? 'Saving…' : 'Save'}
                  </button>
                </div>

                <div className="account-meta-card" style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Account Email</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {showEmail ? userEmail : maskEmail(userEmail)}
                      </span>
                      <button 
                        type="button" 
                        className="link-button" 
                        style={{ fontSize: '11px' }}
                        onClick={() => setShowEmail(!showEmail)}
                      >
                        {showEmail ? 'Hide' : 'Reveal'}
                      </button>
                      <span className="verified-pill">Verified</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tier</span>
                    <span className="plan-badge">
                      {userProfile?.plan === 'pro' ? 'PRO MEMBER' : 'FREE TIER (5 MONITORS)'}
                    </span>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: APPEARANCE & THEME TOGGLE */}
          {activeTab === 'appearance' && (
            <div className="profile-tab-content">
              <div className="theme-toggle-header" style={{ marginBottom: '16px' }}>
                <div className="section-label">THEME SELECTION</div>
                <h3 style={{ margin: '4px 0 6px', fontSize: '16px', fontWeight: 700 }}>
                  Interface Mode
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Choose between the high-contrast light terminal and precision midnight dark palette.
                </p>
              </div>

              {/* Visual Theme Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Light Theme Card */}
                <div 
                  className={`search-topic-card ${!isDark ? 'is-active-theme' : ''}`}
                  onClick={() => setTheme('light')}
                  style={{
                    border: !isDark ? '2px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <IconSun size={14} />
                      <span>Light Theme</span>
                    </span>
                    {!isDark && <IconCheck size={14} style={{ color: 'var(--brand-primary)' }} />}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Clean off-white canvas with dark slate linework and balanced contrast.
                  </p>
                </div>

                {/* Dark Theme Card */}
                <div 
                  className={`search-topic-card ${isDark ? 'is-active-theme' : ''}`}
                  onClick={() => setTheme('dark')}
                  style={{
                    border: isDark ? '2px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-elevated)',
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <IconMoon size={14} />
                      <span>Dark Theme</span>
                    </span>
                    {isDark && <IconCheck size={14} style={{ color: 'var(--brand-primary)' }} />}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Deep obsidian background with slate linework for focused monitoring.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY */}
          {activeTab === 'security' && (
            <div className="profile-tab-content">
              <form onSubmit={handleUpdatePassword} className="profile-form-block">
                <div className="section-label">ACCOUNT SECURITY</div>
                <h3 style={{ margin: '4px 0 6px', fontSize: '16px', fontWeight: 700 }}>
                  Update Password
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Set a new password for your verified email address. Minimum 6 characters.
                </p>

                {passError && <p className="form-error" role="alert">{passError}</p>}
                {passMessage && <p className="form-success" role="status">{passMessage}</p>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label htmlFor="new-pass" style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>New Password</label>
                    <input
                      id="new-pass"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ width: '100%' }}
                      minLength={6}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-pass" style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Confirm Password</label>
                    <input
                      id="confirm-pass"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ width: '100%' }}
                      minLength={6}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={passBusy || !newPassword}
                    style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                  >
                    {passBusy ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
