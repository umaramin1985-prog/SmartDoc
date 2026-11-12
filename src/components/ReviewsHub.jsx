import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { PageHeader, EmptyState, Modal, formatDate, initials, fileToBase64 } from './ui';
import { SmartWordStudio } from './SmartWordStudio';
import { ReviewChangesModal } from './ReviewChangesModal';
import { SendForReviewModal } from './SendForReviewModal';
import { sanitizeHtml } from './reviewDiff';
import { buildAppUrl, tabLinkProps } from '../utils/router';
import { useDeepLink } from '../utils/useDeepLink';
import {
  Inbox, Send, ClipboardCheck, PencilLine, GitCompareArrows, Rocket, Ban, Check, Clock,
  FileText, X, Layers, Search, ArrowRight
} from 'lucide-react';

const PHASE_META = {
  IN_REVIEW: { label: 'In review', tone: 'blue' },
  AWAITING_DECISION: { label: 'Ready for decisions', tone: 'amber' },
  DECIDED: { label: 'Ready to publish', tone: 'green' },
  PUBLISHED: { label: 'Published', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'gray' },
  SUPERSEDED: { label: 'Sent for another round', tone: 'gray' }
};

const PhaseBadge = ({ phase }) => {
  const meta = PHASE_META[phase] || { label: phase, tone: 'gray' };
  return <span className={`sd-badge sd-badge-${meta.tone}`}>{meta.label}</span>;
};

const ReviewerChips = ({ reviewers }) => (
  <div className="sd-rvl-chips">
    {reviewers.map(v => {
      const isSubmitted = v.status === 'SUBMITTED';
      const chipState = isSubmitted ? (v.hasChanges ? 'done has-diff' : 'done') : '';
      return (
        <span
          key={v.userId}
          className={`sd-rvl-chip ${chipState}`}
          title={`${v.name} · ${v.department} — ${isSubmitted ? (v.hasChanges ? 'submitted with redline changes' : 'submitted, approved as-is') : 'has not submitted yet'}`}
        >
          <span className="sd-rvl-chip-avatar">{initials(v.name)}</span>
          <span>{v.name}</span>
          {isSubmitted ? (
            v.hasChanges ? (
              <span className="sd-rvl-diff-tag">Edited</span>
            ) : (
              <Check size={11} />
            )
          ) : (
            <Clock size={11} />
          )}
        </span>
      );
    })}
  </div>
);

