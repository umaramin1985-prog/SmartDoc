import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { PageHeader, EmptyState, Modal, formatDate, initials, fileToBase64 } from './ui';
import { SmartWordStudio } from './SmartWordStudio';
import { ReviewChangesModal } from './ReviewChangesModal';
import { SendForReviewModal } from './SendForReviewModal';
import { sanitizeHtml } from './reviewDiff';
import {
  Inbox, Send, ClipboardCheck, PencilLine, GitCompareArrows, Rocket, Ban, Check, Clock,
  FileText, X
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
    {reviewers.map(v => (
      <span
        key={v.userId}
        className={`sd-rvl-chip ${v.status === 'SUBMITTED' ? 'done' : ''}`}
        title={`${v.name} · ${v.department} — ${v.status === 'SUBMITTED' ? (v.hasChanges ? 'submitted with changes' : 'submitted, no changes') : 'has not submitted yet'}`}
      >
        <span className="sd-rvl-chip-avatar">{initials(v.name)}</span>
        {v.name}
        {v.status === 'SUBMITTED' ? <Check size={11} /> : <Clock size={11} />}
      </span>
    ))}
  </div>
);

export const ReviewsHub = () => {
  const {
    currentUser, isAdmin, canManageDepartment, formTemplates,
    templateReviews, startReview, refreshReviews, cancelReview, addToast
  } = useApp();
  const [tab, setTab] = useState('assigned');
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
    { id: 'assigned', label: 'Assigned to me', icon: Inbox, count: assigned.length, alert: assignedOpen },
    { id: 'started', label: 'Started by me', icon: Send, count: started.length, alert: startedReady }
  ];
  const rows = tab === 'assigned' ? assigned : started;

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

  const renderAction = (r) => {
    const busy = busyId === r.id;
    if (tab === 'assigned') {
      const mine = r.reviewers.find(v => v.userId === currentUser.id);
      if (r.status === 'IN_REVIEW' && mine?.status === 'PENDING') {
        return (
          <button type="button" id={`btn-review-${r.id}`} className="btn btn-primary btn-sm" onClick={() => openAsReviewer(r)} disabled={busy}>
            <PencilLine size={14} /> {busy ? 'Opening…' : 'Review document'}
          </button>
        );
      }
      if (mine?.status === 'SUBMITTED') {
        return <span className="sd-muted sd-rvl-note"><Check size={13} /> You submitted {mine.hasChanges ? 'with changes' : 'with no changes'}</span>;
      }
      return <span className="sd-muted sd-rvl-note">Closed</span>;
    }

    if (r.phase === 'AWAITING_DECISION') {
      return (
        <button type="button" id={`btn-decide-${r.id}`} className="btn btn-primary btn-sm" onClick={() => openDecisions(r)} disabled={busy}>
          <GitCompareArrows size={14} /> {busy ? 'Opening…' : 'Review changes'}
        </button>
      );
    }
    if (r.status === 'DECIDED') {
      return (
        <button type="button" id={`btn-publish-${r.id}`} className="btn btn-primary btn-sm" onClick={() => openPublish(r)} disabled={busy}>
          <Rocket size={14} /> {busy ? 'Opening…' : 'Continue to publish'}
        </button>
      );
    }
    if (r.status === 'IN_REVIEW') {
      return (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCancel(r)} disabled={busy}>
          <Ban size={14} /> Cancel review
        </button>
      );
    }
    return null;
  };

  return (
    <div className="sd-page animate-fade-in">
      <PageHeader
        title="Reviews"
        subtitle="Forms sent to you for review, and the drafts you sent out. Reviewers edit their own copy; you accept or reject every change before publishing."
        actions={
          isAdmin && (
            <button
              id="btn-reviews-send-for-review"
              className="btn btn-primary"
              onClick={() => setShowTemplateSelect(true)}
              title="Send a form template for review"
            >
              <Send size={15} /> Send for review
            </button>
          )
        }
      />

      <div className="sd-tabs" role="tablist">
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

      {rows.length === 0 ? (
        <EmptyState
          icon={tab === 'assigned' ? ClipboardCheck : Send}
          title={tab === 'assigned' ? 'Nothing to review' : 'You have not sent any forms for review'}
          text={tab === 'assigned'
            ? 'When a colleague sends you a draft form, it will appear here.'
            : 'Send a form template for review using the “Send for review” button above or from Forms & Documents Explorer.'}
        />
      ) : (
        <div className="sd-rvl-list">
          {rows.map(r => {
            const submitted = r.reviewers.filter(v => v.status === 'SUBMITTED').length;
            return (
              <article key={r.id} id={`review-row-${r.id}`} className="sd-card sd-rvl-card">
                <div className="sd-rvl-main">
                  <div className="sd-rvl-title-row">
                    <h3>{r.title}</h3>
                    <PhaseBadge phase={r.phase} />
                  </div>
                  <p className="sd-muted sd-rvl-sub">
                    {tab === 'assigned' ? `From ${r.initiatorName}` : `${r.reviewers.length} reviewer${r.reviewers.length === 1 ? '' : 's'}`}
                    {' · '}{r.department}{' · '}started {formatDate(r.createdAt, true)}
                  </p>
                  {r.message && tab === 'assigned' && <p className="sd-rvl-message">“{r.message}”</p>}
                  <ReviewerChips reviewers={r.reviewers} />
                </div>
                <div className="sd-rvl-side">
                  <span className="sd-muted sd-rvl-progress">{submitted} / {r.reviewers.length} submitted</span>
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
          title="Select a Form Template to Review"
          subtitle="Choose which published template you want to send out to colleagues for review."
          onClose={() => setShowTemplateSelect(false)}
          size="md"
        >
          {manageableTemplates.length === 0 ? (
            <div className="sd-empty-state" style={{ padding: '24px 0' }}>
              <p className="sd-muted">No editable templates found in your department. Create or upload a template in Forms &amp; Documents Explorer first.</p>
            </div>
          ) : (
            <div className="sd-folder-picker-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
              {manageableTemplates.map(t => (
                <div
                  key={t.id}
                  className="sd-card"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onClick={() => {
                    setShowTemplateSelect(false);
                    setSendReviewTarget(t);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="sd-template-icon sd-icon-word" style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t.title}</div>
                      <div className="sd-muted" style={{ fontSize: '0.8rem' }}>{t.department} · {t.code} · v{t.version || 1}</div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-xs">
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {sendReviewTarget && (
        <SendForReviewModal
          title={sendReviewTarget.title}
          onClose={() => setSendReviewTarget(null)}
          onSend={handleSendForReview}
        />
      )}
    </div>
  );
};
