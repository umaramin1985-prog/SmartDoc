import React, { useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  UserAvatar, StatusBadge, WorkflowMiniProgress, SlaBadge, roleLabel, formatDate
} from './ui';
import { buildAppUrl, getPathForTab, tabLinkProps } from '../utils/router';
import {
  Inbox, AlertTriangle, ClipboardCheck, CheckCircle2, FileText,
  Sparkles, ShieldCheck, PenLine, Bell, Check, ArrowRight, X,
  Building2, Zap, FolderOpen, MessageSquare
} from 'lucide-react';

export const WelcomeBriefingModal = () => {
  const {
    currentUser,
    isAdmin,
    isLoginBriefingOpen,
    closeLoginBriefing,
    myApprovalQueue,
    mySubmissions,
    reviewsNeedingMe,
    unreadNotificationsCount,
    markAllNotificationsRead,
    setActiveTab,
    openSignatureModal
  } = useApp();

  useEffect(() => {
    if (!isLoginBriefingOpen) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLoginBriefing();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isLoginBriefingOpen, closeLoginBriefing]);

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const navigateAndClose = useCallback((tab, url) => {
    closeLoginBriefing();
    if (url) {
      window.history.pushState({ tab }, '', url);
    }
    setActiveTab(tab, { skipHistory: !!url });
  }, [closeLoginBriefing, setActiveTab]);

  // Derived real metrics for the logged-in user
  const briefingMetrics = useMemo(() => {
    const approvals = myApprovalQueue || [];
    const subs = mySubmissions || [];
    const reviews = reviewsNeedingMe || [];

    const now = Date.now();
    const urgentApprovals = approvals.filter(s => {
      if (!s.expiryDate) return false;
      const exp = new Date(s.expiryDate).getTime();
      return !Number.isNaN(exp) && (exp - now <= 48 * 3600 * 1000);
    });

    const myObjections = subs.filter(s => s.status === 'OBJECTION_RAISED');
    const myInReview = subs.filter(s => s.status === 'IN_REVIEW');
    const myApproved = subs.filter(s => s.status === 'APPROVED');

    // Combined priority feed (Top 6 actionable items)
    const priorityFeed = [
      ...approvals.map(s => ({
        id: `app-${s.id}`,
        kind: 'approval',
        tag: 'Approval Required',
        tagTone: 'blue',
        title: s.title,
        code: s.uniqueNumber,
        sub: `Submitted by ${s.submittedByName} · ${s.department}`,
        submission: s,
        url: buildAppUrl('approvals', { submission: s.id }),
        onOpen: () => navigateAndClose('approvals', buildAppUrl('approvals', { submission: s.id }))
      })),
      ...myObjections.map(s => ({
        id: `obj-${s.id}`,
        kind: 'objection',
        tag: 'Changes Requested',
        tagTone: 'amber',
        title: s.title,
        code: s.uniqueNumber,
        sub: s.objectionNotes ? `Note: "${s.objectionNotes}"` : 'Reviewer requested changes on your submission',
        submission: s,
        url: buildAppUrl('approvals', { submission: s.id }),
        onOpen: () => navigateAndClose('approvals', buildAppUrl('approvals', { submission: s.id }))
      })),
      ...reviews.map(r => ({
        id: `rev-${r.id}`,
        kind: 'review',
        tag: 'Template Review',
        tagTone: 'purple',
        title: r.title,
        code: r.department,
        sub: r.initiatorId === currentUser?.id
          ? 'All reviewers submitted — ready for your merge decisions'
          : `Invited by ${r.initiatorName} · Pre-publication review`,
        review: r,
        url: buildAppUrl('reviews', { review: r.id }),
        onOpen: () => navigateAndClose('reviews', buildAppUrl('reviews', { review: r.id }))
      }))
    ];

    const totalActionNeeded = approvals.length + myObjections.length + reviews.length;

    return {
      approvals,
      urgentApprovalsCount: urgentApprovals.length,
      myObjections,
      reviews,
      myInReview,
      myApproved,
      totalMySubmissions: subs.length,
      priorityFeed: priorityFeed.slice(0, 6),
      totalActionNeeded
    };
  }, [myApprovalQueue, mySubmissions, reviewsNeedingMe, currentUser?.id, navigateAndClose]);

  if (!isLoginBriefingOpen || !currentUser || typeof document === 'undefined') {
    return null;
  }

  const {
    approvals,
    urgentApprovalsCount,
    myObjections,
    reviews,
    myInReview,
    myApproved,
    totalMySubmissions,
    priorityFeed,
    totalActionNeeded
  } = briefingMetrics;

  return createPortal(
    <div
      className="sd-briefing-backdrop animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLoginBriefing();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Login Workspace Briefing"
    >
      <div className="sd-briefing-modal" id="welcome-briefing-modal">
        {/* Top Accent Glow Bar */}
        <div className="sd-briefing-accent-bar" />

        {/* 1. Executive Header */}
        <header className="sd-briefing-header">
          <div className="sd-briefing-user-row">
            <div className="sd-briefing-avatar-wrap">
              <UserAvatar user={currentUser} size="lg" />
              <span className="sd-briefing-online-dot" title="Authenticated Session Active" />
            </div>
            <div className="sd-briefing-titles">
              <div className="sd-briefing-eyebrow">
                <Sparkles size={12} />
                <span>SmartDoc Session Briefing</span>
                <span className="sd-briefing-dot">·</span>
                <span>{formatDate(new Date().toISOString())}</span>
              </div>
              <h2 className="sd-briefing-greeting">
                {greeting}, {currentUser.name}
              </h2>
              <div className="sd-briefing-badges">
                <span className="sd-badge sd-badge-gray sd-badge-xs">
                  <Building2 size={11} /> {currentUser.department}
                </span>
                <span className="sd-badge sd-badge-violet sd-badge-xs">
                  {roleLabel(currentUser.systemRole)}
                </span>
                {currentUser.hasSignature ? (
                  <span className="sd-badge sd-badge-green sd-badge-xs">
                    <ShieldCheck size={11} /> PKI Signature Ready
                  </span>
                ) : (
                  <button
                    type="button"
                    className="sd-badge sd-badge-amber sd-badge-xs sd-badge-clickable"
                    onClick={() => {
                      closeLoginBriefing();
                      openSignatureModal();
                    }}
                    title="Click to configure your digital signature"
                  >
                    <PenLine size={11} /> Setup Signature
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            id="btn-close-login-briefing"
            type="button"
            className="sd-icon-btn"
            onClick={closeLoginBriefing}
            title="Dismiss briefing (Esc)"
            aria-label="Close briefing"
          >
            <X size={18} />
          </button>
        </header>

        {/* 2. 4-Card Action & Submission Summary Grid */}
        <div className="sd-briefing-body">
          <div className="sd-briefing-kpi-grid">
            {/* KPI 1: Approvals Required */}
            <a
              className={`sd-briefing-kpi-card ${approvals.length > 0 ? 'has-alert-blue' : ''}`}
              {...tabLinkProps(getPathForTab('approvals'), () => navigateAndClose('approvals'))}
            >
              <div className="sd-briefing-kpi-top">
                <span className="sd-briefing-kpi-icon sd-tone-blue">
                  <Inbox size={17} />
                </span>
                {urgentApprovalsCount > 0 && (
                  <span className="sd-badge sd-badge-amber sd-badge-xs">
                    ⚡ {urgentApprovalsCount} urgent
                  </span>
                )}
              </div>
              <div className="sd-briefing-kpi-val">{approvals.length}</div>
              <div className="sd-briefing-kpi-label">Approvals Required</div>
              <div className="sd-briefing-kpi-sub">
                {isAdmin
                  ? (approvals.length > 0 ? 'Waiting for your dept sign-off' : 'Zero pending approvals')
                  : 'Department approval queue'}
              </div>
            </a>

            {/* KPI 2: Revisions / Objections on My Submissions */}
            <a
              className={`sd-briefing-kpi-card ${myObjections.length > 0 ? 'has-alert-amber' : ''}`}
              {...tabLinkProps(getPathForTab('approvals'), () => navigateAndClose('approvals'))}
            >
              <div className="sd-briefing-kpi-top">
                <span className="sd-briefing-kpi-icon sd-tone-amber">
                  <AlertTriangle size={17} />
                </span>
                {myObjections.length > 0 && (
                  <span className="sd-badge sd-badge-amber sd-badge-xs">Action Needed</span>
                )}
              </div>
              <div className="sd-briefing-kpi-val">{myObjections.length}</div>
              <div className="sd-briefing-kpi-label">Changes Requested</div>
              <div className="sd-briefing-kpi-sub">
                {myObjections.length > 0
                  ? 'Submissions needing your revision'
                  : 'No objections on your forms'}
              </div>
            </a>

            {/* KPI 3: Pre-Publication Template Reviews */}
            <a
              className={`sd-briefing-kpi-card ${reviews.length > 0 ? 'has-alert-purple' : ''}`}
              {...tabLinkProps(getPathForTab('reviews'), () => navigateAndClose('reviews'))}
            >
              <div className="sd-briefing-kpi-top">
                <span className="sd-briefing-kpi-icon sd-tone-violet">
                  <ClipboardCheck size={17} />
                </span>
                {reviews.length > 0 && (
                  <span className="sd-badge sd-badge-violet sd-badge-xs">Pending</span>
                )}
              </div>
              <div className="sd-briefing-kpi-val">{reviews.length}</div>
              <div className="sd-briefing-kpi-label">Template Reviews</div>
              <div className="sd-briefing-kpi-sub">
                {reviews.length > 0
                  ? 'Drafts awaiting your feedback'
                  : 'All template reviews complete'}
              </div>
            </a>

            {/* KPI 4: My Submissions Pipeline */}
            <a
              className="sd-briefing-kpi-card"
              {...tabLinkProps(getPathForTab('approvals'), () => navigateAndClose('approvals'))}
            >
              <div className="sd-briefing-kpi-top">
                <span className="sd-briefing-kpi-icon sd-tone-green">
                  <CheckCircle2 size={17} />
                </span>
                <span className="sd-badge sd-badge-green sd-badge-xs">
                  {myApproved.length} approved
                </span>
              </div>
              <div className="sd-briefing-kpi-val">{myInReview.length}</div>
              <div className="sd-briefing-kpi-label">My Active Submissions</div>
              <div className="sd-briefing-kpi-sub">
                {totalMySubmissions} total submitted by you
              </div>
            </a>
          </div>

          {/* 3. Immediate Action Items Queue (or All Caught Up State) */}
          <div className="sd-briefing-queue-section">
            <div className="sd-briefing-section-head">
              <h3>
                {totalActionNeeded > 0
                  ? `Priority Items Requiring Your Attention (${totalActionNeeded})`
                  : 'Workspace Status'}
              </h3>
              {totalActionNeeded > 0 && (
                <a
                  className="sd-link sd-xs"
                  {...tabLinkProps(getPathForTab('approvals'), () => navigateAndClose('approvals'))}
                >
                  View all in Approvals <ArrowRight size={12} />
                </a>
              )}
            </div>

            {priorityFeed.length === 0 ? (
              <div className="sd-briefing-caught-up">
                <div className="sd-briefing-caught-up-icon">
                  <CheckCircle2 size={24} />
                </div>
                <div className="sd-briefing-caught-up-text">
                  <strong>You are all caught up!</strong>
                  <span>
                    There are no pending approvals, objections, or template reviews waiting on you right now.
                  </span>
                </div>
                <div className="sd-briefing-quick-links">
                  <a
                    className="btn btn-secondary btn-xs"
                    {...tabLinkProps(getPathForTab('forms'), () => navigateAndClose('forms'))}
                  >
                    <FolderOpen size={13} /> Browse Forms Drive
                  </a>
                  <a
                    className="btn btn-secondary btn-xs"
                    {...tabLinkProps(getPathForTab('dept-messaging'), () => navigateAndClose('dept-messaging'))}
                  >
                    <MessageSquare size={13} /> Team Chat
                  </a>
                </div>
              </div>
            ) : (
              <div className="sd-briefing-list">
                {priorityFeed.map((item) => (
                  <a
                    key={item.id}
                    className="sd-briefing-item"
                    {...tabLinkProps(item.url, item.onOpen)}
                  >
                    <div className="sd-briefing-item-main">
                      <div className="sd-briefing-item-top">
                        <span className={`badge badge-${item.tagTone}`}>
                          {item.tag}
                        </span>
                        <span className="sd-mono sd-xs sd-muted">{item.code}</span>
                        <strong className="sd-briefing-item-title">{item.title}</strong>
                      </div>
                      <div className="sd-briefing-item-sub">{item.sub}</div>
                      {item.submission && (
                        <div className="sd-row-meta-strip">
                          <WorkflowMiniProgress
                            workflow={item.submission.workflow}
                            currentStep={item.submission.currentWorkflowStep}
                            status={item.submission.status}
                          />
                          <SlaBadge
                            createdAt={item.submission.createdAt}
                            expiryDate={item.submission.expiryDate}
                            status={item.submission.status}
                          />
                        </div>
                      )}
                    </div>
                    <span className="btn btn-secondary btn-xs sd-briefing-item-cta">
                      Open <ArrowRight size={12} />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. Footer Bar */}
        <footer className="sd-briefing-footer">
          <div className="sd-briefing-footer-left">
            <Bell size={14} className={unreadNotificationsCount > 0 ? 'sd-text-accent' : 'sd-text-muted'} />
            <span>
              {unreadNotificationsCount > 0
                ? `${unreadNotificationsCount} unread notification${unreadNotificationsCount === 1 ? '' : 's'}`
                : 'No unread notifications'}
            </span>
            {unreadNotificationsCount > 0 && (
              <button
                type="button"
                className="sd-link sd-xs"
                onClick={markAllNotificationsRead}
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="sd-btn-row">
            {approvals.length > 0 ? (
              <>
                <button
                  id="btn-dismiss-login-briefing"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeLoginBriefing}
                >
                  Continue to Workspace
                </button>
                <a
                  id="btn-briefing-go-approvals"
                  className="btn btn-primary btn-sm"
                  {...tabLinkProps(getPathForTab('approvals'), () => navigateAndClose('approvals'))}
                >
                  <Zap size={14} /> Review Approvals ({approvals.length})
                </a>
              </>
            ) : (
              <button
                id="btn-dismiss-login-briefing"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={closeLoginBriefing}
              >
                Continue to Workspace <ArrowRight size={14} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