export const ReviewsHub = () => {
  const {
    currentUser, isAdmin, canManageDepartment, formTemplates,
    templateReviews, startReview, refreshReviews, cancelReview, addToast
  } = useApp();
  const [tab, setTab] = useState('assigned');
  const [search, setSearch] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Open overlays: a reviewer editing, the initiator deciding, or the initiator publishing
  const [reviewerSession, setReviewerSession] = useState(null); // { review, html }
  const [decideReview, setDecideReview] = useState(null);       // full review detail
  const [resume, setResume] = useState(null);                   // { reviewId, html, settings }

  // Review initiation modal states
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  const [sendReviewTarget, setSendReviewTarget] = useState(null);

  const manageableTemplates = useMemo(() => {
    return (formTemplates || []).filter(t => t.isEditable !== false && canManageDepartment(t.department));
  }, [formTemplates, canManageDepartment]);

  const filteredManageableTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return manageableTemplates;
    return manageableTemplates.filter(t =>
      [t.title, t.department, t.code].some(v => String(v || '').toLowerCase().includes(q))
    );
  }, [manageableTemplates, templateSearch]);

  const assigned = useMemo(
    () => templateReviews.filter(r => r.initiatorId !== currentUser.id),
    [templateReviews, currentUser.id]
  );
  const started = useMemo(
    () => templateReviews.filter(r => r.initiatorId === currentUser.id),
    [templateReviews, currentUser.id]
  );

  const assignedOpen = assigned.filter(r =>
    r.status === 'IN_REVIEW' && r.reviewers.some(v => v.userId === currentUser.id && v.status === 'PENDING')).length;
  const startedReady = started.filter(r => r.phase === 'AWAITING_DECISION' || r.phase === 'DECIDED').length;

  const tabs = [
    { id: 'assigned', label: 'Assigned to Me', icon: Inbox, count: assigned.length, alert: assignedOpen },
    { id: 'started', label: 'Started by Me', icon: Send, count: started.length, alert: startedReady }
  ];

  const baseRows = tab === 'assigned' ? assigned : started;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseRows;
    return baseRows.filter(r =>
      [r.title, r.department, r.initiatorName, ...(r.reviewers || []).map(v => v.name)].some(v =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [baseRows, search]);

  const load = async (r) => {
    setBusyId(r.id);
    try {
      return await apiService.getReview(r.id);
    } catch (err) {
      addToast('Could not open review', err.message, 'error');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const openAsReviewer = async (r) => {
    const d = await load(r);
    if (d) setReviewerSession({ review: d, html: sanitizeHtml(d.myHtml) });
  };

  const openDecisions = async (r) => {
    const d = await load(r);
    if (d) setDecideReview(d);
  };

  const openPublish = async (r) => {
    const d = await load(r);
    if (d) setResume({ reviewId: d.id, templateId: d.settings?.templateId || null, html: sanitizeHtml(d.finalHtml || d.baseHtml), settings: d.settings });
  };

  const handleCancel = async (r) => {
    if (!window.confirm(`Cancel the review of "${r.title}"? Reviewers will no longer be able to submit.`)) return;
    setBusyId(r.id);
    await cancelReview(r.id);
    setBusyId(null);
  };

  const handleSendForReview = async ({ reviewerIds, message }) => {
    if (!sendReviewTarget) return false;
    let html = sendReviewTarget.htmlContent;
    if (!html) {
      try {
        const blob = await apiService.getTemplateFile(sendReviewTarget.id);
        const b64 = await fileToBase64(blob);
        const parsed = await apiService.parseDocx(b64);
        html = parsed.html || `<p>${sendReviewTarget.title}</p>`;
      } catch {
        html = `<p>${sendReviewTarget.title}</p>`;
      }
    }
    const r = await startReview({
      templateId: sendReviewTarget.id,
      title: sendReviewTarget.title,
      description: sendReviewTarget.description,
      department: sendReviewTarget.department,
      folderId: sendReviewTarget.folderId || null,
      audience: sendReviewTarget.audience,
      defaultExpiryDays: sendReviewTarget.defaultExpiryDays || 14,
      workflow: sendReviewTarget.workflow,
      fields: sendReviewTarget.fields || [],
      subforms: sendReviewTarget.subforms || [],
      htmlContent: html,
      reviewerIds,
      message
    });
    if (r) {
      setSendReviewTarget(null);
      setTab('started');
      return true;
    }
    return false;
  };

  const closeOverlays = () => {
    setReviewerSession(null);
    setDecideReview(null);
    setResume(null);
    refreshReviews().catch(() => {});
  };

  useDeepLink(({ review, action }, { timedOut }) => {
    if (!review) return true;
    const r = templateReviews.find(x => String(x.id) === String(review));
    if (!r) {
      if (templateReviews.length === 0 && !timedOut) return false;
      addToast('Review Not Found', 'The requested review does not exist or you are not part of it.', 'warn');
      return true;
    }
    const isInitiator = r.initiatorId === currentUser.id;
    setTab(isInitiator ? 'started' : 'assigned');
    const mine = r.reviewers.find(v => v.userId === currentUser.id);
    const mode = action || (!isInitiator ? 'review' : r.phase === 'AWAITING_DECISION' ? 'decide' : r.status === 'DECIDED' ? 'publish' : null);
    if (mode === 'review' && !isInitiator && r.status === 'IN_REVIEW' && mine?.status === 'PENDING') openAsReviewer(r);
    else if (mode === 'decide' && isInitiator && r.phase === 'AWAITING_DECISION') openDecisions(r);
    else if (mode === 'publish' && isInitiator && r.status === 'DECIDED') openPublish(r);
    else {
      setTimeout(() => {
        document.getElementById(`review-row-${r.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
    return true;
  }, [templateReviews]);

  const reviewUrl = (r, action) => buildAppUrl('reviews', { review: r.id, action });

  const renderAction = (r) => {
    const busy = busyId === r.id;
    if (tab === 'assigned') {
      const mine = r.reviewers.find(v => v.userId === currentUser.id);
      if (r.status === 'IN_REVIEW' && mine?.status === 'PENDING') {
        return (
          <a id={`btn-review-${r.id}`} className="btn btn-primary btn-sm" aria-disabled={busy || undefined} {...tabLinkProps(reviewUrl(r, 'review'), () => { if (!busy) openAsReviewer(r); })}>
            <PencilLine size={14} /> {busy ? 'Opening…' : 'Review Document'}
          </a>
        );
      }
      if (mine?.status === 'SUBMITTED') {
        return <span className="sd-muted sd-rvl-note"><Check size={13} /> Submitted {mine.hasChanges ? 'with edits' : 'as-is'}</span>;
      }
      return <span className="sd-muted sd-rvl-note">Closed</span>;
    }

    if (r.phase === 'AWAITING_DECISION') {
      return (
        <a id={`btn-decide-${r.id}`} className="btn btn-primary btn-sm" aria-disabled={busy || undefined} {...tabLinkProps(reviewUrl(r, 'decide'), () => { if (!busy) openDecisions(r); })}>
          <GitCompareArrows size={14} /> {busy ? 'Opening…' : 'Review Changes'}
        </a>
      );
    }
    if (r.status === 'DECIDED') {
      return (
        <a id={`btn-publish-${r.id}`} className="btn btn-primary btn-sm" aria-disabled={busy || undefined} {...tabLinkProps(reviewUrl(r, 'publish'), () => { if (!busy) openPublish(r); })}>
          <Rocket size={14} /> {busy ? 'Opening…' : 'Continue to Publish'}
        </a>
      );
    }
    if (r.status === 'IN_REVIEW') {
      return (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCancel(r)} disabled={busy}>
          <Ban size={14} /> Cancel
        </button>
      );
    }
    return null;
  };

  return (
    <div className="sd-page animate-fade-in">
      <PageHeader
        title="Peer Reviews"
        subtitle="Collaborate on draft templates and reconcile redline edits before publishing."
        actions={
          isAdmin && (
            <button
              id="btn-reviews-send-for-review"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setTemplateSearch('');
                setShowTemplateSelect(true);
              }}
              title="Send a form template for review"
            >
              <Send size={14} /> Send for Review
            </button>
          )
        }
      />

      {/* Unified Command Bar: Tabs + Search */}
      <div className="sd-approvals-command-bar">
        <div className="sd-tabs sd-tabs-inline" role="tablist">
          {tabs.map(({ id, label, icon: Icon, count, alert }) => (
            <button
              key={id}
              role="tab"
              id={`tab-reviews-${id}`}
              aria-selected={tab === id}
              className={`sd-tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} /> {label} <span className="sd-tab-count">{count}</span>
              {alert > 0 && <span className="sd-nav-dot" title="Needs your attention" />}
            </button>
          ))}
        </div>

        <div className="sd-approvals-right-controls">
          <div className="sd-approvals-search">
            <Search size={14} className="sd-text-muted" />
            <input
              type="text"
              placeholder="Search template, initiator, reviewer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="sd-approvals-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={tab === 'assigned' ? ClipboardCheck : Send}
          title={
            search
              ? 'No matching reviews found'
              : tab === 'assigned'
              ? 'Nothing to review'
              : 'You have not sent any forms for review'
          }
          text={
            search
              ? 'Try clearing your search filter.'
              : tab === 'assigned'
              ? 'When a colleague sends you a draft form, it will appear here.'
              : 'Send a form template for review using the “Send for Review” button above.'
          }
        />
      ) : (
        <div className="sd-rvl-list">
          {rows.map(r => {
            const submitted = r.reviewers.filter(v => v.status === 'SUBMITTED').length;
            const pct = r.reviewers.length > 0 ? Math.round((submitted / r.reviewers.length) * 100) : 0;

            return (
              <article key={r.id} id={`review-row-${r.id}`} className="sd-card sd-rvl-card">
                <div className="sd-rvl-doc-icon">
                  <FileText size={20} />
                </div>

                <div className="sd-rvl-main">
                  <div className="sd-rvl-title-row">
                    <h3>{r.title}</h3>
                    <PhaseBadge phase={r.phase} />
                    {Array.isArray(r.subforms) && r.subforms.length > 0 && (
                      <span
                        className="sd-badge sd-badge-purple sd-badge-xs"
                        title={`Includes ${r.subforms.length} tagged subform${r.subforms.length === 1 ? '' : 's'}: ${(r.subformSummaries || []).map(s => s.title).join(', ')}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Layers size={11} /> {r.subforms.length} Subform{r.subforms.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  <p className="sd-muted sd-rvl-sub">
                    {tab === 'assigned' ? `From ${r.initiatorName}` : `Initiated by you`}
                    {' · '}{r.department}{' · '}{formatDate(r.createdAt, true)}
                    {r.message && tab === 'assigned' && (
                      <span className="sd-rvl-inline-note"> — “{r.message}”</span>
                    )}
                  </p>

                  <ReviewerChips reviewers={r.reviewers} />
                </div>

                <div className="sd-rvl-side">
                  <div className="sd-rvl-progress-box">
                    <div className="sd-rvl-progress-head">
                      <span className="sd-muted sd-rvl-progress">{submitted}/{r.reviewers.length} reviewed</span>
                      <span className="sd-rvl-pct">{pct}%</span>
                    </div>
                    <div className="sd-rvl-progress-track">
                      <div
                        className="sd-rvl-progress-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {renderAction(r)}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {reviewerSession && (
        <SmartWordStudio reviewSession={reviewerSession} onClose={closeOverlays} />
      )}

      {decideReview && (
        <ReviewChangesModal
          review={decideReview}
          onClose={closeOverlays}
          onFinished={(html) => {
            setResume({ reviewId: decideReview.id, templateId: decideReview.settings?.templateId || null, html: sanitizeHtml(html), settings: decideReview.settings });
            setDecideReview(null);
          }}
        />
      )}

      {resume && (
        <SmartWordStudio resume={resume} onClose={closeOverlays} />
      )}

      {showTemplateSelect && (
        <Modal
          id="modal-select-template-review"
          title="Select a Template to Review"
          subtitle="Choose which published template you want to send out for peer review."
          onClose={() => setShowTemplateSelect(false)}
          size="md"
        >
          {manageableTemplates.length === 0 ? (
            <div className="sd-empty-state" style={{ padding: '24px 0' }}>
              <p className="sd-muted">No editable templates found in your department. Create or upload a template in Forms &amp; Documents Explorer first.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="sdm-launchpad-search" style={{ marginBottom: 2 }}>
                <Search size={14} className="sdm-search-icon" />
                <input
                  type="text"
                  placeholder="Search templates by title, department, or code…"
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  autoFocus
                />
                {templateSearch && (
                  <button type="button" className="sdm-search-clear" onClick={() => setTemplateSearch('')}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="sdm-launchpad-list" style={{ maxHeight: '340px' }}>
                {filteredManageableTemplates.length === 0 ? (
                  <p className="sd-muted sd-small" style={{ textAlign: 'center', padding: '18px 0' }}>
                    No templates match &ldquo;{templateSearch}&rdquo;.
                  </p>
                ) : (
                  filteredManageableTemplates.map(t => (
                    <div
                      key={t.id}
                      className="sdm-launch-card"
                      onClick={() => {
                        setShowTemplateSelect(false);
                        setSendReviewTarget(t);
                      }}
                    >
                      <div className="sdm-launch-card-icon">
                        <FileText size={17} />
                      </div>
                      <div className="sdm-launch-card-body">
                        <div className="sdm-launch-card-title sd-truncate">{t.title}</div>
                        <div className="sdm-launch-card-sub">
                          <span className="sdm-launch-dept">{t.department}</span>
                          <span>•</span>
                          <span>v{t.version || 1}</span>
                          <span>•</span>
                          <span className="sd-mono">{t.code}</span>
                        </div>
                      </div>
                      <button type="button" className="btn btn-primary btn-xs">
                        <span>Select</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {sendReviewTarget && (
        <SendForReviewModal
          title={sendReviewTarget.title}
          onBack={() => {
            setSendReviewTarget(null);
            setShowTemplateSelect(true);
          }}
          onClose={() => setSendReviewTarget(null)}
          onSend={handleSendForReview}
        />
      )}
    </div>
  );
};
