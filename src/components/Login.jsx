import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { AppFooter } from './AppFooter';
import { ACCENT_COLORS } from './ColorThemePicker';
import SmartDocLogoIcon from './SmartDocLogoIcon';
import {
  FileText,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  KeyRound,
  Layers,
  Award,
  Sparkles,
  X,
  Check,
  Loader2,
  Wand2,
  Sun,
  Moon
} from 'lucide-react';

const SAVED_USERNAME_KEY = 'smartdoc_saved_username';

export const Login = () => {
  const { login, accentColor = 'green', setAccentColor, theme = 'dark', toggleTheme } = useApp();
  const isLight = theme === 'light';

  useEffect(() => {
    document.title = 'SmartDoc | Sign In';
  }, []);

  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem(SAVED_USERNAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [rememberUsername, setRememberUsername] = useState(() => {
    try {
      return Boolean(localStorage.getItem(SAVED_USERNAME_KEY));
    } catch {
      return true;
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKeyEvent = (e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setErrorMsg('Please enter both your username and password.');
      return;
    }

    try {
      if (rememberUsername) {
        localStorage.setItem(SAVED_USERNAME_KEY, trimmedUser);
      } else {
        localStorage.removeItem(SAVED_USERNAME_KEY);
      }
    } catch {
      // Ignore storage errors
    }

    setIsSubmitting(true);

    try {
      const result = await login(trimmedUser, trimmedPass);
      setIsSubmitting(false);

      if (!result.success) {
        setErrorMsg(result.message || 'Invalid username or password.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'Authentication error. Please check your credentials.');
    }
  };

  return (
    <div className="smartdoc-login-screen">
      {/* Subtle Ambient Background Glows */}
      <div className="login-bg-glow glow-1" />
      <div className="login-bg-glow glow-2" />
      <div className="login-bg-glow glow-3" />

      {/* Clean Top Bar */}
      <header className="login-top-bar">
        <div className="login-logo-pill">
          <div className="smart-brand-icon-box sm">
            <SmartDocLogoIcon size={18} className="smart-brand-icon" />
          </div>
          <div className="login-brand-copy">
            <span className="login-brand-text">SmartDoc</span>
            <span className="login-brand-tag">Enterprise Word &amp; Workflow</span>
          </div>
        </div>

        <div className="login-top-bar-right">
          <button
            id="btn-login-theme-toggle"
            type="button"
            className="login-mode-toggle-btn"
            onClick={toggleTheme}
            title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {isLight ? <Moon size={14} /> : <Sun size={14} />}
            <span>{isLight ? 'Dark' : 'Light'}</span>
          </button>

          <div className="login-theme-switcher" title="Switch Interface Accent Color">
            <span className="login-theme-label">Theme</span>
            <div className="login-theme-dots">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`login-theme-dot ${accentColor === c.id ? 'active' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setAccentColor(c.id)}
                  title={`Switch to ${c.label}`}
                  aria-label={`Switch to ${c.label}`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Split Showcase Container */}
      <main className="login-split-container">
        {/* Left Pane: Clean, Breathable Platform & AI Spotlight */}
        <section className="login-showcase-pane">
          <div className="login-badge-pill">
            <Sparkles size={13} className="login-badge-icon" />
            <span>AI Form Studio · Word Templates · Live Approvals</span>
          </div>

          <h1 className="login-hero-title">
            <span className="login-hero-highlight">AI-Powered</span> Word Forms &amp; Multi-Tier Approvals
          </h1>

          <p className="login-hero-desc">
            Generate interactive Word forms from plain-English prompts, manage department drives, and sign off with tamper-evident X.509 digital signatures.
          </p>

          {/* Featured AI Form Generation Spotlight Card */}
          <div className="login-ai-spotlight-card">
            <div className="login-ai-spotlight-head">
              <div className="login-ai-spotlight-icon">
                <Wand2 size={20} />
              </div>
              <div className="login-ai-spotlight-titles">
                <div className="login-ai-spotlight-title-row">
                  <h2>AI Form &amp; Document Studio</h2>
                  <span className="login-feature-ai-badge">BETA</span>
                </div>
                <p>
                  Describe any form, contract, or checklist to automatically synthesize structured Word templates with interactive fields, tables, and approval workflows.
                </p>
              </div>
            </div>
            <div className="login-ai-spotlight-pills">
              <span className="login-ai-pill is-highlight">
                <Sparkles size={12} />
                Instant Built-in NLP &amp; Local Ollama LLM
              </span>
              <span className="login-ai-pill">17 Enterprise Blueprints</span>
              <span className="login-ai-pill">Auto In-Text &#123;&#123;Tags&#125;&#125; &amp; Signatures</span>
            </div>
          </div>

          {/* 3 Clean Core Pillars */}
          <div className="login-pillars-grid">
            <div className="login-pillar-card">
              <div className="login-feature-icon-box">
                <FileText size={17} />
              </div>
              <h3 className="login-feature-title">Word Form Studio</h3>
              <p className="login-feature-desc">
                Rich A4 canvas with in-text placeholders, custom field widths &amp; side-by-side signatures.
              </p>
            </div>

            <div className="login-pillar-card">
              <div className="login-feature-icon-box">
                <Layers size={17} />
              </div>
              <h3 className="login-feature-title">Multi-Tier Approvals</h3>
              <p className="login-feature-desc">
                Sequential department sign-offs, objection handling &amp; redline peer review diffs.
              </p>
            </div>

            <div className="login-pillar-card">
              <div className="login-feature-icon-box">
                <Award size={17} />
              </div>
              <h3 className="login-feature-title">X.509 PKI &amp; Drives</h3>
              <p className="login-feature-desc">
                Personal RSA-2048 certificates, SHA-256 audit trails &amp; scoped Explorer drives.
              </p>
            </div>
          </div>
        </section>

        {/* Right Pane: Clean, Spacious Sign-in Card */}
        <section className="login-form-pane">
          <div className="login-card-glow-halo-wrap">
            <div className="login-card-ambient-aura" />
            <div className="login-glass-card">
              <div className="login-card-header">
                <div className="login-icon-avatar">
                  <KeyRound size={22} />
                </div>
                <h2 className="login-title">Sign In to SmartDoc</h2>
                <p className="login-subtitle">
                  Access your department drive, forms &amp; pending approvals
                </p>
              </div>

              {errorMsg && (
                <div className="login-error-banner animate-fade-in" role="alert">
                  <AlertCircle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="login-form" noValidate>
                {/* Username Field */}
                <div className="login-field-group">
                  <div className="login-field-header">
                    <label className="login-label" htmlFor="login-username">Username</label>
                  </div>
                  <div className="login-input-wrap">
                    <User size={16} className="login-input-icon" />
                    <input
                      id="login-username"
                      type="text"
                      className="login-input"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      autoComplete="username"
                      autoFocus={!username}
                      required
                    />
                    {username && (
                      <button
                        type="button"
                        className="login-input-clear"
                        onClick={() => setUsername('')}
                        title="Clear username"
                        aria-label="Clear username"
                        tabIndex={-1}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div className="login-field-group">
                  <div className="login-field-header">
                    <label className="login-label" htmlFor="login-password">Password</label>
                    {capsLockOn && (
                      <span className="login-capslock-badge" role="status">
                        <AlertCircle size={11} />
                        Caps Lock ON
                      </span>
                    )}
                  </div>
                  <div className="login-input-wrap">
                    <Lock size={16} className="login-input-icon" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="login-input"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      onKeyDown={handleKeyEvent}
                      onKeyUp={handleKeyEvent}
                      onBlur={() => setCapsLockOn(false)}
                      autoComplete="current-password"
                      autoFocus={Boolean(username)}
                      required
                    />
                    <button
                      type="button"
                      className="login-pw-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Remember Username Row */}
                <div className="login-options-row">
                  <label className="login-remember-label">
                    <input
                      type="checkbox"
                      className="login-remember-checkbox-input"
                      checked={rememberUsername}
                      onChange={(e) => setRememberUsername(e.target.checked)}
                    />
                    <span className={`login-remember-box ${rememberUsername ? 'is-checked' : ''}`}>
                      {rememberUsername && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span>Remember username on this device</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  id="btn-login-submit"
                  type="submit"
                  className="login-submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={17} className="sd-spin" />
                      <span>Authenticating…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </form>

              <div className="login-card-footer-info">
                <p className="login-help-text">
                  Forgot password? Contact your IT Administrator.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Login Screen Footer */}
      <AppFooter className="smartdoc-login-footer" id="login-footer-powered-by" />
    </div>
  );
};
