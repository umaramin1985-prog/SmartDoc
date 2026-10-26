import React, { useMemo, useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { printWordDocument } from '../utils/wordPrintEngine';
import { formatDate } from './ui';
import {
  ArrowLeft,
  PenLine,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Send,
  X,
  FileText,
  FileDown,
  Printer,
  User,
  GitCommit,
  Check,
  ShieldCheck,
  Edit3,
  Type,
  Hash,
  ChevronDown,
  Trash2,
  Tag,
  FileEdit,
  CheckSquare,
  Info,
  Loader2
} from 'lucide-react';
import { fieldColumnSpan } from './formLayout';

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + (parseInt(days, 10) || 14));
  return d.toISOString().slice(0, 10);
};
const tomorrow = () => addDays(1);

function bumpPreview(v) {
  const [maj, min] = String(v || '1.0').split('.');
  return `${maj || '1'}.${(parseInt(min || '0', 10) || 0) + 1}`;
}

export const FillFormModal = ({ template, submission, onClose, onDone, initialPrint = false }) => {
  const { currentUser, submitForm, resubmitForm, openSignatureModal, addToast } = useApp();
  const isResubmit = !!submission;
  const fields = useMemo(() => template?.fields || [], [template]);
  const hasWorkflow = Array.isArray(template?.workflow) && template.workflow.length > 0;

  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map(f => [f.key, submission?.formData?.[f.key] ?? '']))
  );

  const [expiryDate, setExpiryDate] = useState(() => {
    const existing = submission?.expiryDate;
    return existing && existing >= tomorrow() ? existing : addDays(template?.defaultExpiryDays);
  });

  const [changeSummary, setChangeSummary] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPrintingBlank, setIsPrintingBlank] = useState(false);
  const [printingWord, setPrintingWord] = useState(false);

  // Single-Field Placeholder Filling Dialogue state
  const [activeDialogField, setActiveDialogField] = useState(null);
  const [dialogFieldValue, setDialogFieldValue] = useState('');
  const [showMissingPromptModal, setShowMissingPromptModal] = useState(false);
  const [activeRailField, setActiveRailField] = useState(() => fields[0]?.key || null);
  const [connectorCoords, setConnectorCoords] = useState(null);
  const [showVisualLine, setShowVisualLine] = useState(() => {
    try {
      const saved = localStorage.getItem('smartdoc_form_show_visual_line');
      return saved !== null ? saved === 'true' : true;
    } catch (e) {
      return true;
    }
  });

  // Check template-level bold configuration for a field
  const isFieldBold = useCallback((f) => {
    if (!f) return false;
    return !!(f.bold || f.isBold);
  }, []);

  const workspaceRef = useRef(null);
  const deskRef = useRef(null);
  const railBodyRef = useRef(null);

  useEffect(() => {
    if (!activeRailField && fields.length > 0) {
      setActiveRailField(fields[0].key);
    }
  }, [fields, activeRailField]);

  const completedCount = useMemo(() => {
    return fields.filter(f => String(values[f.key] ?? '').trim().length > 0).length;
  }, [fields, values]);

  const missingMandatoryCount = useMemo(() => {
    return fields.filter(f => f.required && !String(values[f.key] ?? '').trim()).length;
  }, [fields, values]);

  const updateConnectorLine = useCallback(() => {
    if (!showVisualLine || !activeRailField || !workspaceRef.current) {
      setConnectorCoords(null);
      return;
    }
    const elemId = `live-placeholder-${activeRailField.replace(/\W+/g, '-').toLowerCase()}`;
    const docElem = document.getElementById(elemId);
    const railCard = document.getElementById(`rail-card-${activeRailField}`);
    const railInput = document.getElementById(`rail-input-${activeRailField}`);

    if (!docElem || !railCard || !workspaceRef.current) {
      setConnectorCoords(null);
      return;
    }

    const wsRect = workspaceRef.current.getBoundingClientRect();
    const docRect = docElem.getBoundingClientRect();
    const targetRightElem = railInput || railCard;
    const railRect = targetRightElem.getBoundingClientRect();

    // Verify docElem is within visible desk area
    const deskRect = deskRef.current?.getBoundingClientRect();
    if (deskRect) {
      if (docRect.bottom < deskRect.top || docRect.top > deskRect.bottom) {
        setConnectorCoords(null);
        return;
      }
    }

    // Anchor to top-center of document placeholder to avoid slicing through adjacent words on the line
    const x1 = Math.round(docRect.left + docRect.width / 2 - wsRect.left);
    const y1 = Math.round(docRect.top - wsRect.top - 2);

    const x2 = Math.round(railRect.left - wsRect.left);
    const y2 = Math.round(railRect.top + railRect.height / 2 - wsRect.top);

    setConnectorCoords({ x1, y1, x2, y2 });
  }, [showVisualLine, activeRailField]);

  useEffect(() => {
    if (!showVisualLine) {
      setConnectorCoords(null);
      return;
    }
    updateConnectorLine();
    const desk = deskRef.current;
    const railBody = railBodyRef.current;

    const onScrollOrResize = () => {
      window.requestAnimationFrame(updateConnectorLine);
    };

    window.addEventListener('resize', onScrollOrResize);
    desk?.addEventListener('scroll', onScrollOrResize, { passive: true });
    railBody?.addEventListener('scroll', onScrollOrResize, { passive: true });

    const timer = setTimeout(updateConnectorLine, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onScrollOrResize);
      desk?.removeEventListener('scroll', onScrollOrResize);
      railBody?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [showVisualLine, updateConnectorLine, values]);

  const pathD = useMemo(() => {
    if (!connectorCoords) return '';
    const { x1, y1, x2, y2 } = connectorCoords;
    const dx = Math.max(60, (x2 - x1) * 0.45);
    // Smooth bezier: leaves the right rail horizontally, arches above text, descends straight onto target pointer
    return `M ${x1} ${y1 - 7} C ${x1} ${y1 - 52}, ${x2 - dx} ${y2 - 10}, ${x2} ${y2}`;
  }, [connectorCoords]);

  const handleFocusField = (key) => {
    setActiveRailField(key);
    const railInput = document.getElementById(`rail-input-${key}`);
    if (railInput) {
      railInput.focus();
      const card = document.getElementById(`rail-card-${key}`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleRailInputFocus = (key) => {
    setActiveRailField(key);
    const elemId = `live-placeholder-${key.replace(/\W+/g, '-').toLowerCase()}`;
    const docElem = document.getElementById(elemId);
    if (docElem) {
      docElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleOpenFieldDialog = (f) => {
    setActiveDialogField(f);
    setDialogFieldValue(values[f.key] ?? '');
  };

  const handleApplyDialogValue = (e) => {
    e?.preventDefault();
    if (!activeDialogField) return;
    setValues(prev => ({ ...prev, [activeDialogField.key]: dialogFieldValue }));
    setActiveDialogField(null);
  };

  const handleClearDialogField = () => {
    if (!activeDialogField) return;
    setValues(prev => ({ ...prev, [activeDialogField.key]: '' }));
    setActiveDialogField(null);
  };

  // Print handlers: authentic Word document printing (filled or pristine blank)
  const handlePrint = async (blank = false) => {
    if (printingWord) return;
    try {
      setPrintingWord(true);
      addToast(
        blank ? 'Preparing Blank Word Document' : 'Preparing Filled Word Document',
        'Formatting document with Microsoft Word typography and margins for print...',
        'info'
      );

      let docBlob = null;
      if (template?.id) {
        docBlob = await apiService.renderPrintDocument(template.id, {
          values: blank ? {} : values,
          blank: !!blank
        });
      } else if (submission?.id) {
        docBlob = await apiService.getSubmissionDocument(submission.id);
      }

      if (!docBlob) throw new Error('Could not retrieve Word document file');

      await printWordDocument(docBlob, {
        title: `${template?.title || submission?.title || 'SmartDoc'}_${blank ? 'Blank' : 'Filled'}`
      });
    } catch (err) {
      console.error('Word Print Error:', err);
      addToast('Print Error', err.message || 'Failed to print Word document', 'error');
    } finally {
      setPrintingWord(false);
    }
  };

  // Keyboard shortcut Ctrl+P / Cmd+P to print the Word document
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [values, template, submission, printingWord]);

  // Auto trigger print when opened with initialPrint={true}
  useEffect(() => {
    if (initialPrint) {
      const timer = setTimeout(() => {
        handlePrint(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [initialPrint]);

  const docBodyRef = useRef(null);
  const [mountedSlots, setMountedSlots] = useState([]);

  const missing = useMemo(
    () => fields.filter(f => f.required && !String(values[f.key] ?? '').trim()).map(f => f.key),
    [fields, values]
  );
  const hasSignature = !!currentUser?.hasSignature;

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, saving]);

  // Map fields for fast key lookups
  const fieldsMap = useMemo(() => {
    const map = new Map();
    fields.forEach(f => {
      if (!f) return;
      if (f.key) map.set(String(f.key).toLowerCase(), f);
      if (f.label) map.set(String(f.label).toLowerCase(), f);
    });
    return map;
  }, [fields]);

  // Process template HTML content into DOM slots for React portals
  const { processedHtml, placedKeys, hasDocxHtml } = useMemo(() => {
    const rawHtml = template?.htmlContent?.trim();
    if (!rawHtml) {
      return { processedHtml: '', placedKeys: new Set(), hasDocxHtml: false };
    }

    let html = rawHtml;
    const placed = new Set();

    // 1. Signature slots: {{Signature: Slot}} or .sd-doc-sig-block
    html = html.replace(/\{\{\s*Signature\s*:\s*([^}]+)\}\}/gi, (match, slot) => {
      const s = slot.trim();
      return `<div class="sd-live-slot-sig" data-sig-slot="${s}"></div>`;
    });

    html = html.replace(/<div[^>]*class="[^"]*sd-doc-sig-block[^"]*"[^>]*data-sig-slot="([^"]+)"[^>]*>.*?<\/div>/gi, (match, slot) => {
      return `<div class="sd-live-slot-sig" data-sig-slot="${slot.trim()}"></div>`;
    });

    // 2. System tags: {{Form ID}}, {{Submitted By}}, {{Submitted Date}}, {{Department}}, {{Version}}
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const formIdText = submission?.uniqueNumber || `[Auto-Generated on Submit]`;
    const submitterName = submission?.submittedByName || currentUser?.name || 'Submitter';
    const deptName = template?.department || submission?.department || 'Department';
    const verText = isResubmit ? bumpPreview(submission?.version) : (template?.version || '1.0');

    html = html.replace(/\{\{\s*Form\s*ID\s*\}\}/gi, `<span class="sd-pv-sys">${formIdText}</span>`);
    html = html.replace(/\{\{\s*Submitted\s*By\s*\}\}/gi, `<span class="sd-pv-sys">${submitterName}</span>`);
    html = html.replace(/\{\{\s*Submitted\s*Date\s*\}\}/gi, `<span class="sd-pv-sys">${today}</span>`);
    html = html.replace(/\{\{\s*Department\s*\}\}/gi, `<span class="sd-pv-sys">${deptName}</span>`);
    html = html.replace(/\{\{\s*Version\s*\}\}/gi, `<span class="sd-pv-sys">v${verText}</span>`);

    html = html.replace(/<span[^>]*class="[^"]*sd-doc-system-tag[^"]*"[^>]*data-sys-tag="([^"]+)"[^>]*>.*?<\/span>/gi, (match, tag) => {
      const t = tag.trim().toLowerCase();
      if (t === 'form id') return `<span class="sd-pv-sys">${formIdText}</span>`;
      if (t === 'submitted by') return `<span class="sd-pv-sys">${submitterName}</span>`;
      if (t === 'submitted date') return `<span class="sd-pv-sys">${today}</span>`;
      if (t === 'department') return `<span class="sd-pv-sys">${deptName}</span>`;
      if (t === 'version') return `<span class="sd-pv-sys">v${verText}</span>`;
      return `<span class="sd-pv-sys">[${tag}]</span>`;
    });

    // Strip any wrapping <strong>/<b> around field placeholders so template bold attribute has exclusive control
    html = html.replace(/<(strong|b)[^>]*>\s*(\{\{\s*[^}]+\}\})\s*<\/\1>/gi, '$2');

    // 3. Field placeholders: {{field_key}}
    html = html.replace(/\{\{\s*([^}]+)\}\}/g, (match, fieldName) => {
      const fn = fieldName.trim();
      const f = fieldsMap.get(fn.toLowerCase());
      if (f) {
        placed.add(f.key);
        const isBold = isFieldBold(f);
        const isDirect = f.mode === 'input' && (f.width || f.type === 'textarea');
        const widthStyle = (isDirect && f.width) ? `width: calc(${f.width}% - 8px);` : '';
        const slotClass = `${isDirect ? 'sd-live-slot-field sd-live-slot-direct' : 'sd-live-slot-field sd-live-slot-inline'} ${isBold ? 'is-bold' : ''}`;
        return `<span class="${slotClass}" data-field-key="${f.key}" style="${widthStyle}"></span>`;
      }
      return match;
    });

    // Support any field pills already in the stored HTML
    html = html.replace(/<span[^>]*class="[^"]*sd-doc-field-pill[^"]*"[^>]*data-field-key="([^"]+)"[^>]*>.*?<\/span>/gi, (match, key) => {
      placed.add(key);
      const f = fieldsMap.get(key.toLowerCase());
      const isBold = isFieldBold(f);
      const isDirect = f && f.mode === 'input' && (f.width || f.type === 'textarea');
      const widthStyle = (isDirect && f?.width) ? `width: calc(${f.width}% - 8px);` : '';
      const slotClass = `${isDirect ? 'sd-live-slot-field sd-live-slot-direct' : 'sd-live-slot-field sd-live-slot-inline'} ${isBold ? 'is-bold' : ''}`;
      return `<span class="${slotClass}" data-field-key="${key}" style="${widthStyle}"></span>`;
    });

    return { processedHtml: html, placedKeys: placed, hasDocxHtml: true };
  }, [template, submission, currentUser, fieldsMap, isResubmit]);

  // After HTML renders, discover slot DOM elements for React portals
  useLayoutEffect(() => {
    if (!docBodyRef.current) return;
    const container = docBodyRef.current;
    const slots = [];

    // Fields
    const fieldNodes = container.querySelectorAll('.sd-live-slot-field');
    fieldNodes.forEach((node, idx) => {
      const key = node.getAttribute('data-field-key');
      const f = fieldsMap.get(key?.toLowerCase());
      if (f) {
        slots.push({ id: `field-portal-${f.key}-${idx}`, type: 'field', field: f, key: f.key, node });
      }
    });

    // Signatures
    const sigNodes = container.querySelectorAll('.sd-live-slot-sig');
    sigNodes.forEach((node, idx) => {
      const slot = (node.getAttribute('data-sig-slot') || 'Submitter').trim();
      slots.push({ id: `sig-portal-${slot}-${idx}`, type: 'sig', slot, node });
    });

    setMountedSlots(slots);
  }, [processedHtml, fieldsMap]);

  // Fields that were not placed in the document HTML
  const unplacedFields = useMemo(() => {
    if (!hasDocxHtml) return fields;
    return fields.filter(f => !placedKeys.has(f.key));
  }, [fields, placedKeys, hasDocxHtml]);

  // Check if Submitter signature block is in the document
  const hasSubmitterSigSlot = useMemo(() => {
    return mountedSlots.some(s => s.type === 'sig' && ['submitter', 'applicant', 'originator'].includes(String(s.slot || '').toLowerCase()));
  }, [mountedSlots]);

  // Submission handler
  const handleSubmit = async (e) => {
    e?.preventDefault();
    setTouched(true);

    if (!hasWorkflow) {
      addToast('Cannot Submit', 'This form cannot be submitted because no approval workflow or approvers have been configured.', 'warn');
      return;
    }

    if (missing.length > 0) {
      setShowMissingPromptModal(true);
      const missingLabels = missing.map(k => fieldsMap.get(k.toLowerCase())?.label || k);
      addToast(
        'Missing Required Fields',
        `Please complete all mandatory fields highlighted in red (${missingLabels.slice(0, 3).join(', ')}${missingLabels.length > 3 ? '...' : ''}).`,
        'warn'
      );
      // Scroll to the first missing field
      const firstKey = missing[0];
      const targetEl = document.getElementById(`live-placeholder-${firstKey.replace(/\W+/g, '-').toLowerCase()}`) ||
                       document.getElementById(`live-field-${firstKey.replace(/\W+/g, '-').toLowerCase()}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (!hasSignature) {
      addToast('Signature Required', 'Please draw and save your digital signature before submitting.', 'warn');
      openSignatureModal();
      return;
    }

    if (!expiryDate || expiryDate < tomorrow()) {
      addToast('Invalid Deadline', 'Please choose a decision deadline date in the future.', 'warn');
      return;
    }

    setSaving(true);
    try {
      const result = isResubmit
        ? await resubmitForm(submission.id, { formData: values, changeSummary, expiryDate })
        : await submitForm({ templateId: template.id, formData: values, expiryDate });

      if (result) {
        addToast(
          isResubmit ? 'Form Resubmitted' : 'Form Submitted Successfully',
          `"${template.title}" has been routed to the approval chain.`,
          'success'
        );
        onClose();
        onDone?.(result);
      }
    } catch (err) {
      addToast('Submission Failed', err.message || 'An error occurred while submitting.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Render an interactive input control
  const renderInputControl = (f, key) => {
    const isInvalid = touched && missing.includes(f.key);
    const elemId = `live-field-${f.key.replace(/\W+/g, '-').toLowerCase()}`;
    const rawVal = values[f.key];
    const val = isPrintingBlank ? '' : (rawVal ?? '');
    const hasVal = String(val).trim().length > 0;
    const isBold = isFieldBold(f);

    const commonProps = {
      id: elemId,
      className: `sd-doc-live-input ${isInvalid ? 'is-invalid' : ''} ${isBold ? 'is-bold' : ''}`,
      style: isBold ? { fontWeight: '700' } : undefined,
      value: isPrintingBlank ? '' : (values[f.key] ?? ''),
      onChange: (e) => setValues(prev => ({ ...prev, [f.key]: e.target.value })),
      placeholder: f.placeholder || (f.label ? `Enter ${f.label}…` : '')
    };

    if (f.type === 'textarea') {
      return (
        <>
          <textarea rows={3} {...commonProps} className={`sd-doc-live-input sd-doc-live-textarea ${isInvalid ? 'is-invalid' : ''} ${isBold ? 'is-bold' : ''}`} />
          <div className="sd-print-value sd-print-value-textarea">
            {hasVal ? (
              <div className="sd-print-text-block">{val}</div>
            ) : (
              <div className="sd-print-blank-lines">
                <span className="sd-print-blank-line" />
                <span className="sd-print-blank-line" />
                <span className="sd-print-blank-line" />
              </div>
            )}
          </div>
        </>
      );
    }
    if (f.type === 'date') {
      return (
        <>
          <input type="date" {...commonProps} />
          <div className="sd-print-value sd-print-value-input">
            {hasVal ? (
              <span className="sd-print-text">{formatDate(val) || val}</span>
            ) : (
              <span className="sd-print-blank-line" />
            )}
          </div>
        </>
      );
    }
    if (f.type === 'number') {
      return (
        <>
          <input type="number" step="any" {...commonProps} />
          <div className="sd-print-value sd-print-value-input">
            {hasVal ? (
              <span className="sd-print-text">{val}</span>
            ) : (
              <span className="sd-print-blank-line" />
            )}
          </div>
        </>
      );
    }
    if (f.type === 'select' || f.type === 'dropdown') {
      const opts = Array.isArray(f.options)
        ? f.options
        : (typeof f.options === 'string' ? f.options.split(',').map(s => s.trim()).filter(Boolean) : []);
      return (
        <>
          <select {...commonProps}>
            <option value="">-- Select {f.label || 'option'} --</option>
            {opts.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
          <div className="sd-print-value sd-print-value-select">
            {hasVal ? (
              <span className="sd-print-text">{val}</span>
            ) : (
              <div className="sd-print-blank-select">
                <span className="sd-print-blank-line" />
                {opts.length > 0 && (
                  <span className="sd-print-options-hint">[{opts.join(' / ')}]</span>
                )}
              </div>
            )}
          </div>
        </>
      );
    }
    if (f.type === 'checkbox') {
      const isChecked = !isPrintingBlank && (values[f.key] === 'Yes' || values[f.key] === true || values[f.key] === 'true');
      return (
        <>
          <label className="sd-doc-live-checkbox">
            <input
              id={elemId}
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setValues(prev => ({ ...prev, [f.key]: e.target.checked ? 'Yes' : 'No' }))}
            />
            <span>{f.placeholder || f.label || 'I Confirm & Agree'}</span>
          </label>
          <div className="sd-print-value sd-print-value-checkbox">
            <span className="sd-print-check-box">{isChecked ? '☑' : '☐'}</span>
            <span className="sd-print-check-label">{f.placeholder || f.label || 'I Confirm & Agree'}</span>
          </div>
        </>
      );
    }
    return (
      <>
        <input type="text" {...commonProps} />
        <div className="sd-print-value sd-print-value-input">
          {hasVal ? (
            <span className="sd-print-text">{val}</span>
          ) : (
            <span className="sd-print-blank-line" />
          )}
        </div>
      </>
    );
  };

  // Render interactive in-text placeholder field
  const renderPlaceholderInput = (f, key) => {
    const rawVal = values[f.key];
    const val = isPrintingBlank ? '' : (rawVal ?? '');
    const hasVal = String(val).trim().length > 0;
    const isInvalid = touched && f.required && !hasVal;
    const elemId = `live-placeholder-${f.key.replace(/\W+/g, '-').toLowerCase()}`;
    const isBold = isFieldBold(f);

    // Clean print view for blank paper template
    if (isPrintingBlank) {
      return (
        <span className="sd-print-placeholder-blank" title={f.label}>
          <span className="sd-print-placeholder-line" style={{ display: 'inline-block', minWidth: '130px', borderBottom: '1px solid #000' }}></span>
          <span className="sd-print-placeholder-sub" style={{ fontSize: '7.5pt', color: '#555', display: 'block' }}>({f.label || f.key}{f.required ? ' *' : ''})</span>
        </span>
      );
    }

    return (
      <span className={`sd-doc-live-placeholder-wrapper ${isBold ? 'is-bold' : ''}`}>
        <span
          role="button"
          tabIndex={0}
          id={elemId}
          className={`sd-doc-live-placeholder ${hasVal ? 'is-filled' : 'is-empty'} ${isInvalid ? 'is-invalid' : ''} ${f.required ? 'is-required' : ''} ${activeRailField === f.key ? 'is-active-target' : ''} ${isBold ? 'is-bold' : ''}`}
          style={isBold ? { fontWeight: '700' } : undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleFocusField(f.key);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleFocusField(f.key);
            }
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOpenFieldDialog(f);
          }}
          title={
            f.description
              ? `${f.label || f.key}: ${f.description}${f.required ? ' (Required)' : ''}`
              : hasVal
              ? `Click to edit ${f.label || f.key}: "${val}"`
              : `Click to fill {{${f.label || f.key}}}${f.required ? ' (Required)' : ''}`
          }
        >
          {hasVal ? (
            <span className={`sd-ph-filled-value ${isBold ? 'is-bold' : ''}`} style={isBold ? { fontWeight: '700' } : undefined}>{val}</span>
          ) : (
            <span className={`sd-ph-tag-token ${isBold ? 'is-bold' : ''}`}>
              <span className="sd-ph-brace">{'{{'}</span>
              <span className={`sd-ph-tag-title ${isBold ? 'is-bold' : ''}`} style={isBold ? { fontWeight: '700' } : undefined}>{f.label || f.key}</span>
              {f.required && <span className="sd-ph-star" title="Mandatory field">*</span>}
              {f.description && (
                <span className="sd-ph-info-pill" title={f.description}>
                  <Info size={10} />
                </span>
              )}
              <span className="sd-ph-brace">{'}}'}</span>
            </span>
          )}
        </span>

        {/* Clean text printed when document is filled */}
        <span className="sd-print-value sd-print-placeholder-filled">
          {hasVal ? val : '____________________'}
        </span>
      </span>
    );
  };

  // Render input controls for the right-side form rail
  const renderRailInputControl = (f, val, isFieldInvalid) => {
    const inputId = `rail-input-${f.key}`;
    const placeholder = f.placeholder || (f.type === 'date' ? 'YYYY-MM-DD' : `Enter ${f.label || f.key}…`);

    switch (f.type) {
      case 'textarea':
        return (
          <textarea
            id={inputId}
            className={`sd-rail-input sd-rail-textarea ${isFieldInvalid ? 'is-invalid' : ''}`}
            rows={3}
            value={val}
            onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
            onFocus={() => handleRailInputFocus(f.key)}
            placeholder={placeholder}
          />
        );

      case 'date':
        return (
          <div className="sd-rail-date-wrap">
            <input
              type="date"
              id={inputId}
              className={`sd-rail-input ${isFieldInvalid ? 'is-invalid' : ''}`}
              value={val}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
              onFocus={() => handleRailInputFocus(f.key)}
            />
            <div className="sd-rail-date-shortcuts">
              <button
                type="button"
                className="sd-rail-shortcut-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const today = new Date().toISOString().slice(0, 10);
                  setValues(prev => ({ ...prev, [f.key]: today }));
                  handleRailInputFocus(f.key);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="sd-rail-shortcut-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  setValues(prev => ({ ...prev, [f.key]: d.toISOString().slice(0, 10) }));
                  handleRailInputFocus(f.key);
                }}
              >
                +1 Wk
              </button>
              <button
                type="button"
                className="sd-rail-shortcut-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const d = new Date();
                  d.setDate(d.getDate() + 30);
                  setValues(prev => ({ ...prev, [f.key]: d.toISOString().slice(0, 10) }));
                  handleRailInputFocus(f.key);
                }}
              >
                +30 D
              </button>
            </div>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            id={inputId}
            className={`sd-rail-input ${isFieldInvalid ? 'is-invalid' : ''}`}
            value={val}
            onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
            onFocus={() => handleRailInputFocus(f.key)}
            placeholder={placeholder || '0'}
          />
        );

      case 'dropdown': {
        const opts = Array.isArray(f.options)
          ? f.options
          : typeof f.options === 'string'
            ? f.options.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        return (
          <select
            id={inputId}
            className={`sd-rail-input sd-rail-select ${isFieldInvalid ? 'is-invalid' : ''}`}
            value={val}
            onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
            onFocus={() => handleRailInputFocus(f.key)}
          >
            <option value="">— Select an option —</option>
            {opts.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );
      }

      case 'checkbox':
        return (
          <label className="sd-rail-checkbox-label" onFocus={() => handleRailInputFocus(f.key)}>
            <input
              type="checkbox"
              id={inputId}
              checked={val === true || val === 'true' || val === 'yes'}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.checked ? 'yes' : '' }))}
            />
            <span>{val === 'yes' || val === true || val === 'true' ? 'Confirmed (Yes)' : 'Not checked (No)'}</span>
          </label>
        );

      case 'text':
      default:
        return (
          <input
            type="text"
            id={inputId}
            className={`sd-rail-input ${isFieldInvalid ? 'is-invalid' : ''}`}
            value={val}
            onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
            onFocus={() => handleRailInputFocus(f.key)}
            placeholder={placeholder}
          />
        );
    }
  };

  // Render on-form field wrapper (branches between in-text placeholder and direct input)
  const renderFieldInput = (f, key) => {
    const isDirectInput = f.mode === 'input' && (f.width || f.type === 'textarea');
    if (!isDirectInput) {
      return renderPlaceholderInput(f, key);
    }

    const isBlock = f.type === 'textarea' || f.width === 100;
    return (
      <span className={`sd-doc-live-field-wrap ${isBlock ? 'is-block' : ''}`}>
        <span className="sd-doc-live-field-label">
          {f.label || f.key}
          {f.required && <span className="sd-required"> *</span>}
        </span>
        {f.description && (
          <span className="sd-doc-live-field-desc">
            <Info size={11} className="sd-desc-icon-inline" /> {f.description}
          </span>
        )}
        {renderInputControl(f, key)}
      </span>
    );
  };

  // Render on-form signature slot
  const renderSignatureSlot = (slot) => {
    const isSubmitter = ['submitter', 'applicant', 'originator'].includes(String(slot || '').toLowerCase());
    const isSigned = hasSignature && !isPrintingBlank;

    if (isSubmitter) {
      return (
        <div className="sd-doc-live-sig-card submitter">
          <div className="sd-doc-live-sig-header">
            <span className="sd-doc-live-sig-title">
              <PenLine size={14} /> Applicant / Submitter Signature *
            </span>
            <span className="sd-badge sd-badge-accent sd-print-hide">Step 0 (Originator)</span>
          </div>

          {isSigned ? (
            <div className="sd-doc-live-sig-signed-box">
              {currentUser.signatureImage ? (
                <img src={currentUser.signatureImage} alt="Your signature" />
              ) : (
                <span className="sd-badge sd-badge-green"><Check size={12} /> Signature Saved</span>
              )}
              <div className="sd-doc-live-sig-meta">
                <span className="sd-doc-live-sig-meta-name">{currentUser.name}</span>
                <span className="sd-doc-live-sig-meta-hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <ShieldCheck size={11} style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>PKI Cryptographically Sealed (RSA-2048)</span>
                </span>
                {currentUser?.pkiFingerprint && (
                  <span style={{ fontSize: '0.64rem', fontFamily: 'monospace', color: '#64748b', marginTop: '2px', display: 'block' }}>
                    Cert Fingerprint: {currentUser.pkiFingerprint.slice(0, 23)}…
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              <button
                id="btn-draw-save-signature"
                type="button"
                className="sd-doc-live-sig-draw-btn sd-print-hide"
                onClick={openSignatureModal}
              >
                <PenLine size={15} /> Draw &amp; Save Signature
              </button>
              <div className="sd-print-blank-sig-block">
                <div className="sd-print-blank-sig-row">
                  <div className="sd-print-blank-sig-col">
                    <span className="sd-print-line" />
                    <span className="sd-print-sub">Applicant / Submitter Signature</span>
                  </div>
                  <div className="sd-print-blank-sig-col sd-print-col-date">
                    <span className="sd-print-line" />
                    <span className="sd-print-sub">Date (MM/DD/YYYY)</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="sd-doc-live-sig-card department">
        <div className="sd-doc-live-sig-header">
          <span className="sd-doc-live-sig-title">
            <ShieldCheck size={14} /> {slot} Approval Signature
          </span>
          <span className="sd-badge sd-badge-gray sd-print-hide">Sequential Approval</span>
        </div>
        <div className="sd-doc-live-sig-pending-box sd-print-hide">
          <Clock size={14} />
          <span>Pending approval and signature by {slot} Department Administrator</span>
        </div>
        <div className="sd-print-dept-sig-block">
          <div className="sd-print-dept-decisions">
            <span>[  ] Approved</span>
            <span>[  ] Rejected</span>
            <span>[  ] Objection</span>
          </div>
          <div className="sd-print-blank-sig-row">
            <div className="sd-print-blank-sig-col">
              <span className="sd-print-line" />
              <span className="sd-print-sub">Authorized {slot} Admin Signature</span>
            </div>
            <div className="sd-print-blank-sig-col sd-print-col-date">
              <span className="sd-print-line" />
              <span className="sd-print-sub">Date</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!template) {
    return null;
  }

  return (
    <div className="sd-form-filler-overlay animate-fade-in" id="fill-form-modal">
      {/* Top Action Ribbon */}
      <header className="sd-form-filler-header">
        <div className="sd-form-filler-header-left">
          <button
            type="button"
            className="sd-icon-btn"
            onClick={onClose}
            title="Cancel and return to drive"
            disabled={saving}
          >
            <ArrowLeft size={18} />
          </button>

          <div className="sd-form-filler-title-block">
            <div className="sd-form-filler-title-row">
              <span className="sd-form-filler-title">{template.title}</span>
              <span className="sd-badge sd-badge-accent">{template.department}</span>
              <span className="sd-badge sd-badge-gray">v{isResubmit ? bumpPreview(submission.version) : (template.version || '1.0')}</span>
            </div>
            <div className="sd-form-filler-meta">
              <span>{template.code || template.fileName || 'Form Document'}</span>
              <span>·</span>
              <span>Fill out fields directly on the form and submit</span>
            </div>
          </div>
        </div>

        <div className="sd-form-filler-header-right">
          <div className="sd-form-filler-deadline" title="Deadline for approvers to review this submission">
            <Calendar size={14} />
            <span>Decision needed by:</span>
            <input
              id="input-expiry-date"
              type="date"
              min={tomorrow()}
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
            />
          </div>

          {/* Print Actions: filled or blank */}
          <div className="sd-print-actions">
            <button
              id="btn-print-form"
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={printingWord}
              onClick={() => handlePrint(false)}
              title="Print authentic Word document with current filled values and digital signature (Ctrl+P)"
            >
              {printingWord ? <Loader2 size={14} className="sd-spin" /> : <Printer size={14} />}
              <span>{printingWord ? 'Formatting…' : 'Print Form'}</span>
            </button>
            <button
              id="btn-print-blank-form"
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={printingWord}
              onClick={() => handlePrint(true)}
              title="Print a clean, blank copy of this form for physical pen-and-paper filling"
            >
              {printingWord ? <Loader2 size={14} className="sd-spin" /> : <FileDown size={14} />}
              <span>Print Blank</span>
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            id="btn-submit-form"
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={saving || !hasWorkflow}
          >
            {saving ? (
              <CheckCircle2 size={14} className="sd-spin" />
            ) : isResubmit ? (
              <GitCommit size={14} />
            ) : (
              <Send size={14} />
            )}
            {saving ? 'Submitting…' : !hasWorkflow ? 'Workflow Required' : isResubmit ? 'Resubmit for Approval' : 'Sign & Submit Form'}
          </button>
        </div>
      </header>

      {/* Workspace Area: Document Canvas on Left/Center, Interactive Form Rail on Right */}
      <div className="sd-form-filler-workspace" ref={workspaceRef}>
        {/* Main Canvas Scroll Area */}
        <main className="sd-form-filler-desk" ref={deskRef}>
        {/* Objection Notification Banner */}
        {isResubmit && submission?.objectionNotes && (
          <div className="sd-form-filler-objection-banner">
            <div className="sd-form-filler-objection-top">
              <AlertTriangle size={18} className="sd-text-warn" />
              <div>
                <strong>Objection Raised by Reviewer:</strong> {submission.objectionNotes}
              </div>
            </div>
            <div className="sd-form-filler-change-row">
              <label htmlFor="input-change-summary" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                What did you change?
              </label>
              <input
                id="input-change-summary"
                value={changeSummary}
                onChange={e => setChangeSummary(e.target.value)}
                placeholder="Brief summary of changes made to address the objection…"
              />
            </div>
          </div>
        )}

        {/* Workflow Required Warning Banner */}
        {!hasWorkflow && (
          <div className="sd-studio-alert" style={{ width: '820px', marginBottom: '18px' }}>
            <AlertTriangle size={18} />
            <div>
              <strong>Approval Workflow Required:</strong> This form cannot be submitted because no approval workflow has been configured. An administrator must define approval steps in Word Form Studio.
            </div>
          </div>
        )}

        {/* Authentic A4 Paper Document Sheet */}
        <div
          className="sd-form-filler-sheet size-a4 portrait margins-normal"
          style={{
            fontFamily: template?.fontFamily || undefined,
            fontSize: template?.fontSize || undefined
          }}
        >
          {/* Header Mark */}
          <div className="sd-word-page-header-mark">
            <span>{template.department} — Enterprise Word Form</span>
            <span>{template.code || 'CONFIDENTIAL'}</span>
          </div>

          {/* Form Body: Either Word Template HTML or Official Clean Fallback */}
          {hasDocxHtml ? (
            <div
              ref={docBodyRef}
              className="sd-word-editor-body sd-pv-doc"
              style={{
                fontFamily: template?.fontFamily || undefined,
                fontSize: template?.fontSize || undefined
              }}
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          ) : (
            <div>
              {/* Fallback Official Document Structure */}
              <div className="sd-form-filler-official-header">
                <div>
                  <div className="sd-form-filler-official-brand">{template.department}</div>
                  <h1 className="sd-form-filler-official-title">{template.title}</h1>
                </div>
                <div className="sd-form-filler-official-meta">
                  <div><strong>Form ID:</strong> {submission?.uniqueNumber || `FRM-${new Date().getFullYear()}-XXXX`}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Submitter:</strong> {currentUser.name}</div>
                </div>
              </div>

              {template.description && (
                <p className="sd-muted" style={{ marginBottom: '24px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {template.description}
                </p>
              )}

              {/* Grid of Fields directly on document */}
              <div className="sd-fields-grid" style={{ marginBottom: '32px' }}>
                {fields.map(f => (
                  <label key={f.key} className="sd-field" style={{ gridColumn: `span ${fieldColumnSpan(f)}` }}>
                    <span className="sd-label">
                      {f.label || f.key}
                      {f.required && <span className="sd-required"> *</span>}
                    </span>
                    {renderInputControl(f, f.key)}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* React Portals directly mounted into document DOM placeholders */}
          {mountedSlots.map(s => {
            if (s.type === 'field') {
              return createPortal(renderFieldInput(s.field, s.key), s.node);
            }
            if (s.type === 'sig') {
              return createPortal(renderSignatureSlot(s.slot), s.node);
            }
            return null;
          })}

          {/* Any fields that weren't inside the document HTML */}
          {hasDocxHtml && unplacedFields.length > 0 && (
            <div className="sd-form-filler-unplaced-section">
              <div className="sd-form-filler-unplaced-title">
                <FileText size={15} /> Additional Required Form Fields
              </div>
              <div className="sd-form-filler-unplaced-grid">
                {unplacedFields.map(f => (
                  <div key={f.key}>
                    {renderFieldInput(f, f.key)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* If the Word document didn't have an explicit submitter signature slot, append it at document bottom */}
          {(!hasSubmitterSigSlot || !hasDocxHtml) && (
            <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px dashed #cbd5e1' }}>
              {renderSignatureSlot('Submitter')}
            </div>
          )}

          {/* Approval Route Summary at Bottom of Document */}
          {hasWorkflow && (
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Sequential Department Approval Chain
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <span className="sd-badge sd-badge-accent">
                  <User size={11} /> 1. You ({currentUser.name})
                </span>
                {(template.workflow || []).map((w, idx) => (
                  <React.Fragment key={idx}>
                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
                    <span className="sd-badge sd-badge-gray">
                      <ShieldCheck size={11} /> {idx + 2}. {w.department}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Footer Mark */}
          <div className="sd-word-page-footer-mark">
            <span>SmartDoc Automated Form Engine</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      </main>

      {/* Right-Side Interactive Form Rail */}
      {fields.length > 0 && (
        <aside className="sd-form-filler-rail sd-print-hide" aria-label="Form Fields Sidebar">
          <div className="sd-rail-header">
            <div className="sd-rail-header-top">
              <div className="sd-rail-title-row">
                <FileEdit size={16} className="sd-rail-icon" />
                <h3 className="sd-rail-title">Document Form Fields</h3>
              </div>
              <div className="sd-rail-header-actions">
                <button
                  type="button"
                  id="btn-toggle-visual-line"
                  className={`sd-rail-line-toggle ${showVisualLine ? 'is-active' : ''}`}
                  onClick={() => setShowVisualLine(prev => {
                    const next = !prev;
                    try { localStorage.setItem('smartdoc_form_show_visual_line', String(next)); } catch (e) {}
                    return next;
                  })}
                  title={showVisualLine ? 'Visual guide line is ON. Click to turn OFF.' : 'Visual guide line is OFF. Click to turn ON.'}
                  aria-pressed={showVisualLine}
                >
                  <span className="sd-rail-toggle-track" aria-hidden="true">
                    <span className="sd-rail-toggle-thumb" />
                  </span>
                  <span className="sd-rail-toggle-label">Line {showVisualLine ? 'ON' : 'OFF'}</span>
                </button>
                <span className={`sd-rail-count-badge ${completedCount === fields.length ? 'is-complete' : ''}`}>
                  {completedCount} / {fields.length} Filled
                </span>
              </div>
            </div>
            <p className="sd-rail-subtitle">
              Fill values here or click placeholders in the document sheet. Updates appear live on paper.
            </p>
            {missingMandatoryCount > 0 && (
              <div className="sd-rail-mandatory-alert">
                <AlertTriangle size={13} />
                <span>{missingMandatoryCount} mandatory field{missingMandatoryCount > 1 ? 's' : ''} remaining</span>
              </div>
            )}
          </div>

          <div className="sd-rail-body" ref={railBodyRef}>
            {fields.map((f, idx) => {
              const val = values[f.key] ?? '';
              const hasVal = String(val).trim().length > 0;
              const isFieldInvalid = touched && f.required && !hasVal;
              const isActive = activeRailField === f.key;

              return (
                <div
                  id={`rail-card-${f.key}`}
                  key={f.key}
                  className={`sd-rail-field-card ${isActive ? 'is-active' : ''} ${hasVal ? 'is-filled' : 'is-empty'} ${isFieldInvalid ? 'is-invalid' : ''}`}
                  onClick={() => handleRailInputFocus(f.key)}
                >
                  <div className="sd-rail-field-top">
                    <div className="sd-rail-field-meta">
                      <span className="sd-rail-index-badge">{idx + 1}</span>
                      <label htmlFor={`rail-input-${f.key}`} className="sd-rail-field-label" title={f.label || f.key}>
                        {f.label || f.key}
                      </label>
                      {f.required ? (
                        <span className="sd-rail-badge-required" title="Mandatory field">* Required</span>
                      ) : (
                        <span className="sd-rail-badge-optional">Optional</span>
                      )}
                    </div>
                    <div className="sd-rail-field-top-right">
                      {isFieldBold(f) && (
                        <span className="sd-rail-bold-chip" title="Configured with Bold (700) weight in template">Bold</span>
                      )}
                      <span className="sd-rail-type-chip">{f.type || 'text'}</span>
                    </div>
                  </div>

                  {/* Field Description / Instructions for filler */}
                  {f.description && (
                    <div className="sd-rail-field-desc">
                      <Info size={12} className="sd-desc-icon" />
                      <span>{f.description}</span>
                    </div>
                  )}

                  <div className="sd-rail-field-input-wrap">
                    {renderRailInputControl(f, val, isFieldInvalid)}
                  </div>

                  {f.placeholder && !hasVal && (
                    <div className="sd-rail-field-hint">{f.placeholder}</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sd-rail-footer">
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handleSubmit}
              disabled={saving || !hasWorkflow}
            >
              {saving ? (
                <CheckCircle2 size={15} className="sd-spin" />
              ) : isResubmit ? (
                <GitCommit size={15} />
              ) : (
                <Send size={15} />
              )}
              {saving ? 'Submitting…' : !hasWorkflow ? 'Workflow Required' : isResubmit ? 'Resubmit for Approval' : 'Sign & Submit Form'}
            </button>
          </div>
        </aside>
      )}

      {/* Visual Leader Connector Line from Right Text Field to Document Placeholder */}
      {showVisualLine && connectorCoords && (
        <svg
          className="sd-filler-connector-svg sd-print-hide"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sd-connector-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--primary-500, #a4fb4f)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="var(--primary-500, #a4fb4f)" stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* Subtle Ambient Glow Path */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--primary-500, #a4fb4f)"
            strokeWidth="4"
            opacity="0.22"
          />
          {/* Main Animated Dash Line */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#sd-connector-gradient)"
            strokeWidth="2"
            strokeDasharray="6 4"
            className="sd-connector-line-animated"
          />
          {/* Target Pointer at Document Placeholder: crisp pin dot and subtle downward arrow */}
          <circle cx={connectorCoords.x1} cy={connectorCoords.y1 - 8} r={2} fill="var(--primary-500, #a4fb4f)" />
          <polygon
            points={`${connectorCoords.x1 - 3},${connectorCoords.y1 - 8} ${connectorCoords.x1 + 3},${connectorCoords.y1 - 8} ${connectorCoords.x1},${connectorCoords.y1 - 2}`}
            fill="var(--primary-500, #a4fb4f)"
          />
          {/* Source Marker at Right Rail Field */}
          <circle cx={connectorCoords.x2} cy={connectorCoords.y2} r={3} fill="var(--primary-500, #a4fb4f)" />
        </svg>
      )}
    </div>

      {/* ============================================================== */}
      {/* DIALOG 1: Single Field Placeholder Filling Dialogue            */}
      {/* ============================================================== */}
      {activeDialogField && (
        <div
          className="sd-ph-dialog-backdrop"
          style={{ zIndex: 100500 }}
        >
          <div
            className="sd-ph-dialog-card"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sd-ph-dialog-title"
          >
            <div className="sd-ph-dialog-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="sd-ph-dialog-icon">
                  {activeDialogField.type === 'date' ? <Calendar size={16} /> :
                   activeDialogField.type === 'number' ? <Hash size={16} /> :
                   activeDialogField.type === 'dropdown' ? <ChevronDown size={16} /> :
                   activeDialogField.type === 'textarea' ? <FileText size={16} /> :
                   <Type size={16} />}
                </div>
                <div>
                  <h3 id="sd-ph-dialog-title" className="sd-ph-dialog-title">
                    {activeDialogField.label || activeDialogField.key}
                  </h3>
                  <span className="sd-ph-dialog-type-tag">
                    {activeDialogField.type === 'date' ? 'Date Field' :
                     activeDialogField.type === 'number' ? 'Numeric Amount / Number' :
                     activeDialogField.type === 'dropdown' ? 'Dropdown Choice' :
                     activeDialogField.type === 'textarea' ? 'Multi-line Paragraph' :
                     'Text Placeholder'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeDialogField.required ? (
                  <span className="sd-badge sd-badge-red sd-badge-xs">
                    * Mandatory
                  </span>
                ) : (
                  <span className="sd-badge sd-badge-gray sd-badge-xs">Optional</span>
                )}
                <button
                  type="button"
                  className="sd-icon-btn sd-icon-btn-xs"
                  onClick={() => setActiveDialogField(null)}
                  title="Close dialog (Esc)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <form onSubmit={handleApplyDialogValue}>
              <div className="sd-ph-dialog-body">
                {/* Field Description / Instructions */}
                {activeDialogField.description && (
                  <div className="sd-dialog-field-desc">
                    <Info size={14} className="sd-desc-icon" />
                    <div className="sd-dialog-desc-content">
                      <span className="sd-dialog-desc-title">Instructions &amp; Guidance</span>
                      <p className="sd-dialog-desc-text">{activeDialogField.description}</p>
                    </div>
                  </div>
                )}

                {activeDialogField.placeholder && (
                  <p className="sd-ph-dialog-hint">{activeDialogField.placeholder}</p>
                )}

                <div className="sd-ph-dialog-input-wrap">
                  {activeDialogField.type === 'date' ? (
                    <div>
                      <input
                        type="date"
                        autoFocus
                        className="sd-input"
                        value={dialogFieldValue}
                        onChange={e => setDialogFieldValue(e.target.value)}
                      />
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setDialogFieldValue(new Date().toISOString().slice(0, 10))}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setDialogFieldValue(addDays(7))}
                        >
                          +1 Week
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setDialogFieldValue(addDays(30))}
                        >
                          +30 Days
                        </button>
                      </div>
                    </div>
                  ) : activeDialogField.type === 'number' ? (
                    <input
                      type="number"
                      step="any"
                      autoFocus
                      className="sd-input"
                      placeholder={activeDialogField.placeholder || 'Enter amount or number…'}
                      value={dialogFieldValue}
                      onChange={e => setDialogFieldValue(e.target.value)}
                    />
                  ) : activeDialogField.type === 'dropdown' ? (
                    <select
                      autoFocus
                      className="sd-input"
                      value={dialogFieldValue}
                      onChange={e => setDialogFieldValue(e.target.value)}
                    >
                      <option value="">-- Choose {activeDialogField.label || 'an option'} --</option>
                      {(activeDialogField.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : activeDialogField.type === 'checkbox' ? (
                    <label className="sd-doc-live-checkbox" style={{ padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={dialogFieldValue === 'Yes' || dialogFieldValue === true || dialogFieldValue === 'true'}
                        onChange={e => setDialogFieldValue(e.target.checked ? 'Yes' : 'No')}
                      />
                      <span>{activeDialogField.placeholder || activeDialogField.label || 'I Confirm & Agree'}</span>
                    </label>
                  ) : activeDialogField.type === 'textarea' ? (
                    <textarea
                      rows={4}
                      autoFocus
                      className="sd-input sd-doc-live-textarea"
                      placeholder={activeDialogField.placeholder || `Enter ${activeDialogField.label || 'details'}…`}
                      value={dialogFieldValue}
                      onChange={e => setDialogFieldValue(e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      autoFocus
                      className="sd-input"
                      placeholder={activeDialogField.placeholder || `Enter ${activeDialogField.label || 'value'}…`}
                      value={dialogFieldValue}
                      onChange={e => setDialogFieldValue(e.target.value)}
                    />
                  )}
                </div>
              </div>

              <div className="sd-ph-dialog-footer">
                <div className="sd-ph-dialog-footer-left">
                  {values[activeDialogField.key] ? (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-xs"
                      onClick={handleClearDialogField}
                    >
                      <Trash2 size={12} /> Clear Value
                    </button>
                  ) : <span />}
                </div>
                <div className="sd-ph-dialog-footer-right" style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActiveDialogField(null)}
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-apply-dialog-field-value"
                    type="submit"
                    className="btn btn-primary btn-sm"
                  >
                    <Check size={14} /> Apply Value
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DIALOG 2: Missing Mandatory Fields Alert Prompt                */}
      {/* ============================================================== */}
      {showMissingPromptModal && (
        <div
          className="sd-modal-backdrop"
          style={{ zIndex: 100500 }}
        >
          <div
            className="sd-modal-box sd-modal-sm"
            onClick={e => e.stopPropagation()}
            style={{ border: '1px solid var(--bad-500)', boxShadow: '0 20px 45px rgba(0, 0, 0, 0.85)' }}
          >
            <div className="sd-modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--bad-500) 20%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bad-500)'
                }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Mandatory Fields Incomplete
                  </h3>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    Cannot submit until all required fields are filled.
                  </span>
                </div>
              </div>
              <button className="sd-icon-btn sd-icon-btn-xs" onClick={() => setShowMissingPromptModal(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="sd-modal-body" style={{ padding: '16px' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: '0 0 10px 0' }}>
                The following mandatory fields and placeholders must be completed:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {fields.filter(f => f.required && !String(values[f.key] ?? '').trim()).map(f => (
                  <div
                    key={f.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--bad-500)', fontWeight: 800 }}>*</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {f.label || f.key}
                      </span>
                      <span className="sd-badge sd-badge-gray sd-badge-xs">
                        {f.mode === 'placeholder' ? 'Placeholder' : 'Input'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={() => {
                        setShowMissingPromptModal(false);
                        if (f.mode === 'placeholder') {
                          handleOpenFieldDialog(f);
                        } else {
                          const el = document.getElementById(`live-field-${f.key.replace(/\W+/g, '-').toLowerCase()}`);
                          if (el) {
                            el.focus();
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }
                      }}
                    >
                      Fill Now →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="sd-modal-footer" style={{ justifyContent: 'flex-end', padding: '12px 16px' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowMissingPromptModal(false)}
              >
                Review Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
