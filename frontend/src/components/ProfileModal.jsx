import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { supabase } from '../lib/supabase.js';
import { updateProfile } from '../api/client.js';

const PRESET_AVATARS = [
  { id: 'radar', icon: '👁️', label: 'Radar' },
  { id: 'gazette', icon: '📰', label: 'Gazette' },
  { id: 'spark', icon: '⚡', label: 'Spark' },
  { id: 'owl', icon: '🦉', label: 'Watcher' },
  { id: 'scholar', icon: '🎓', label: 'Scholar' },
  { id: 'shield', icon: '🛡️', label: 'Sentinel' },
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
      setNameMessage('Profile name updated successfully.');
      if (onProfileUpdated) {
        onProfileUpdated({ name: trimmed, avatar });
      }
    } catch (err) {
      setNameError(err.message || 'Failed to update name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPassBusy(true);
    setPassError('');
    setPassMessage('');

    if (newPassword.length < 6) {
      setPassError('Password must be at least 6 characters.');
      setPassBusy(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.');
      setPassBusy(false);
      return;
    }

    try {
      if (!supabase?.auth?.updateUser) {
        throw new Error('Authentication service not connected.');
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPassMessage('Password changed successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPassError(err.message || 'Failed to change password.');
    } finally {
      setPassBusy(false);
    }
  };

  const maskEmail = (emailStr) => {
    if (!emailStr) return '';
    const parts = emailStr.split('@');
    if (parts.length < 2) return emailStr;
    const namePart = parts[0];
    const masked = namePart.length > 2 
      ? namePart.slice(0, 2) + '••••' + namePart.slice(-1)
      : namePart + '••••';
    return `${masked}@${parts[1]}`;
  };

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div 
        className="profile-modal-dialog" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-modal-title-wrap">
            <span className="profile-modal-badge">DOSSIER</span>
            <h2 id="profile-modal-title" className="profile-modal-title">Account & Profile Settings</h2>
          </div>
          <button 
            type="button" 
            className="profile-modal-close" 
            onClick={onClose} 
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="profile-modal-tabs">
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 Profile & Avatar
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            🌓 Appearance
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            🔒 Security
          </button>
        </div>

        {/* Tab Body */}
        <div className="profile-modal-body">
          {/* TAB 1: PROFILE & AVATAR */}
          {activeTab === 'profile' && (
            <div className="profile-tab-content">
              {/* Avatar Showcase */}
              <div className="avatar-showcase-card">
                <div className="avatar-preview-container">
                  {avatar?.startsWith('data:image') || avatar?.startsWith('http') ? (
                    <img src={avatar} alt="Profile" className="avatar-preview-img" />
                  ) : avatar ? (
                    <div className="avatar-preview-preset">{avatar}</div>
                  ) : (
                    <div className="avatar-preview-initial">{initial}</div>
                  )}
                  <span className="avatar-ring-label">CURRENT AVATAR</span>
                </div>

                <div className="avatar-actions-wrap">
                  <div className="avatar-upload-row">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageUpload} 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                    />
                    <button 
                      type="button" 
                      className="button button-primary avatar-upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📷 Upload Photo
                    </button>
                    {avatar && (
                      <button 
                        type="button" 
                        className="button button-quiet"
                        onClick={() => saveAvatar('')}
                        title="Revert to initial letter"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <small className="field-hint">Upload JPEG/PNG/SVG. Automatically cropped square.</small>
                </div>
              </div>

              {/* Preset Avatars Selection */}
              <div className="profile-section-block">
                <div className="section-label">OR CHOOSE A NEO-BRUTALIST ICON</div>
                <div className="preset-avatar-grid">
                  {PRESET_AVATARS.map((p) => {
                    const isSelected = avatar === p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`preset-avatar-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => saveAvatar(p.icon)}
                        title={p.label}
                      >
                        <span className="preset-icon">{p.icon}</span>
                        <span className="preset-name">{p.label}</span>
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
                
                <div className="form-field-group">
                  <label htmlFor="profile-name-input">Display Name</label>
                  <div className="input-action">
                    <input 
                      id="profile-name-input"
                      type="text" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="e.g. Prathvik Mehra"
                      maxLength={120}
                    />
                    <button 
                      type="submit" 
                      className="button button-primary"
                      disabled={savingName}
                    >
                      {savingName ? 'Saving…' : 'Save Name'}
                    </button>
                  </div>
                </div>

                <div className="account-meta-card">
                  <div className="meta-row">
                    <span className="meta-label">Account Email</span>
                    <div className="meta-value-wrap">
                      <span className="meta-value">
                        {showEmail ? userEmail : maskEmail(userEmail)}
                      </span>
                      <button 
                        type="button" 
                        className="link-button" 
                        style={{ fontSize: '12px', padding: '2px 6px' }}
                        onClick={() => setShowEmail(!showEmail)}
                      >
                        {showEmail ? 'Hide' : 'Reveal'}
                      </button>
                      <span className="verified-pill">✓ Verified</span>
                    </div>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Membership Tier</span>
                    <span className={`plan-badge ${userProfile?.plan === 'pro' ? 'is-pro' : 'is-free'}`}>
                      {userProfile?.plan === 'pro' ? '★ PRO MEMBER' : 'FREE TIER (5 TOPICS)'}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-label">Active Topics Tracked</span>
                    <span className="meta-value">{userProfile?.topicCount ?? '—'} topics</span>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: APPEARANCE & THEME TOGGLE */}
          {activeTab === 'appearance' && (
            <div className="profile-tab-content">
              <div className="theme-toggle-header">
                <div>
                  <div className="section-label">THEME PALETTE</div>
                  <h3 style={{ margin: '4px 0 8px', fontSize: '18px', fontWeight: 800 }}>
                    Interface Color Mode
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                    Switch between Notice Me's signature Sunlit Gazette aesthetic and the Midnight Radar high-contrast dark theme.
                  </p>
                </div>
                <button
                  type="button"
                  className={`theme-switch-btn ${isDark ? 'is-dark' : 'is-light'}`}
                  onClick={toggleTheme}
                  title="Toggle Light / Dark mode"
                >
                  <span className="theme-switch-slider">
                    {isDark ? '🌙' : '☀️'}
                  </span>
                  <span className="theme-switch-text">
                    {isDark ? 'DARK ACTIVE' : 'LIGHT ACTIVE'}
                  </span>
                </button>
              </div>

              {/* Interactive Visual Theme Cards */}
              <div className="theme-card-grid">
                {/* Light Theme Card */}
                <div 
                  className={`theme-selection-card light-preview ${!isDark ? 'active-theme' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  <div className="theme-card-topbar">
                    <span className="theme-card-title">☀️ Sunlit Gazette</span>
                    {!isDark && <span className="theme-active-tag">CURRENT</span>}
                  </div>
                  <p className="theme-card-desc">
                    Classic brutalist newspaper styling on cream canvas with tactile ink-black borders and vibrant accents.
                  </p>
                  <div className="theme-swatch-row">
                    <div className="theme-swatch" style={{ background: '#FFFDF5', border: '1.5px solid #000' }} title="Canvas #FFFDF5" />
                    <div className="theme-swatch" style={{ background: '#000000' }} title="Ink #000000" />
                    <div className="theme-swatch" style={{ background: '#FFE600', border: '1.5px solid #000' }} title="Highlight #FFE600" />
                    <div className="theme-swatch" style={{ background: '#A3E635', border: '1.5px solid #000' }} title="Lime #A3E635" />
                    <div className="theme-swatch" style={{ background: '#38BDF8', border: '1.5px solid #000' }} title="Cyan #38BDF8" />
                  </div>
                </div>

                {/* Dark Theme Card */}
                <div 
                  className={`theme-selection-card dark-preview ${isDark ? 'active-theme' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  <div className="theme-card-topbar">
                    <span className="theme-card-title">🌙 Midnight Radar</span>
                    {isDark && <span className="theme-active-tag">CURRENT</span>}
                  </div>
                  <p className="theme-card-desc">
                    Deep obsidian background with crisp white linework and neon beacon indicators for late-night intelligence monitoring.
                  </p>
                  <div className="theme-swatch-row">
                    <div className="theme-swatch" style={{ background: '#0F1115', border: '1.5px solid #fff' }} title="Obsidian #0F1115" />
                    <div className="theme-swatch" style={{ background: '#F8FAFC', border: '1.5px solid #fff' }} title="Linework #F8FAFC" />
                    <div className="theme-swatch" style={{ background: '#FFE600', border: '1.5px solid #fff' }} title="Highlight #FFE600" />
                    <div className="theme-swatch" style={{ background: '#A3E635', border: '1.5px solid #fff' }} title="Lime #A3E635" />
                    <div className="theme-swatch" style={{ background: '#38BDF8', border: '1.5px solid #fff' }} title="Cyan #38BDF8" />
                  </div>
                </div>
              </div>

              <div className="theme-callout-note">
                <span className="callout-icon">💡</span>
                <span>Theme preference is saved locally and applies across all browser tabs automatically.</span>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & PASSWORD */}
          {activeTab === 'security' && (
            <div className="profile-tab-content">
              <div className="section-label">ACCESS & CREDENTIALS</div>
              <h3 style={{ margin: '4px 0 8px', fontSize: '18px', fontWeight: 800 }}>
                Security & Authentication
              </h3>
              <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--muted)' }}>
                Keep your account protected. Enter a secure new password below to update your login credentials.
              </p>

              {passError && <p className="form-error" role="alert">{passError}</p>}
              {passMessage && <p className="form-success" role="status">{passMessage}</p>}

              <form onSubmit={handleChangePassword} className="security-form-card">
                <div className="form-field-group">
                  <label htmlFor="new-password">New Password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                  <small className="field-hint">Must be at least 6 characters.</small>
                </div>

                <div className="form-field-group">
                  <label htmlFor="confirm-password">Confirm New Password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="button button-primary"
                  style={{ width: '100%', marginTop: '8px' }}
                  disabled={passBusy}
                >
                  {passBusy ? 'Updating Password…' : '🔒 Update Password'}
                </button>
              </form>

              <div className="session-logout-block">
                <div>
                  <strong>Session Management</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                    End your active session on this device.
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    onClose();
                    signOut();
                  }}
                >
                  Sign Out of Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
