import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, SlaBadge, UserAvatar } from './ui';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

const KANBAN_COLUMNS = [
  { id: 'IN_REVIEW', label: 'In Review', tone: 'blue' },
  { id: 'OBJECTION_RAISED', label: 'Changes Requested', tone: 'amber' },
  { id: 'APPROVED', label: 'Approved', tone: 'green' },
  { id: 'REJECTED', label: 'Rejected', tone: 'red' }
];

const isSubmissionExpired = (expiryDate) => {
  if (!expiryDate) return false;
  const datePart = String(expiryDate).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < today;
};

export const SubmissionKanbanBoard = ({ rows = [], onOpen }) => {
  const {
    currentUser,
    isAdmin,
    isSuperAdmin,
    workflowAction,
    openSignatureModal,
    addToast
  } = useApp();

  const [draggingId, setDraggingId] = useState(null);
  const [dropColId, setDropColId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null); // { submission, action: 'OBJECTION' | 'REJECT' }
  const [decisionNote, setDecisionNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const justDraggedRef = useRef(false);

  const canActOnSubmission = (s) => {
    if (!s || s.status !== 'IN_REVIEW' || !currentUser || !isAdmin) return false;
    if (isSubmissionExpired(s.expiryDate)) return false;
    const wf = Array.isArray(s.workflow) ? s.workflow : [];
    const idx = (s.currentWorkflowStep || 1) - 1;
    const step = wf[idx];
    if (!step) return false;
    const dept = typeof step === 'string' ? step : step.department;
    return Boolean(isSuperAdmin || (dept && dept === currentUser.department));
  };

  const draggingSubmission = useMemo(
    () => (draggingId ? rows.find(r => String(r.id) === String(draggingId)) || null : null),
    [draggingId, rows]
  );

  const groupedByColumn = useMemo(() => {
    const map = {
      IN_REVIEW: [],
      OBJECTION_RAISED: [],
      APPROVED: [],
      REJECTED: []
    };
    for (const s of rows) {
      if (map[s.status]) {
        map[s.status].push(s);
      } else {
        map.IN_REVIEW.push(s);
      }
    }
    return map;
  }, [rows]);

  const getDropHint = (colId) => {
    if (!draggingSubmission || colId === 'IN_REVIEW') return null;
    if (colId === 'APPROVED') {
      const wf = Array.isArray(draggingSubmission.workflow) ? draggingSubmission.workflow : [];
      const idx = (draggingSubmission.currentWorkflowStep || 1) - 1;
      if (idx + 1 < wf.length) {
        const nextStep = wf[idx + 1];
        const nextDept = typeof nextStep === 'string' ? nextStep : nextStep?.department;
        return `Approve Step ${idx + 1}/${wf.length}${nextDept ? ` → ${nextDept}` : ''}`;
      }
      return 'Approve & Finalize';
    }
    if (colId === 'OBJECTION_RAISED') return 'Request Changes…';
    if (colId === 'REJECTED') return 'Reject Submission…';
    return null;
  };

  const handleDropOnColumn = async (targetColId, e) => {
    e.preventDefault();
    const droppedId = draggingId || e.dataTransfer?.getData('text/plain');
    setDraggingId(null);
    setDropColId(null);

    if (!droppedId || targetColId === 'IN_REVIEW') return;
    const targetSub = rows.find(r => String(r.id) === String(droppedId));
    if (!targetSub || !canActOnSubmission(targetSub) || busyId) return;

    if (targetColId === 'APPROVED') {
      if (!currentUser?.hasSignature) {
        addToast(
          'Signature Required',
          'Please draw and save your digital signature before approving.',
          'warn'
        );
        openSignatureModal?.();
        return;
      }
      setBusyId(targetSub.id);
      try {
        await workflowAction(targetSub.id, 'APPROVE', '');
      } finally {
        setBusyId(null);
      }
      return;
    }

    if (targetColId === 'OBJECTION_RAISED' || targetColId === 'REJECTED') {
      setDecisionNote('');
      setPendingDecision({
        submission: targetSub,
        action: targetColId === 'OBJECTION_RAISED' ? 'OBJECTION' : 'REJECT'
      });
    }
  };

  const handleConfirmDecisionNote = async (e) => {
    e?.preventDefault();
    if (!pendingDecision || !decisionNote.trim()) return;
    const { submission, action } = pendingDecision;
    setSubmittingNote(true);
    setBusyId(submission.id);
    try {
      const res = await workflowAction(submission.id, action, decisionNote.trim());
      if (res) {
        setPendingDecision(null);
        setDecisionNote('');
      }
    } finally {
      setSubmittingNote(false);
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="sd-kb-board" role="region" aria-label="Submissions Kanban Board">
        {KANBAN_COLUMNS.map(col => {
          const items = groupedByColumn[col.id] || [];
          const canDropHere = Boolean(draggingSubmission && col.id !== 'IN_REVIEW');
          const isDropTarget = canDropHere && dropColId === col.id;
          const dropHint = canDropHere ? getDropHint(col.id) : null;

          return (
            <section
              key={col.id}
              className={`sd-kb-col ${canDropHere ? 'can-drop' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
              onDragOver={(e) => {
                if (!canDropHere) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropColId !== col.id) setDropColId(col.id);
              }}
              onDragLeave={(e) => {
                if (dropColId === col.id && !e.currentTarget.contains(e.relatedTarget)) {
                  setDropColId(null);
                }
              }}
              onDrop={(e) => handleDropOnColumn(col.id, e)}
            >
              <header className="sd-kb-col-head">
                <div className="sd-kb-col-title-wrap">
                  <span className={`sd-kb-col-dot is-${col.tone}`} />
                  <h3 className="sd-kb-col-title">{col.label}</h3>
                </div>
                <span className="sd-kb-col-count">{items.length}</span>
              </header>

              {dropHint && (
                <div className={`sd-kb-drop-banner is-${col.tone} ${isDropTarget ? 'is-active' : ''}`}>
                  {col.id === 'APPROVED' && <CheckCircle2 size={13} />}
                  {col.id === 'OBJECTION_RAISED' && <AlertTriangle size={13} />}
                  {col.id === 'REJECTED' && <XCircle size={13} />}
                  <span>{dropHint}</span>
                </div>
              )}

              <div className="sd-kb-col-body">
                {items.length === 0 ? (
                  <div className="sd-kb-empty">No submissions</div>
                ) : (
                  items.map(s => {
                    const actionable = canActOnSubmission(s) && busyId !== s.id;
                    const isOriginator = s.submittedById === currentUser?.id;
                    const needsMyRevision = s.status === 'OBJECTION_RAISED' && isOriginator;
                    const wf = Array.isArray(s.workflow) ? s.workflow : [];
                    const stepIdx = Math.max(0, Math.min(wf.length - 1, (s.currentWorkflowStep || 1) - 1));
                    const activeStep = wf[stepIdx];
                    const stepDept = typeof activeStep === 'string' ? activeStep : activeStep?.department;
                    const isDragging = String(draggingId) === String(s.id);

                    return (
                      <article
                        key={s.id}
                        className={`sd-kb-card ${actionable ? 'is-actionable' : ''} ${needsMyRevision ? 'needs-revision' : ''} ${isDragging ? 'is-dragging' : ''} ${busyId === s.id ? 'is-busy' : ''}`}
                        draggable={actionable}
                        title={
                          actionable
                            ? 'Click to review form sheet, or drag to Approved / Changes Requested / Rejected'
                            : 'Click to open submission'
                        }
                        onDragStart={(e) => {
                          if (!actionable) {
                            e.preventDefault();
                            return;
                          }
                          justDraggedRef.current = true;
                          setDraggingId(s.id);
                          e.dataTransfer.effectAllowed = 'move';
                          try { e.dataTransfer.setData('text/plain', String(s.id)); } catch {}
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropColId(null);
                          setTimeout(() => {
                            justDraggedRef.current = false;
                          }, 80);
                        }}
                        onClick={() => {
                          if (justDraggedRef.current) return;
                          onOpen?.(s.id);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpen?.(s.id);
                          }
                        }}
                      >
                        <div className="sd-kb-card-top">
                          <span className="sd-mono sd-kb-card-num">{s.uniqueNumber}</span>
                          <SlaBadge
                            createdAt={s.createdAt}
                            expiryDate={s.expiryDate}
                            status={s.status}
                          />
                        </div>

                        <h4 className="sd-kb-card-title">{s.title}</h4>

                        {needsMyRevision && (
                          <div className="sd-kb-revision-tag">
                            <AlertTriangle size={11} /> Needs your revision
                          </div>
                        )}

                        <div className="sd-kb-card-foot">
                          <div className="sd-kb-submitter">
                            <UserAvatar name={s.submittedByName} size="xs" />
                            <span>{isOriginator ? 'You' : s.submittedByName}</span>
                          </div>

                          <span className="sd-kb-stage-pill">
                            {s.status === 'IN_REVIEW' && wf.length > 0
                              ? `${stepIdx + 1}/${wf.length}${stepDept ? ` · ${stepDept}` : ''}`
                              : `v${s.version || 1}`}
                          </span>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Compact 1-Field Note Prompt for Request Changes / Reject */}
      {pendingDecision && (
        <Modal
          id="kanban-decision-note-modal"
          size="sm"
          title={pendingDecision.action === 'OBJECTION' ? 'Request Changes' : 'Reject Submission'}
          subtitle={`${pendingDecision.submission.uniqueNumber} — ${pendingDecision.submission.title}`}
          onClose={() => !submittingNote && setPendingDecision(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={submittingNote}
                onClick={() => setPendingDecision(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${pendingDecision.action === 'REJECT' ? 'btn-danger' : 'btn-primary'}`}
                disabled={submittingNote || !decisionNote.trim()}
                onClick={handleConfirmDecisionNote}
              >
                {submittingNote
                  ? 'Saving…'
                  : pendingDecision.action === 'OBJECTION'
                    ? 'Send Back for Changes'
                    : 'Reject Submission'}
              </button>
            </div>
          }
        >
          <form onSubmit={handleConfirmDecisionNote}>
            <label className="sd-label" htmlFor="kb-decision-note-input" style={{ marginBottom: '6px', display: 'block' }}>
              {pendingDecision.action === 'OBJECTION'
                ? 'What needs to be updated by the submitter?'
                : 'Reason for rejecting this submission'}
            </label>
            <textarea
              id="kb-decision-note-input"
              className="sd-input"
              rows={3}
              autoFocus
              required
              placeholder={
                pendingDecision.action === 'OBJECTION'
                  ? 'e.g. Please attach the vendor quote and update the start date…'
                  : 'e.g. Duplicate request or outside current budget period…'
              }
              value={decisionNote}
              onChange={e => setDecisionNote(e.target.value)}
            />
          </form>
        </Modal>
      )}
    </>
  );
};

export default SubmissionKanbanBoard;

