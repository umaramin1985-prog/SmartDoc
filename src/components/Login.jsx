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
  FolderTree,
  CheckCircle2,
  Clock,
  PenTool,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

export const Login = () => {
  const { login, accentColor = 'green', setAccentColor } = useApp();

  useEffect(() => {
    document.title = 'SmartDoc | Sign In';
  }, []);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim() || !password.trim()) {
      setErrorMsg('Please enter both your username and password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login(username.trim(), password.trim());
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
      {/* Background Ambient Glows */}
      <div className="login-bg-glow glow-1" />
      <div className="login-bg-glow glow-2" />
      <div className="login-bg-glow glow-3" />

      {/* Top Bar */}
      <header className="login-top-bar">
        <div className="login-logo-pill">
          <div className="smart-brand-icon-box sm">
            <SmartDocLogoIcon size={18} className="smart-brand-icon" />
          </div>
          <span className="login-brand-text">SmartDoc</span>
          <span className="login-brand-tag">Enterprise Word &amp; Workflow</span>
        </div>

        {/* Theme Accent Switcher in Top Bar */}
        <div className="login-top-bar-right">
          <div className="login-theme-switcher" title="Switch Theme Color">
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
        {/* Left Pane: Enterprise Platform Showcase */}
        <section className="login-showcase-pane">
          <div className="login-badge-pill">
            <Sparkles size={14} className="login-badge-icon" />
            <span>Word Form Studio &amp; Approval Engine</span>
          </div>

          <h1 className="login-hero-title">
            Intelligent Word Templates, <span className="login-hero-highlight">Live Approvals</span> &amp; Governance
          </h1>

          <p className="login-hero-desc">
            Transform Word templates into interactive forms, automate multi-tier department sign-offs, and maintain compliance with tamper-evident digital signatures.
          </p>

          {/* 3 Core Capability Highlights */}
          <div className="login-feature-grid">
            <div className="login-feature-card">
              <div className="login-feature-icon-box">
                <FileText size={18} />
              </div>
              <div className="login-feature-content">
                <h2 className="login-feature-title">Word Form Studio</h2>
                <p className="login-feature-desc">Interactive inputs, tables, dropdowns &amp; dynamic signature slots in native Word docs.</p>
              </div>
            </div>

            <div className="login-feature-card">
              <div className="login-feature-icon-box">
                <Layers size={18} />
              </div>
              <div className="login-feature-content">
                <h2 className="login-feature-title">Multi-Tier Approvals</h2>
                <p className="login-feature-desc">Sequential department workflows, objection reviews, version history &amp; instant alerts.</p>
              </div>
            </div>

            <div className="login-feature-card">
              <div className="login-feature-icon-box">
                <FolderTree size={18} />
              </div>
              <div className="login-feature-content">
                <h2 className="login-feature-title">Explorer Hierarchy</h2>
                <p className="login-feature-desc">Windows Explorer folder navigation with strict department drive isolation.</p>
              </div>
            </div>
          </div>

          {/* Live Workflow Glass Preview Card */}
          <div className="login-preview-card">
            <div className="login-preview-header">
              <div className="login-preview-file">
                <div className="login-preview-file-icon">
                  <FileText size={16} />
                </div>
                <div>
                  <div className="login-preview-filename">Procurement-Requisition-2026.docx</div>
                  <div className="login-preview-dept">Operations &amp; Finance · Stage 2 of 3</div>
                </div>
              </div>
              <span className="login-preview-status-pill">
                <span className="login-preview-status-pulse" />
                In Review
              </span>
            </div>

            <div className="login-preview-flow">
              <div className="login-preview-step step-done">
                <div className="login-step-circle"><CheckCircle2 size={13} /></div>
                <div className="login-step-text">
                  <span className="login-step-name">Submitted</span>
                  <span className="login-step-sub">Interactive Form</span>
                </div>
              </div>

              <div className="login-step-connector connector-done" />

              <div className="login-preview-step step-active">
                <div className="login-step-circle"><Clock size={13} /></div>
                <div className="login-step-text">
                  <span className="login-step-name">Dept Admin</span>
                  <span className="login-step-sub">Operations Sign-off</span>
                </div>
              </div>

              <div className="login-step-connector" />

              <div className="login-preview-step step-pending">
                <div className="login-step-circle"><PenTool size={13} /></div>
                <div className="login-step-text">
                  <span className="login-step-name">Final Approval</span>
                  <span className="login-step-sub">Digital Signature</span>
                </div>
              </div>
            </div>

            <div className="login-preview-footer">
              <div className="login-preview-shield">
                <ShieldCheck size={14} />
                <span>Digitally Verified Signature · Audit Trail Active</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Pane: Sign-in Card with Consistent 360° Glow */}
        <section className="login-form-pane">
          <div className="login-card-glow-halo-wrap">
            <div className="login-card-ambient-aura" />
            <div className="login-glass-card">
              <div className="login-card-header">
                <div className="login-icon-avatar">
                  <KeyRound size={24} />
                </div>
                <h2 className="login-title">Sign In to SmartDoc</h2>
                <p className="login-subtitle">
                  Access your department drive, forms &amp; pending approvals
                </p>
              </div>

              {errorMsg && (
                <div className="login-error-banner animate-fade-in">
                  <AlertCircle size={18} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="login-form">
                {/* Username Field */}
                <div className="login-field-group">
                  <label className="login-label" htmlFor="login-username">Username</label>
                  <div className="login-input-wrap">
                    <User size={16} className="login-input-icon" />
                    <input
                      id="login-username"
                      type="text"
                      className="login-input"
                      placeholder="e.g. admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="login-field-group">
                  <div className="login-field-header">
                    <label className="login-label" htmlFor="login-password">Password</label>
                  </div>
                  <div className="login-input-wrap">
                    <Lock size={16} className="login-input-icon" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="login-input"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="login-pw-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  id="btn-login-submit"
                  type="submit"
                  className="login-submit-btn"
                  disabled={isSubmitting}
                >
                  <span>{isSubmitting ? 'Authenticating…' : 'Sign In'}</span>
                  <ArrowRight size={17} />
                </button>
              </form>

              <div className="login-card-footer-info">
                <p className="login-help-text">Forgot password? Contact your IT Administrator.</p>
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
