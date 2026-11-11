import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Modal } from './ui';
import {
  CheckCircle2, AlertTriangle, Plus, X,
  ArrowUp, ArrowDown, GripVertical, Lock, MessageSquare
} from 'lucide-react';

const DEADLINE_OPTIONS = [3, 7, 14, 30, 60];

export const normalizeRouteItems = (wf) => {
  if (!Array.isArray(wf)) return [];
  const seen = new Set();
  const out = [];
  for (const step of wf) {
    if (!step) continue;
    const department = typeof step === 'string'
      ? step.trim()
      : String(step.department || step.name || '').trim();
    if (!department) continue;
    const key = department.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const instruction = typeof step === 'object' && typeof (step.instruction ?? step.note) === 'string'
      ? String(step.instruction ?? step.note).trim().slice(0, 240)
      : '';
    out.push(instruction ? { department, instruction } : { department });
  }
  return out;
};

export const ApprovalRouteModal = ({
  isOpen = true,
  onClose,
  formTitle = '',
  owningDepartment = '',
  workflow = [],
  audience = 'DEPARTMENT',
  defaultExpiryDays = 14,
  sheetSigSlots = null,
  governingMainForm = null,
  template = null,
  onApply
}) => {
  const {
    departments,
    users,
    updateTemplateWorkflow
  } = useApp();

  const isDirectSaveMode = Boolean(template?.id && !onApply);
  const effectiveTitle = formTitle || template?.title || 'Untitled Form';
  const effectiveOwningDept = owningDepartment || template?.department || departments?.[0]?.name || '';
  const isLockedByMainForm = Boolean(governingMainForm);

  const [steps, setSteps] = useState(() =>
    normalizeRouteItems(template ? template.workflow : workflow)
  );
  const [localAudience, setLocalAudience] = useState(() =>
    template
      ? (template.audience || (template.accessType === 'ALL' ? 'ALL' : 'DEPARTMENT'))
      : (audience || 'DEPARTMENT')
  );
  const [localExpiryDays, setLocalExpiryDays] = useState(() =>
    Number(template ? (template.defaultExpiryDays || 14) : (defaultExpiryDays || 14)) || 14
  );
  const [openNotes, setOpenNotes] = useState(() => {
    const initial = new Set();
    normalizeRouteItems(template ? template.workflow : workflow).forEach(s => {
      if (s.instruction) initial.add(s.department.toLowerCase());
    });
    return initial;
  });
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [autoSyncSignatures, setAutoSyncSignatures] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Active Department Admins per department
  const deptApproversMap = useMemo(() => {
    const map = new Map();
    (departments || []).forEach(d => {
      if (d?.name) map.set(d.name.trim().toLowerCase(), []);
    });
    (users || []).forEach(u => {
      if (!u || u.status === 'SUSPENDED' || (u.status && u.status !== 'ACTIVE')) return;
      const isDeptAdmin = u.systemRole === 'admin' || u.role === 'Department Admin';
      if (isDeptAdmin && u.department) {
        const k = u.department.trim().toLowerCase();
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(u);
      }
    });
    return map;
  }, [users, departments]);

  // Signature slot check when opened inside Word Form Studio
  const sheetSlotSet = useMemo(() => {
    if (!Array.isArray(sheetSigSlots)) return null;
    return new Set(sheetSigSlots.map(s => String(s || '').trim().toLowerCase()).filter(Boolean));
  }, [sheetSigSlots]);

  const missingSigSlotsCount = useMemo(() => {
    if (!sheetSlotSet || steps.length === 0) return 0;
    const hasOrigin = ['submitter', 'applicant', 'originator'].some(k => sheetSlotSet.has(k));
    let missing = hasOrigin ? 0 : 1;
    steps.forEach(s => {
      if (!sheetSlotSet.has(s.department.toLowerCase())) missing += 1;
    });
    return missing;
  }, [sheetSlotSet, steps]);

  const usedDeptSet = useMemo(
    () => new Set(steps.map(s => s.department.toLowerCase())),
    [steps]
  );

  const remainingDepartments = useMemo(
    () => (departments || []).filter(d => d?.name && !usedDeptSet.has(d.name.trim().toLowerCase())),
    [departments, usedDeptSet]
  );

  const deadlineSelectOptions = useMemo(() => {
    const num = Number(localExpiryDays) || 14;
    return DEADLINE_OPTIONS.includes(num)
      ? DEADLINE_OPTIONS
      : [...DEADLINE_OPTIONS, num].sort((a, b) => a - b);
  }, [localExpiryDays]);

  if (!isOpen) return null;

  const handleAddStep = (deptName) => {
    if (isLockedByMainForm || !deptName) return;
    const clean = String(deptName).trim();
    if (!clean) return;
    setSteps(prev => {
      if (prev.some(s => s.department.toLowerCase() === clean.toLowerCase())) return prev;
      return [...prev, { department: clean }];
    });
  };

  const handleChangeStepDept = (idx, nextDept) => {
    if (isLockedByMainForm || !nextDept) return;
    setSteps(prev => {
      if (prev.some((s, i) => i !== idx && s.department.toLowerCase() === nextDept.toLowerCase())) {
        return prev;
      }
      const next = [...prev];
      const old = next[idx];
      if (!old) return prev;
      next[idx] = old.instruction ? { department: nextDept, instruction: old.instruction } : { department: nextDept };
      return next;
    });
  };

  const handleMoveStep = (idx, delta) => {
    if (isLockedByMainForm) return;
    setSteps(prev => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleReorderStep = (fromIdx, toIdx) => {
    if (isLockedByMainForm || fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    setSteps(prev => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleRemoveStep = (idx) => {
    if (isLockedByMainForm) return;
    setSteps(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleNoteEditor = (deptName) => {
    const key = deptName.toLowerCase();
    setOpenNotes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleUpdateInstruction = (idx, value) => {
    if (isLockedByMainForm) return;
    setSteps(prev => {
      const next = [...prev];
      if (!next[idx]) return prev;
      const clean = String(value || '').slice(0, 240);
      next[idx] = clean.trim()
        ? { department: next[idx].department, instruction: clean }
        : { department: next[idx].department };
      return next;
    });
  };

  const handleConfirm = async () => {
    setErrorMsg('');
    const normalizedSteps = normalizeRouteItems(steps).map((item, i) => ({
      step: i + 1,
      department: item.department,
      ...(item.instruction ? { instruction: item.instruction.trim() } : {})
    }));
    const clampedDays = Math.min(Math.max(parseInt(localExpiryDays, 10) || 14, 1), 365);

    if (isDirectSaveMode) {
      setSaving(true);
      try {
        const res = await updateTemplateWorkflow(template.id, {
          workflow: normalizedSteps,
          audience: localAudience,
          defaultExpiryDays: clampedDays
        });
        if (res) onClose?.();
      } catch (err) {
        setErrorMsg(err.message || 'Could not save approval route');
      } finally {
        setSaving(false);
      }
      return;
    }

    onApply?.({
      workflow: normalizedSteps,
      audience: localAudience,
      defaultExpiryDays: clampedDays,
      autoSyncSignatures: Boolean(sheetSlotSet && autoSyncSignatures)
    });
    onClose?.();
  };

  const footerNode = (
    <div className="sd-ar-footer-wrap">
      <div className="sd-ar-footer-left">
        {sheetSlotSet && missingSigSlotsCount > 0 && !isLockedByMainForm && (
          <label className="sd-ar-sync-toggle">
            <input
              type="checkbox"
              checked={autoSyncSignatures}
              onChange={e => setAutoSyncSignatures(e.target.checked)}
            />
            <span>Add signature boxes to page</span>
          </label>
        )}
      </div>

      <div className="sd-ar-footer-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        {!isLockedByMainForm && (
          <button
            type="button"
            id="btn-apply-approval-route"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving
              ? 'Saving…'
              : isDirectSaveMode
                ? 'Save Route'
                : 'Done'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      id="approval-route-modal"
      size="md"
      title="Approval Route"
      subtitle={effectiveTitle}
      onClose={onClose}
      footer={footerNode}
    >
      <div className="sd-ar-clean">
        {errorMsg && (
          <div className="sd-alert sd-alert-danger" style={{ marginBottom: '10px' }}>
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {isLockedByMainForm && (
          <div className="sd-ar-locked-banner">
            <Lock size={15} />
            <div>
              <strong>Synced with {governingMainForm.title}</strong>
              <span>This subform automatically uses its Main Form’s approval route.</span>
            </div>
          </div>
        )}

        {/* Connected Step List */}
        <div className="sd-ar-clean-flow">
          <div className="sd-ar-endpoint">
            <span className="sd-ar-endpoint-dot is-start" />
            <span>Applicant submits &amp; signs form</span>
            {steps.length > 0 && !isLockedByMainForm && (
              <button
                type="button"
                className="sd-ar-clear-link"
                onClick={() => setSteps([])}
              >
                Clear all
              </button>
            )}
          </div>

          {steps.length === 0 ? (
            <div className="sd-ar-empty-box">
              No approval steps yet — form stays as a <strong>Draft</strong> until you add at least 1 step.
            </div>
          ) : (
            <div className="sd-ar-steps-stack">
              {steps.map((stepItem, idx) => {
                const approvers = deptApproversMap.get(stepItem.department.toLowerCase()) || [];
                const isZero = approvers.length === 0;
                const noteKey = stepItem.department.toLowerCase();
                const showNote = openNotes.has(noteKey) || Boolean(stepItem.instruction);
                const isDragging = dragIdx === idx;
                const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;

                return (
                  <div
                    key={stepItem.department}
                    className={`sd-ar-step-row ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'is-drag-over' : ''}`}
                    draggable={!isLockedByMainForm && steps.length > 1}
                    onDragStart={(e) => {
                      if (isLockedByMainForm) return;
                      setDragIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
                    }}
                    onDragOver={(e) => {
                      if (isLockedByMainForm) return;
                      e.preventDefault();
                      if (dragOverIdx !== idx) setDragOverIdx(idx);
                    }}
                    onDragLeave={() => {
                      if (dragOverIdx === idx) setDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      if (isLockedByMainForm) return;
                      e.preventDefault();
                      const from = dragIdx !== null ? dragIdx : parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (!Number.isNaN(from)) handleReorderStep(from, idx);
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setDragOverIdx(null);
                    }}
                  >
                    <div className="sd-ar-step-main">
                      {!isLockedByMainForm && steps.length > 1 && (
                        <span className="sd-wf-grip" title="Drag to reorder">
                          <GripVertical size={14} />
                        </span>
                      )}

                      <span className={`sd-ar-step-num ${isZero ? 'is-warn' : ''}`}>
                        {idx + 1}
                      </span>

                      <select
                        className="sd-ar-dept-select"
                        value={stepItem.department}
                        disabled={isLockedByMainForm}
                        onChange={e => handleChangeStepDept(idx, e.target.value)}
                        aria-label={`Step ${idx + 1} department`}
                      >
                        {(departments || []).map(d => {
                          const takenElsewhere = steps.some(
                            (s, sIdx) => sIdx !== idx && s.department.toLowerCase() === d.name.toLowerCase()
                          );
                          return (
                            <option key={d.id} value={d.name} disabled={takenElsewhere}>
                              {d.name}
                            </option>
                          );
                        })}
                      </select>

                      <span
                        className={`sd-ar-step-hint ${isZero ? 'is-warn' : ''}`}
                        title={
                          isZero
                            ? `No Department Admin assigned in ${stepItem.department} (Super Admin can still approve)`
                            : `Approvers: ${approvers.map(u => u.name || u.username).join(', ')}`
                        }
                      >
                        {isZero
                          ? 'No admin'
                          : `${approvers.length} approver${approvers.length === 1 ? '' : 's'}`}
                      </span>

                      {!isLockedByMainForm && (
                        <div className="sd-ar-step-btns">
                          <button
                            type="button"
                            className={`sd-icon-btn ${showNote ? 'is-active' : ''}`}
                            onClick={() => toggleNoteEditor(stepItem.department)}
                            title={showNote ? 'Hide reviewer note' : 'Add optional reviewer note'}
                          >
                            <MessageSquare size={13} />
                          </button>
                          {steps.length > 1 && (
                            <>
                              <button
                                type="button"
                                className="sd-icon-btn"
                                disabled={idx === 0}
                                onClick={() => handleMoveStep(idx, -1)}
                                title="Move up"
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                type="button"
                                className="sd-icon-btn"
                                disabled={idx === steps.length - 1}
                                onClick={() => handleMoveStep(idx, 1)}
                                title="Move down"
                              >
                                <ArrowDown size={13} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="sd-icon-btn sd-danger-hover"
                            onClick={() => handleRemoveStep(idx)}
                            title="Remove step"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {showNote && (
                      <div className="sd-ar-note-box">
                        <input
                          type="text"
                          className="sd-ar-note-input"
                          placeholder={`Optional note for ${stepItem.department} approver…`}
                          maxLength={240}
                          value={stepItem.instruction || ''}
                          disabled={isLockedByMainForm}
                          onChange={e => handleUpdateInstruction(idx, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Simple + Add Step Bar */}
          {!isLockedByMainForm && remainingDepartments.length > 0 && (
            <div className="sd-ar-add-row">
              {remainingDepartments.length <= 6 ? (
                <div className="sd-ar-add-pills">
                  {remainingDepartments.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      className="sd-ar-add-pill"
                      onClick={() => handleAddStep(d.name)}
                    >
                      <Plus size={12} /> {d.name}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  className="sd-input sd-input-sm sd-ar-add-select"
                  value=""
                  onChange={e => {
                    if (e.target.value) {
                      handleAddStep(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">+ Add approval step…</option>
                  {remainingDepartments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {steps.length > 0 && (
            <div className="sd-ar-endpoint is-final">
              <CheckCircle2 size={14} className="sd-ar-final-icon" />
              <span>Approved &amp; finalized</span>
            </div>
          )}
        </div>

        {/* Clean 2-Item Settings Footer */}
        <div className="sd-ar-clean-settings">
          <div className="sd-ar-setting-item">
            <span className="sd-ar-setting-label">Who can fill</span>
            <div className="sd-wf-segmented" role="group" aria-label="Who can fill form">
              <button
                type="button"
                className={`sd-wf-seg-btn ${localAudience === 'DEPARTMENT' ? 'active' : ''}`}
                disabled={isLockedByMainForm}
                onClick={() => setLocalAudience('DEPARTMENT')}
              >
                {effectiveOwningDept ? `${effectiveOwningDept} Only` : 'Dept Only'}
              </button>
              <button
                type="button"
                className={`sd-wf-seg-btn ${localAudience === 'ALL' ? 'active' : ''}`}
                disabled={isLockedByMainForm}
                onClick={() => setLocalAudience('ALL')}
              >
                Everyone
              </button>
            </div>
          </div>

          <div className="sd-ar-setting-item">
            <span className="sd-ar-setting-label">Deadline</span>
            <select
              className="sd-input sd-input-sm sd-ar-deadline-select"
              value={Number(localExpiryDays) || 14}
              disabled={isLockedByMainForm}
              onChange={e => setLocalExpiryDays(Number(e.target.value) || 14)}
              aria-label="Approval deadline"
            >
              {deadlineSelectOptions.map(days => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ApprovalRouteModal;
