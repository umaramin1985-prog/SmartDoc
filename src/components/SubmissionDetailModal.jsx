import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { StatusBadge, formatDate, downloadBlob } from './ui';
import { FillFormModal } from './FillFormModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import {
  CheckCircle2, AlertTriangle, XCircle, Edit3, PenLine, Clock, CircleDot,
  History, MessageSquare, Check, X, Lock, ShieldCheck, ShieldAlert, RefreshCw, Key,
  Loader2, Download, Eye, Tag
} from 'lucide-react';

const STEP_ICON = {
  APPROVED: <CheckCircle2 size={15} className="sd-text-good" />,
  OBJECTION: <AlertTriangle size={15} className="sd-text-warn" />,
  REJECTED: <XCircle size={15} className="sd-text-bad" />,
  PENDING: <CircleDot size={15} className="sd-text-accent" />,
  WAITING: <Clock size={15} className="sd-muted" />
};

const COMMENT_TYPE_LABELS = {
  CHANGE_REQUEST: 'Change Request',
  OBJECTION: 'Objection',
  SUGGESTION: 'Suggestion',
  COMMENT: 'General Note'
};

export const SubmissionDetailModal = ({ submissionId, onClose, initialViewAs = 'auto' }) => {
  const {
    formSubmissions, formTemplates, currentUser, isSuperAdmin, workflowAction,
    openSignatureModal, addSubmissionComment, updateSubmissionComment, addToast,
    verifySubmissionSignatures
  } = useApp();

  const s = formSubmissions.find(x => String(x.id) === String(submissionId));
  const template = formTemplates.find(t => t.id === s?.templateId);
  const step = s?.workflow?.[(s.currentWorkflowStep || 1) - 1];
  const isOriginator = s?.submittedById === currentUser?.id;
  const canAct = Boolean(
    s?.status === 'IN_REVIEW' &&
    step &&
    (isSuperAdmin || (currentUser?.systemRole === 'admin' && currentUser?.department === step.department))
  );
  const canModify = Boolean(s?.status === 'OBJECTION_RAISED' && (isOriginator || isSuperAdmin));

  // Role perspective:
  // - Regular submitter (!canAct): always 'submitter' (strictly read-only unless an objection is raised)
  // - Reviewer (canAct && !isOriginator): always 'reviewer'
  // - Dual Role (canAct && isOriginator — user is BOTH the filer and the reviewer):
  //   defaults to 'reviewer' so they have full review/comment/approval controls on the locked form,
  //   plus a 1-click toggle to preview the pure read-only Submitter view.
  const [viewRole, setViewRole] = useState(() => {
    if (canAct) return 'reviewer';
    if (isOriginator) return 'submitter';
    return 'viewer';
  });

  const [decision, setDecision] = useState(null); // 'APPROVE' | 'OBJECTION' | 'REJECT'
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // PKI Verification state
  const [verifyingPki, setVerifyingPki] = useState(false);
  const [pkiVerification, setPkiVerification] = useState(null);

  // In-form comments & change requests state (for Reviewer)
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentType, setNewCommentType] = useState('CHANGE_REQUEST');
  const [targetFieldKey, setTargetFieldKey] = useState('');
  const [markAsWorkflowObjection, setMarkAsWorkflowObjection] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);

  const decisionBoxRef = useRef(null);
  const commentInputRef = useRef(null);

  if (!s) return null;

  const fields = template?.fields || Object.keys(s.formData || {}).map(k => ({ key: k, label: k }));
  const effectiveTemplate = template || {
    id: s.templateId,
    title: s.title,
    department: s.department,
    fields,
    workflow: s.workflow
  };

  const isReviewerView = canAct && viewRole === 'reviewer';
  const commentsList = Array.isArray(s.comments) ? s.comments : [];
  const hasDecisionOrObjections =
    s.status !== 'IN_REVIEW' ||
    Boolean(s.objectionNotes) ||
    commentsList.length > 0 ||
    (s.workflow || []).some(st => st.status === 'APPROVED' || st.status === 'OBJECTION' || st.status === 'REJECTED');

  const handleSelectDecision = (nextDecision) => {
    setViewRole('reviewer');
    setDecision(nextDecision);
    setTimeout(() => {
      decisionBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleConfirmDecision = async () => {
    if (!decision) return;
    setBusy(true);
    const r = await workflowAction(s.id, decision, notes);
    setBusy(false);
    if (r) {
      setDecision(null);
      setNotes('');
    }
  };

  const handleDownloadDocx = async () => {
    if (!s || downloadingDocx) return;
    try {
      setDownloadingDocx(true);
      addToast('Preparing Word Document', `Generating ${s.uniqueNumber} with digital signatures and stamps…`, 'info');
      const blob = await apiService.getSubmissionDocument(s.id);
      downloadBlob(blob, `${s.uniqueNumber}_v${s.version}.docx`);
      addToast('Downloaded', `Saved "${s.uniqueNumber}_v${s.version}.docx"`, 'success');
    } catch (err) {
      console.error('Download DOCX error:', err);
      addToast('Download Failed', err.message || 'Could not download submission document', 'error');
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handlePostComment = async () => {
    if (!newCommentText.trim() || !isReviewerView) return;
    setCommentBusy(true);
    const newComment = {
      text: newCommentText.trim(),
      type: newCommentType,
      targetField: targetFieldKey || null,
      status: newCommentType === 'OBJECTION' ? 'OBJECTION' : 'OPEN'
    };
    await addSubmissionComment(s.id, newComment);

    if (markAsWorkflowObjection && canAct) {
      await workflowAction(s.id, 'OBJECTION', newCommentText.trim());
      setMarkAsWorkflowObjection(false);
    }

    setNewCommentText('');
    setCommentBusy(false);
    addToast('Saved', `${COMMENT_TYPE_LABELS[newCommentType] || 'Comment'} added to form`, 'info');
  };

  const handleCommentStatus = async (commentId, nextStatus) => {
    await updateSubmissionComment(s.id, commentId, { status: nextStatus });
    addToast('Status updated', `Marked as ${nextStatus}`, 'success');
  };

  const handleVerifyPki = async () => {
    setVerifyingPki(true);
    try {
      const res = await verifySubmissionSignatures(s.id);
      setPkiVerification(res);
      if (res?.overallValid) {
        addToast('Signatures Cryptographically Verified', 'All RSA-2048 PKI digital seals are authentic and untampered.', 'success');
      } else {
        addToast('Verification Warning', 'One or more cryptographic signatures failed verification or are missing.', 'warn');
      }
    } catch (err) {
      addToast('Verification Failed', err.message || 'Could not verify PKI signatures.', 'error');
    } finally {
      setVerifyingPki(false);
    }
  };

  const scrollToFieldOnSheet = (fieldKey) => {
    if (!fieldKey) return;
    setTargetFieldKey(fieldKey);
    const sanitized = String(fieldKey).replace(/\W+/g, '-').toLowerCase();
    const el =
      document.getElementById(`live-wrap-${sanitized}`) ||
      document.getElementById(`live-field-${sanitized}`) ||
      document.getElementById(`live-placeholder-${sanitized}`) ||
      document.querySelector(`[data-field-key="${fieldKey}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleFieldClickOnLockedSheet = (f) => {
    if (!f?.key) return;
    setTargetFieldKey(f.key);
    if (isReviewerView && commentInputRef.current) {
      commentInputRef.current.focus();
      commentInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // If the submitter has unlocked the form after an objection to edit & resubmit:
  if (editing && canModify) {
    const reviewerCommentsBanner = commentsList.length > 0 ? (
      <div className="sd-card" style={{ padding: '12px 16px', marginBottom: '12px', borderLeft: '3px solid var(--warn-500, #f59e0b)' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageSquare size={14} /> Reviewer Comments &amp; Change Requests ({commentsList.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {commentsList.map(c => {
            const fieldObj = fields.find(f => f.key === c.targetField);
            return (
              <div key={c.id} style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-card-subtle)' }}>
                <span className="sd-badge sd-badge-amber sd-badge-xs" style={{ marginRight: '6px' }}>
                  {COMMENT_TYPE_LABELS[c.type] || c.type || 'Note'}
                </span>
                {fieldObj && (
                  <span className="sd-badge sd-badge-gray sd-badge-xs" style={{ marginRight: '6px' }}>
                    Field: {fieldObj.label || fieldObj.key}
                  </span>
                )}
                <span>{c.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

    return (
      <FillFormModal
        template={effectiveTemplate}
        submission={s}
        isViewOnly={false}
        topBanner={reviewerCommentsBanner}
        extraHeaderActions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(false)}
          >
            <Lock size={14} /> Lock Fields
          </button>
        }
        onClose={() => setEditing(false)}
        onDone={() => { setEditing(false); onClose?.(); }}
      />
    );
  }

  // Top status banner rendered directly above the locked A4 form sheet
  const topBanner = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {s.status === 'IN_REVIEW' && (
        <div className="sd-alert sd-alert-info sd-submission-lock-banner" style={{ margin: 0 }}>
          <Lock size={16} />
          <div style={{ flex: 1 }}>
            <strong>
              {isReviewerView
                ? (isOriginator
                  ? `Dual Role (Filer & Reviewer) — Waiting for ${step?.department || 'Department'} Approval`
                  : `Reviewer Inspection Mode — Waiting for ${step?.department || 'Department'} Approval`)
                : 'Read-Only View — Form Locked Under Review'}
            </strong>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem' }}>
              {isReviewerView
                ? (isOriginator
                  ? `You submitted this form and are also an authorized reviewer for ${step?.department || 'this step'} (Decision due ${formatDate(s.expiryDate)}). Form fields are locked during review — use the right panel to add comments, change requests, or Approve / Raise Objection / Reject.`
                  : `Submitted by ${s.submittedByName} on ${formatDate(s.createdAt)} (Decision needed by ${formatDate(s.expiryDate)}). All form fields are locked in their submitted state. Click any field on the form to reference it in a comment or change request, or use the right panel to Approve, Raise Objection, or Reject.`)
                : `Your form is currently undergoing review by ${step?.department || 'approvers'} (Decision needed by ${formatDate(s.expiryDate)}). All form fields are locked and read-only unless a reviewer raises an objection requesting changes.`}
            </p>
          </div>
          {isOriginator && canAct && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setViewRole(prev => (prev === 'reviewer' ? 'submitter' : 'reviewer'))}
            >
              {isReviewerView ? <Eye size={13} /> : <ShieldCheck size={13} />}
              <span>{isReviewerView ? 'View as Submitter (Read-Only)' : 'Switch to Reviewer Mode'}</span>
            </button>
          )}
        </div>
      )}

      {s.status === 'OBJECTION_RAISED' && (
        <div className="sd-alert sd-alert-warn sd-submission-objection-banner" style={{ margin: 0 }}>
          <AlertTriangle size={18} />
          <div style={{ flex: 1 }}>
            <strong>Changes Requested by Reviewer</strong>
            <p style={{ margin: '3px 0 6px' }}>“{s.objectionNotes || 'An approver raised an objection and requested changes on this form.'}”</p>
            <span className="sd-small sd-muted">
              {canModify
                ? 'Click "Unlock & Modify Form" to update the fields directly on this form and resubmit for approval.'
                : `Waiting for ${s.submittedByName} to update answers and resubmit.`}
            </span>
          </div>
          {canModify && (
            <button id="btn-modify-submission-banner" className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
              <Edit3 size={14} /> Unlock &amp; Modify Form
            </button>
          )}
        </div>
      )}

      {s.status === 'APPROVED' && (
        <div className="sd-alert sd-alert-success sd-submission-approved-banner" style={{ margin: 0 }}>
          <CheckCircle2 size={16} />
          <div>
            <strong>Fully Approved &amp; Digitally Signed</strong>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem' }}>
              This form has completed all departmental approval stages. Authorized signatures are stamped on the form sheet below and permanently sealed in read-only state.
            </p>
          </div>
        </div>
      )}

      {s.status === 'REJECTED' && (
        <div className="sd-alert sd-alert-error sd-submission-rejected-banner" style={{ margin: 0 }}>
          <XCircle size={16} />
          <div>
            <strong>Submission Rejected</strong>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem' }}>
              {s.objectionNotes ? `Reason: ${s.objectionNotes}` : 'This submission was rejected by the reviewing department. Form fields are permanently locked.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // Determine whether the right-side rail should be displayed:
  // - Always displayed for Reviewer (`isReviewerView`).
  // - For Submitter (`!isReviewerView`): ONLY displayed if a decision or objection/comment has come (`hasDecisionOrObjections`).
  //   If no decision or objections have come yet (`IN_REVIEW` with 0 comments), the submitter views ONLY the clean read-only form sheet!
  const showRightRail = isReviewerView || hasDecisionOrObjections;

  const submitterVerifyInfo = pkiVerification?.submitterVerification || pkiVerification?.submitterSignature;
  const workflowVerifyList = pkiVerification?.approvalVerifications || pkiVerification?.workflowSignatures || [];

  const rightRail = showRightRail ? (
    <aside className="sd-form-filler-rail sd-print-hide" aria-label="Review and Comments Sidebar">
      <div className="sd-rail-header">
        <div className="sd-rail-header-top">
          <div className="sd-rail-title-row">
            <ShieldCheck size={16} className="sd-rail-icon" />
            <h3 className="sd-rail-title">
              {isReviewerView ? 'Reviewer Decision & Notes' : 'Review Status & Feedback'}
            </h3>
          </div>
          <StatusBadge status={s.status} />
        </div>
        <p className="sd-rail-subtitle">
          {isReviewerView
            ? 'Inspect the locked form fields on the left, attach comments or change requests, or record your department decision.'
            : 'Read-only record of reviewer decisions, comments, and cryptographic signatures.'}
        </p>
      </div>

      <div className="sd-rail-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '14px' }}>
        {/* 1. Reviewer Official Workflow Decision Box (Strictly for active Reviewer) */}
        {isReviewerView && (
          <div
            ref={decisionBoxRef}
            className="sd-card"
            style={{
              padding: '14px',
              border: '1px solid color-mix(in srgb, var(--primary-500) 35%, var(--border-color))',
              background: 'var(--bg-card-subtle)'
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Step {s.currentWorkflowStep || 1}: {step?.department} Decision
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: decision ? '12px' : 0 }}>
              <button
                id="btn-rail-approve"
                type="button"
                className={`btn btn-sm ${decision === 'APPROVE' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDecision(decision === 'APPROVE' ? null : 'APPROVE')}
                style={{ justifyContent: 'center', padding: '7px 6px', fontSize: '0.76rem' }}
              >
                <CheckCircle2 size={13} /> Approve
              </button>
              <button
                id="btn-rail-objection"
                type="button"
                className={`btn btn-sm ${decision === 'OBJECTION' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDecision(decision === 'OBJECTION' ? null : 'OBJECTION')}
                style={{ justifyContent: 'center', padding: '7px 6px', fontSize: '0.76rem' }}
              >
                <AlertTriangle size={13} /> Objection
              </button>
              <button
                id="btn-rail-reject"
                type="button"
                className={`btn btn-sm ${decision === 'REJECT' ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => setDecision(decision === 'REJECT' ? null : 'REJECT')}
                style={{ justifyContent: 'center', padding: '7px 6px', fontSize: '0.76rem' }}
              >
                <XCircle size={13} /> Reject
              </button>
            </div>

            {decision && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '8px' }}>
                  {decision === 'APPROVE'
                    ? 'Approve & Stamp Digital Signature'
                    : decision === 'OBJECTION'
                    ? 'Raise Objection (Request Changes)'
                    : 'Reject Submission'}
                </div>

                {decision === 'APPROVE' && (
                  currentUser?.hasSignature ? (
                    <div className="sd-signature-current sd-signature-sm" style={{ marginBottom: '10px' }}>
                      {currentUser.signatureImage && <img src={currentUser.signatureImage} alt="Your signature" />}
                    </div>
                  ) : (
                    <div className="sd-alert sd-alert-warn" style={{ marginBottom: '10px', padding: '8px 10px' }}>
                      <PenLine size={15} />
                      <div style={{ fontSize: '0.78rem' }}>
                        Saved signature required to approve.{' '}
                        <button type="button" className="sd-link" onClick={openSignatureModal}>Draw it now</button>
                      </div>
                    </div>
                  )
                )}

                <label className="sd-field" style={{ marginBottom: '10px' }}>
                  <span className="sd-label" style={{ fontSize: '0.76rem' }}>
                    {decision === 'APPROVE' ? 'Approval Note (optional)' : 'Reason / Required Changes *'}
                  </span>
                  <textarea
                    id="input-decision-notes"
                    rows={3}
                    className="sd-input"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={
                      decision === 'OBJECTION'
                        ? 'Describe what the submitter should modify on this form…'
                        : decision === 'REJECT'
                        ? 'Provide reason for rejecting this form…'
                        : 'Optional approval remarks…'
                    }
                  />
                </label>

                <div className="sd-btn-row sd-justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => { setDecision(null); setNotes(''); }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-confirm-decision"
                    type="button"
                    className={`btn btn-xs ${decision === 'REJECT' ? 'btn-danger' : 'btn-primary'}`}
                    disabled={busy || (decision !== 'APPROVE' && !notes.trim()) || (decision === 'APPROVE' && !currentUser?.hasSignature)}
                    onClick={handleConfirmDecision}
                  >
                    {busy
                      ? 'Saving…'
                      : decision === 'APPROVE'
                      ? 'Confirm & Sign'
                      : decision === 'OBJECTION'
                      ? 'Send Objection'
                      : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Submitter Quick Unlock Action when Objection is Active */}
        {canModify && !isReviewerView && (
          <div className="sd-card" style={{ padding: '14px', border: '1px solid var(--warn-500, #f59e0b)', background: 'var(--bg-card-subtle)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={15} className="sd-text-warn" /> Changes Requested
            </div>
            <p className="sd-muted" style={{ fontSize: '0.78rem', margin: '0 0 10px' }}>
              Review the comments below, then unlock the form fields to update your answers and resubmit.
            </p>
            <button
              id="btn-rail-unlock-modify"
              type="button"
              className="btn btn-primary btn-sm"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setEditing(true)}
            >
              <Edit3 size={14} /> Unlock &amp; Modify Form Fields
            </button>
          </div>
        )}

        {/* 3. Reviewer Add Comment / Change Request / General Note Box */}
        {isReviewerView && (
          <div className="sd-card" style={{ padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={14} /> Add Review Note / Change Request
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <label className="sd-field" style={{ margin: 0 }}>
                <span className="sd-label" style={{ fontSize: '0.72rem' }}>Note Type</span>
                <select
                  value={newCommentType}
                  onChange={e => setNewCommentType(e.target.value)}
                  className="sd-input"
                  style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                >
                  <option value="CHANGE_REQUEST">Change Request</option>
                  <option value="OBJECTION">Objection</option>
                  <option value="SUGGESTION">Suggestion</option>
                  <option value="COMMENT">General Note</option>
                </select>
              </label>

              <label className="sd-field" style={{ margin: 0 }}>
                <span className="sd-label" style={{ fontSize: '0.72rem' }}>Target Field</span>
                <select
                  value={targetFieldKey}
                  onChange={e => {
                    setTargetFieldKey(e.target.value);
                    if (e.target.value) scrollToFieldOnSheet(e.target.value);
                  }}
                  className="sd-input"
                  style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                >
                  <option value="">Entire Form (General)</option>
                  {fields.map(f => (
                    <option key={f.key} value={f.key}>{f.label || f.key}</option>
                  ))}
                </select>
              </label>
            </div>

            <textarea
              ref={commentInputRef}
              rows={3}
              className="sd-input sd-comment-textarea"
              placeholder={
                targetFieldKey
                  ? `Add ${COMMENT_TYPE_LABELS[newCommentType]?.toLowerCase() || 'note'} for "${fields.find(f => f.key === targetFieldKey)?.label || targetFieldKey}"…`
                  : 'Enter comment, change request, or general note on this form…'
              }
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
            />

            {canAct && (newCommentType === 'OBJECTION' || newCommentType === 'CHANGE_REQUEST') && (
              <label
                className="sd-checkbox-inline sd-small sd-mt-xs"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginTop: '8px', fontSize: '0.75rem' }}
              >
                <input
                  type="checkbox"
                  checked={markAsWorkflowObjection}
                  onChange={e => setMarkAsWorkflowObjection(e.target.checked)}
                />
                <span>Also trigger official workflow objection (unlocks form for submitter)</span>
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span className="sd-muted" style={{ fontSize: '0.7rem' }}>
                Tip: Click any locked field on the form to select it
              </span>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                disabled={commentBusy || !newCommentText.trim()}
                onClick={handlePostComment}
              >
                {commentBusy ? 'Saving…' : `Post ${COMMENT_TYPE_LABELS[newCommentType] || 'Comment'}`}
              </button>
            </div>
          </div>
        )}

        {/* 4. In-Form Comments, Change Requests & General Notes Feed */}
        <div className="sd-card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageSquare size={14} /> Review Notes &amp; Comments ({commentsList.length})
            </span>
          </div>

          {commentsList.length === 0 ? (
            <p className="sd-muted sd-small" style={{ margin: 0 }}>
              No comments, change requests, or notes attached to this form yet.
            </p>
          ) : (
            <div className="sd-comments-pane-list" style={{ maxHeight: 'none' }}>
              {commentsList.map(c => {
                const isAccepted = c.status === 'ACCEPTED';
                const isRejected = c.status === 'REJECTED';
                const isObjection = c.type === 'OBJECTION' || c.status === 'OBJECTION' || c.type === 'CHANGE_REQUEST';
                const authorName = typeof c.author === 'object' && c.author
                  ? (c.author.name || c.author.username || 'Reviewer')
                  : String(c.author || 'Reviewer');
                const authorDept = typeof c.department === 'object' && c.department
                  ? (c.department.name || '')
                  : String(c.department || (typeof c.author === 'object' && c.author?.department) || '');
                const targetFieldObj = c.targetField ? fields.find(f => f.key === c.targetField) : null;

                return (
                  <div
                    key={c.id}
                    className={`sd-comment-balloon ${isAccepted ? 'is-accepted' : isRejected ? 'is-rejected' : isObjection ? 'is-objection' : ''}`}
                  >
                    <div className="sd-comment-balloon-header">
                      <div className="sd-comment-balloon-user">
                        <span className="sd-comment-avatar">
                          {authorName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="sd-comment-author-info">
                          <strong className="sd-comment-author-name">{authorName}</strong>
                          {authorDept && <span className="sd-comment-author-dept">{authorDept}</span>}
                        </div>
                      </div>
                      <div className="sd-comment-badge-wrap">
                        {isAccepted ? (
                          <span className="sd-badge sd-badge-green sd-badge-xs">
                            <Check size={10} /> Accepted
                          </span>
                        ) : isRejected ? (
                          <span className="sd-badge sd-badge-red sd-badge-xs">
                            <X size={10} /> Rejected
                          </span>
                        ) : isObjection ? (
                          <span className="sd-badge sd-badge-amber sd-badge-xs">
                            <AlertTriangle size={10} /> {COMMENT_TYPE_LABELS[c.type] || 'Objection'}
                          </span>
                        ) : (
                          <span className="sd-badge sd-badge-accent sd-badge-xs">
                            {COMMENT_TYPE_LABELS[c.type] || c.type || 'General Note'}
                          </span>
                        )}
                      </div>
                    </div>

                    {c.targetField && (
                      <div style={{ marginTop: '6px' }}>
                        <button
                          type="button"
                          className="sd-badge sd-badge-gray sd-badge-xs"
                          style={{ cursor: 'pointer', border: '1px solid var(--border-color)' }}
                          onClick={() => scrollToFieldOnSheet(c.targetField)}
                          title="Click to highlight this field on the form sheet"
                        >
                          <Tag size={10} /> Field: {targetFieldObj?.label || c.targetField}
                        </button>
                      </div>
                    )}

                    <div className="sd-comment-balloon-body">
                      <p>{c.text}</p>
                    </div>

                    <div className="sd-comment-balloon-footer">
                      <span className="sd-comment-time">
                        {c.timestamp ? new Date(c.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>

                      {isReviewerView && !isAccepted && !isRejected && (
                        <div className="sd-comment-actions">
                          <button
                            type="button"
                            className="sd-comment-action-btn accept"
                            title="Mark resolved / accepted"
                            onClick={() => handleCommentStatus(c.id, 'ACCEPTED')}
                          >
                            <Check size={12} /> Accept
                          </button>
                          <button
                            type="button"
                            className="sd-comment-action-btn reject"
                            title="Dismiss / reject"
                            onClick={() => handleCommentStatus(c.id, 'REJECTED')}
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 5. Approval Chain & PKI Cryptographic Integrity Seal */}
        <div className="sd-card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '10px' }}>
            Approval Chain
          </div>
          <ol className="sd-timeline" style={{ margin: '0 0 14px' }}>
            <li className="sd-timeline-item">
              <CheckCircle2 size={15} className="sd-text-good" />
              <div>
                <strong>Submitted &amp; signed</strong> by {s.submittedByName}
                <div className="sd-muted">{formatDate(s.versionHistory?.at(-1)?.timestamp || s.createdAt, true)}</div>
              </div>
            </li>
            {(s.workflow || []).map((st, i) => (
              <li key={i} className="sd-timeline-item">
                {STEP_ICON[st.status] || STEP_ICON.WAITING}
                <div>
                  <strong>{st.department}</strong>
                  <span className="sd-muted">
                    {' — '}
                    {st.status === 'APPROVED' && `approved & signed by ${st.actedByName}`}
                    {st.status === 'OBJECTION' && `objection by ${st.actedByName}`}
                    {st.status === 'REJECTED' && `rejected by ${st.actedByName}`}
                    {st.status === 'PENDING' && (s.status === 'EXPIRED' ? 'deadline passed' : 'waiting for department admin')}
                    {st.status === 'WAITING' && 'not started'}
                  </span>
                  {st.actedAt && <div className="sd-muted">{formatDate(st.actedAt, true)}</div>}
                  {st.notes && <div className="sd-quote">“{st.notes}”</div>}
                </div>
              </li>
            ))}
          </ol>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} style={{ color: pkiVerification?.overallValid ? 'var(--primary-500)' : 'var(--text-muted)' }} />
                PKI Cryptographic Seal
              </span>
              <button
                id="btn-verify-pki-signatures"
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={handleVerifyPki}
                disabled={verifyingPki}
              >
                <RefreshCw size={11} className={verifyingPki ? 'spin' : ''} />
                <span>{verifyingPki ? 'Verifying…' : 'Verify Seal'}</span>
              </button>
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card-subtle)',
                border: '1px solid var(--border-color)',
                fontSize: '0.76rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                  <Key size={12} /> {s.submittedByName}
                </span>
                {pkiVerification ? (
                  submitterVerifyInfo?.valid ? (
                    <span className="sd-badge sd-badge-green sd-badge-xs">
                      <CheckCircle2 size={10} /> RSA-SHA256 Valid
                    </span>
                  ) : (
                    <span className="sd-badge sd-badge-red sd-badge-xs">
                      <ShieldAlert size={10} /> Invalid / Tampered
                    </span>
                  )
                ) : s.pkiSignature ? (
                  <span className="sd-badge sd-badge-accent sd-badge-xs">Sealed</span>
                ) : (
                  <span className="sd-badge sd-badge-gray sd-badge-xs">Unsealed</span>
                )}
              </div>
              {workflowVerifyList.map((ws, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                  <span>Step {ws.stepNumber || ws.stepIndex || idx + 1}: {ws.department}</span>
                  {ws.valid ? (
                    <span className="sd-badge sd-badge-green sd-badge-xs">Verified</span>
                  ) : (
                    <span className="sd-badge sd-badge-red sd-badge-xs">Invalid</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  ) : null;

  return (
    <>
      <FillFormModal
        template={effectiveTemplate}
        submission={s}
        isViewOnly={true}
        topBanner={topBanner}
        customRightRail={rightRail}
        highlightedFieldKey={targetFieldKey || null}
        onFieldClickInViewOnly={isReviewerView ? handleFieldClickOnLockedSheet : null}
        headerBadgesOverride={
          <>
            <StatusBadge status={s.status} />
            <span className="sd-badge sd-badge-gray" title="All form fields are locked">
              <Lock size={11} /> Locked
            </span>
          </>
        }
        headerMetaOverride={
          <>
            <span className="sd-mono">{s.uniqueNumber}</span>
            <span>·</span>
            <span>Submitted by <strong>{s.submittedByName}</strong> on {formatDate(s.createdAt)}</span>
            {['IN_REVIEW', 'OBJECTION_RAISED'].includes(s.status) && s.expiryDate && (
              <>
                <span>·</span>
                <span>Decision due <strong>{formatDate(s.expiryDate)}</strong></span>
              </>
            )}
          </>
        }
        extraHeaderActions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* If current user is BOTH originator and approver (e.g. Super Admin), allow 1-click toggle between Submitter Read-Only view and Reviewer view */}
            {isOriginator && canAct && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setViewRole(prev => (prev === 'reviewer' ? 'submitter' : 'reviewer'))}
                title={isReviewerView ? 'Preview how the submitter sees this form (Read-Only)' : 'Switch to Reviewer Mode to comment, approve, or reject'}
              >
                {isReviewerView ? <Eye size={14} /> : <ShieldCheck size={14} />}
                <span>{isReviewerView ? 'Submitter View' : 'Reviewer Mode'}</span>
              </button>
            )}

            <button
              id="btn-download-submission-docx"
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={downloadingDocx}
              onClick={handleDownloadDocx}
              title="Download Microsoft Word document (.docx)"
            >
              {downloadingDocx ? <Loader2 size={14} className="sd-spin" /> : <Download size={14} />}
              <span>{downloadingDocx ? 'Downloading…' : 'Download .docx'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowVersionModal(true)}
              title="View Git-style submission version history"
            >
              <History size={14} />
              <span>History</span>
            </button>

            {canModify && (
              <button
                id="btn-modify-submission"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setEditing(true)}
              >
                <Edit3 size={14} />
                <span>Unlock &amp; Modify</span>
              </button>
            )}

            {isReviewerView && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSelectDecision('REJECT')}
                >
                  <XCircle size={14} />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSelectDecision('OBJECTION')}
                >
                  <AlertTriangle size={14} />
                  <span>Raise Objection</span>
                </button>
                <button
                  id="btn-approve-submission"
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSelectDecision('APPROVE')}
                >
                  <CheckCircle2 size={14} />
                  <span>Approve &amp; Sign</span>
                </button>
              </>
            )}
          </div>
        }
        onClose={onClose}
      />

      {showVersionModal && (
        <VersionHistoryModal
          item={s}
          target={s}
          kind="submission"
          onClose={() => setShowVersionModal(false)}
        />
      )}
    </>
  );
};
