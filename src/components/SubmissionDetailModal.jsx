import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { printWordDocument } from '../utils/wordPrintEngine';
import { Modal, StatusBadge, formatDate } from './ui';
import { FillFormModal } from './FillFormModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import {
  FileDown, CheckCircle2, AlertTriangle, XCircle, Edit3, PenLine, Clock, CircleDot,
  History, MessageSquare, Check, X, Lock, ShieldCheck, ShieldAlert, RefreshCw, Key,
  Printer, Loader2
} from 'lucide-react';

const STEP_ICON = {
  APPROVED: <CheckCircle2 size={16} className="sd-text-good" />,
  OBJECTION: <AlertTriangle size={16} className="sd-text-warn" />,
  REJECTED: <XCircle size={16} className="sd-text-bad" />,
  PENDING: <CircleDot size={16} className="sd-text-accent" />,
  WAITING: <Clock size={16} className="sd-muted" />
};

export const SubmissionDetailModal = ({ submissionId, onClose }) => {
  const {
    formSubmissions, formTemplates, currentUser, isSuperAdmin, workflowAction,
    openDocumentPreview, openSignatureModal, addSubmissionComment, updateSubmissionComment, addToast,
    verifySubmissionSignatures
  } = useApp();
  const [decision, setDecision] = useState(null); // 'APPROVE' | 'OBJECTION' | 'REJECT'
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [printingWord, setPrintingWord] = useState(false);

  // PKI Verification state
  const [verifyingPki, setVerifyingPki] = useState(false);
  const [pkiVerification, setPkiVerification] = useState(null);

  // In-form comments state
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentType, setNewCommentType] = useState('OBJECTION');
  const [markAsWorkflowObjection, setMarkAsWorkflowObjection] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);

  const s = formSubmissions.find(x => x.id === submissionId);

  const handlePrintSubmission = async () => {
    if (!s || printingWord) return;
    try {
      setPrintingWord(true);
      addToast('Preparing Word Document', `Generating ${s.uniqueNumber} with digital signatures and stamps for print...`, 'info');
      const blob = await apiService.getSubmissionDocument(s.id);
      await printWordDocument(blob, {
        title: `${s.uniqueNumber}_${s.title}`
      });
    } catch (err) {
      console.error('Word Print Error:', err);
      addToast('Print Error', err.message || 'Failed to print submission document', 'error');
    } finally {
      setPrintingWord(false);
    }
  };

  if (!s) return null;

  const template = formTemplates.find(t => t.id === s.templateId);
  const step = s.workflow?.[(s.currentWorkflowStep || 1) - 1];
  const isOriginator = s.submittedById === currentUser?.id;
  const canAct = s.status === 'IN_REVIEW' && step &&
    (isSuperAdmin || (currentUser.systemRole === 'admin' && currentUser.department === step.department));
  const canModify = s.status === 'OBJECTION_RAISED' && (isOriginator || isSuperAdmin);
  const fields = template?.fields || Object.keys(s.formData || {}).map(k => ({ key: k, label: k }));

  const confirm = async () => {
    setBusy(true);
    const r = await workflowAction(s.id, decision, notes);
    setBusy(false);
    if (r) { setDecision(null); setNotes(''); }
  };

  const handlePostComment = async () => {
    if (!newCommentText.trim()) return;
    setCommentBusy(true);
    const newComment = {
      id: 'cm_' + Math.random().toString(36).slice(2, 9),
      author: currentUser?.name || 'User',
      authorId: currentUser?.id,
      department: currentUser?.department || 'General',
      text: newCommentText.trim(),
      type: newCommentType,
      status: newCommentType === 'OBJECTION' ? 'OBJECTION' : 'OPEN',
      timestamp: new Date().toISOString()
    };
    await addSubmissionComment(s.id, newComment);

    if (markAsWorkflowObjection && canAct) {
      await workflowAction(s.id, 'OBJECTION', newCommentText.trim());
      setMarkAsWorkflowObjection(false);
    }

    setNewCommentText('');
    setCommentBusy(false);
    addToast('Comment added', 'In-form comment saved', 'info');
  };

  const handleCommentStatus = async (commentId, nextStatus) => {
    await updateSubmissionComment(s.id, commentId, { status: nextStatus });
    addToast('Status updated', `Comment marked as ${nextStatus}`, 'success');
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

  if (editing) {
    return <FillFormModal template={template} submission={s} onClose={() => setEditing(false)} />;
  }

  return (
    <>
      <Modal
        id="submission-detail-modal"
        size="lg"
        title={`${s.uniqueNumber} · ${s.title}`}
        subtitle={`Submitted by ${s.submittedByName} on ${formatDate(s.createdAt)} · Version ${s.version}`}
        onClose={onClose}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() =>
              openDocumentPreview({ kind: 'submission', id: s.id, title: `${s.uniqueNumber} — ${s.title}`, fileName: `${s.uniqueNumber}_v${s.version}.docx` })}>
              <FileDown size={15} /> View Word document
            </button>
            <button
              id="btn-print-submission-word"
              className="btn btn-secondary sd-mr-auto"
              disabled={printingWord}
              onClick={handlePrintSubmission}
              title="Print authentic Word document with stamped signatures and PKI digital seals"
            >
              {printingWord ? <Loader2 size={15} className="sd-spin" /> : <Printer size={15} />}
              <span>{printingWord ? 'Formatting…' : 'Print Word document'}</span>
            </button>
            <button className="btn btn-secondary" onClick={() => setShowVersionModal(true)}>
              <History size={15} /> Version History
            </button>
            {canModify && (
              <button id="btn-modify-submission" className="btn btn-primary" onClick={() => setEditing(true)}>
                <Edit3 size={15} /> Modify &amp; resubmit
              </button>
            )}
            {canAct && !decision && (
              <>
                <button className="btn btn-secondary" onClick={() => setDecision('REJECT')}><XCircle size={15} /> Reject</button>
                <button className="btn btn-secondary" onClick={() => setDecision('OBJECTION')}><AlertTriangle size={15} /> Raise objection</button>
                <button id="btn-approve-submission" className="btn btn-primary" onClick={() => setDecision('APPROVE')}><CheckCircle2 size={15} /> Approve &amp; sign</button>
              </>
            )}
            {!canModify && !canAct && <button className="btn btn-secondary" onClick={onClose}>Close</button>}
          </>
        }
      >
        <div className="sd-detail-top">
          <StatusBadge status={s.status} />
          {['IN_REVIEW', 'OBJECTION_RAISED', 'EXPIRED'].includes(s.status) && (
            <span className="sd-muted">Decision needed by <strong>{formatDate(s.expiryDate)}</strong></span>
          )}
          {s.status === 'IN_REVIEW' && step && <span className="sd-muted">· Waiting for <strong>{step.department}</strong></span>}
        </div>

        {/* Status Lifecycle & Edit-Lock Banners */}
        {s.status === 'IN_REVIEW' && (
          <div className="sd-alert sd-alert-info sd-submission-lock-banner">
            <Lock size={16} />
            <div>
              <strong>Form Locked (Under Review)</strong>
              <p style={{ margin: '3px 0 0' }}>
                This form is undergoing review by <strong>{step?.department || 'approvers'}</strong>.
                {isOriginator
                  ? ' As the originator, you cannot change anything on this form unless a reviewer explicitly raises an objection requesting changes.'
                  : ' Form values are frozen during the review process.'}
              </p>
            </div>
          </div>
        )}

        {s.status === 'OBJECTION_RAISED' && (
          <div className="sd-alert sd-alert-warn sd-submission-objection-banner">
            <AlertTriangle size={18} />
            <div style={{ flex: 1 }}>
              <strong>Action Required: Reviewer Requested Changes</strong>
              <p style={{ margin: '3px 0 6px' }}>“{s.objectionNotes || 'An approver raised an objection and requested changes.'}”</p>
              <span className="sd-small sd-muted">
                {isOriginator
                  ? 'You are now authorized to modify the form fields and resubmit for approval.'
                  : `Waiting for ${s.submittedByName} to update answers and resubmit.`}
              </span>
            </div>
            {canModify && (
              <button id="btn-modify-submission-banner" className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
                <Edit3 size={14} /> Modify &amp; resubmit
              </button>
            )}
          </div>
        )}

        {s.status === 'APPROVED' && (
          <div className="sd-alert sd-alert-success sd-submission-approved-banner">
            <CheckCircle2 size={16} />
            <div>
              <strong>Fully Approved &amp; Signed</strong>
              <p style={{ margin: '3px 0 0' }}>
                This document has completed all departmental approval stages. Authorized signatures have been stamped onto the Word document. The document is permanently archived and cannot be edited.
              </p>
            </div>
          </div>
        )}

        {s.status === 'REJECTED' && (
          <div className="sd-alert sd-alert-error sd-submission-rejected-banner">
            <XCircle size={16} />
            <div>
              <strong>Submission Rejected</strong>
              <p style={{ margin: '3px 0 0' }}>
                {s.objectionNotes ? `Reason: ${s.objectionNotes}` : 'This submission was rejected by the review team. No further modifications are permitted.'}
              </p>
            </div>
          </div>
        )}

        {decision && (
          <div className="sd-decision-box">
            <h4>
              {decision === 'APPROVE' ? 'Approve and sign' : decision === 'OBJECTION' ? 'Raise an objection' : 'Reject this form'}
            </h4>
            {decision === 'APPROVE' && (
              currentUser.hasSignature ? (
                <div className="sd-signature-current sd-signature-sm">
                  {currentUser.signatureImage && <img src={currentUser.signatureImage} alt="Your signature" />}
                </div>
              ) : (
                <div className="sd-alert sd-alert-warn">
                  <PenLine size={16} />
                  <div>You need a saved signature to approve. <button className="sd-link" onClick={openSignatureModal}>Draw it now</button></div>
                </div>
              )
            )}
            <label className="sd-field">
              <span className="sd-label">{decision === 'APPROVE' ? 'Comment (optional)' : 'Reason *'}</span>
              <textarea
                id="input-decision-notes"
                rows={3}
                className="sd-input"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={decision === 'OBJECTION' ? 'What should the submitter change?' : ''}
              />
            </label>
            <div className="sd-btn-row sd-justify-end">
              <button className="btn btn-secondary" onClick={() => { setDecision(null); setNotes(''); }} disabled={busy}>Cancel</button>
              <button
                id="btn-confirm-decision"
                className={`btn ${decision === 'REJECT' ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy || (decision !== 'APPROVE' && !notes.trim()) || (decision === 'APPROVE' && !currentUser.hasSignature)}
                onClick={confirm}
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        <section className="sd-section">
          <h3 className="sd-section-title">Answers</h3>
          {fields.length === 0 ? <p className="sd-muted">No fields.</p> : (
            <dl className="sd-answers">
              {fields.map(f => (
                <div key={f.key} className="sd-answer">
                  <dt>{f.label}</dt>
                  <dd>{String(s.formData?.[f.key] ?? '').trim() || <span className="sd-muted">—</span>}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/* MS Word style in-form comments & objections */}
        <section className="sd-section">
          <div className="sd-flex-between sd-mb-xs">
            <h3 className="sd-section-title" style={{ margin: 0 }}>
              <MessageSquare size={15} /> In-Form Comments &amp; Review ({(s.comments || []).length})
            </h3>
            <span className="sd-muted sd-xs">MS Word style balloon comments</span>
          </div>

          <div className="sd-submission-comments-wrap">
            {(!s.comments || s.comments.length === 0) ? (
              <p className="sd-muted sd-small">No comments or objections attached to this form.</p>
            ) : (
              <div className="sd-comments-pane-list">
                {s.comments.map(c => {
                  const isAccepted = c.status === 'ACCEPTED';
                  const isRejected = c.status === 'REJECTED';
                  const isObjection = c.type === 'OBJECTION' || c.status === 'OBJECTION';
                  const authorName = typeof c.author === 'object' && c.author
                    ? (c.author.name || c.author.username || 'User')
                    : String(c.author || 'User');
                  const authorDept = typeof c.department === 'object' && c.department
                    ? (c.department.name || '')
                    : String(c.department || (typeof c.author === 'object' && c.author?.department) || '');

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
                              <AlertTriangle size={10} /> Objection
                            </span>
                          ) : (
                            <span className="sd-badge sd-badge-accent sd-badge-xs">
                              {c.type || 'Note'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="sd-comment-balloon-body">
                        <p>{c.text}</p>
                        {c.resolvedBy && (
                          <div className="sd-comment-resolved-tag">
                            {isAccepted ? '✓ Accepted by ' : '✕ Rejected by '} {c.resolvedBy}
                          </div>
                        )}
                      </div>

                      <div className="sd-comment-balloon-footer">
                        <span className="sd-comment-time">
                          {c.timestamp ? new Date(c.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>

                        {!isAccepted && !isRejected && (canAct || canModify || isSuperAdmin) && (
                          <div className="sd-comment-actions">
                            <button
                              className="sd-comment-action-btn accept"
                              title="Accept change"
                              onClick={() => handleCommentStatus(c.id, 'ACCEPTED')}
                            >
                              <Check size={12} /> Accept
                            </button>
                            <button
                              className="sd-comment-action-btn reject"
                              title="Reject change"
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

            <div className="sd-comments-pane-input-box sd-mt-sm">
              <div className="sd-comments-input-head">
                <label>Add a comment or objection:</label>
                <select
                  value={newCommentType}
                  onChange={e => setNewCommentType(e.target.value)}
                  className="sd-comment-type-select"
                >
                  <option value="OBJECTION">Objection</option>
                  <option value="CHANGE_REQUEST">Change Request</option>
                  <option value="SUGGESTION">Suggestion</option>
                  <option value="COMMENT">General Note</option>
                </select>
              </div>
              <textarea
                rows={2}
                className="sd-input sd-comment-textarea"
                placeholder="Enter comment on this form…"
                value={newCommentText}
                onChange={e => setNewCommentText(e.target.value)}
              />

              {canAct && (newCommentType === 'OBJECTION' || newCommentType === 'CHANGE_REQUEST') && (
                <label className="sd-checkbox-inline sd-small sd-mt-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={markAsWorkflowObjection}
                    onChange={e => setMarkAsWorkflowObjection(e.target.checked)}
                  />
                  <span>Also trigger official workflow objection (pauses approval &amp; permits originator to edit)</span>
                </label>
              )}

              <div className="sd-comments-input-footer">
                <span className="sd-muted sd-xs">Visible to submitter &amp; approving departments</span>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  disabled={commentBusy || !newCommentText.trim()}
                  onClick={handlePostComment}
                >
                  {commentBusy ? 'Saving…' : 'Post Comment'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* PKI Cryptographic Verification & Digital Seal */}
        <section className="sd-section">
          <div className="sd-flex-between sd-mb-xs" style={{ alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} style={{ color: pkiVerification?.overallValid ? 'var(--primary-500)' : 'var(--text-muted)' }} />
              <h3 className="sd-section-title" style={{ margin: 0 }}>
                PKI Cryptographic Integrity Seal
              </h3>
            </div>
            <button
              id="btn-verify-pki-signatures"
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleVerifyPki}
              disabled={verifyingPki}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <RefreshCw size={12} className={verifyingPki ? 'spin' : ''} />
              <span>{verifyingPki ? 'Verifying RSA Hashes…' : 'Verify Digital Signatures'}</span>
            </button>
          </div>

          <p className="sd-muted sd-xs" style={{ margin: '0 0 10px 0' }}>
            Form submissions and workflow approvals are sealed with X.509 v3 RSA-2048 public key cryptography to guarantee non-repudiation and prevent data tampering.
          </p>

          {/* Submitter Signature Card */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card-subtle)',
              border: `1px solid ${
                pkiVerification?.submitterSignature?.valid
                  ? 'color-mix(in srgb, var(--primary-500) 40%, var(--border-color))'
                  : pkiVerification?.submitterSignature?.status === 'TAMPERED'
                  ? 'var(--bad-500)'
                  : 'var(--border-color)'
              }`,
              marginBottom: '8px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={14} style={{ color: 'var(--primary-400)' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                  Originator Seal: {s.submittedByName}
                </span>
              </div>
              <div>
                {pkiVerification ? (
                  pkiVerification.submitterSignature?.valid ? (
                    <span className="sd-badge sd-badge-green sd-badge-xs">
                      <CheckCircle2 size={10} /> RSA-SHA256 Valid
                    </span>
                  ) : pkiVerification.submitterSignature?.status === 'TAMPERED' ? (
                    <span className="sd-badge sd-badge-red sd-badge-xs">
                      <ShieldAlert size={10} /> Data Tampered
                    </span>
                  ) : (
                    <span className="sd-badge sd-badge-gray sd-badge-xs">
                      {pkiVerification.submitterSignature?.status || 'Unsigned'}
                    </span>
                  )
                ) : s.pkiSignature ? (
                  <span className="sd-badge sd-badge-accent sd-badge-xs">
                    <ShieldCheck size={10} /> Sealed (Click Verify)
                  </span>
                ) : (
                  <span className="sd-badge sd-badge-gray sd-badge-xs">Legacy / Not Sealed</span>
                )}
              </div>
            </div>

            {pkiVerification?.submitterSignature?.fingerprint && (
              <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Cert Fingerprint: {pkiVerification.submitterSignature.fingerprint}
                {pkiVerification.submitterSignature.serialNumber && (
                  <span> · Serial: #{pkiVerification.submitterSignature.serialNumber.slice(0, 12)}…</span>
                )}
              </div>
            )}
          </div>

          {/* Workflow Signatures List */}
          {pkiVerification && pkiVerification.workflowSignatures?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                Department Approval Cryptographic Seals:
              </div>
              {pkiVerification.workflowSignatures.map((ws, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card-subtle)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={13} style={{ color: ws.valid ? 'var(--primary-500)' : 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      Step {ws.stepIndex}: {ws.department} ({ws.actedByName || 'Department Approver'})
                    </span>
                  </div>
                  <div>
                    {ws.valid ? (
                      <span className="sd-badge sd-badge-green sd-badge-xs">
                        <CheckCircle2 size={10} /> Seal Verified
                      </span>
                    ) : ws.status === 'TAMPERED' ? (
                      <span className="sd-badge sd-badge-red sd-badge-xs">
                        <ShieldAlert size={10} /> Invalid Signature
                      </span>
                    ) : (
                      <span className="sd-badge sd-badge-gray sd-badge-xs">{ws.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sd-section">
          <h3 className="sd-section-title">Approval chain</h3>
          <ol className="sd-timeline">
            <li className="sd-timeline-item">
              <CheckCircle2 size={16} className="sd-text-good" />
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
                    {st.status === 'PENDING' && (s.status === 'EXPIRED' ? 'deadline passed' : 'waiting for any department admin')}
                    {st.status === 'WAITING' && 'not started'}
                    {!STEP_ICON[st.status] && (st.status || 'unknown')}
                  </span>
                  {st.actedAt && <div className="sd-muted">{formatDate(st.actedAt, true)}</div>}
                  {st.notes && <div className="sd-quote">“{st.notes}”</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {s.versionHistory?.length > 0 && (
          <section className="sd-section">
            <div className="sd-flex-between">
              <h3 className="sd-section-title"><History size={15} /> Version history</h3>
              <button
                type="button"
                className="sd-link sd-small"
                onClick={() => setShowVersionModal(true)}
              >
                Open Git View
              </button>
            </div>
            <ul className="sd-history">
              {[...s.versionHistory].reverse().map((v, i) => (
                <li key={i}>
                  <span className="sd-badge sd-badge-gray">v{v.version}</span>
                  <span>{v.summary}</span>
                  <span className="sd-muted">{v.modifiedBy} · {formatDate(v.timestamp, true)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Modal>

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
