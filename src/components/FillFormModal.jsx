import React, { useMemo, useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { printWordDocument } from '../utils/wordPrintEngine';
import { exportFormSheetToPdf } from '../utils/pdfExportEngine';
import { formatDate, downloadBlob } from './ui';
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
  Download,
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
  Loader2,
  Lock,
  Layers,
  Link2,
  Image as ImageIcon,
  Compass,
  ArrowRight,
  Sparkles
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

const decodeSlotName = (raw) =>
  String(raw || '')
    .replace(/&(amp;)+/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const FillFormModal = ({
  template,
  submission,
  onClose,
  onDone,
  initialPrint = false,
  initialDownload = false,
  isViewOnly = false,
  topBanner = null,
  customRightRail = null,
  extraHeaderActions = null,
  headerMetaOverride = null,
  headerBadgesOverride = null,
  onFieldClickInViewOnly = null,
  highlightedFieldKey = null
}) => {
  const { currentUser, users, formTemplates, archivedTemplates, submitForm, resubmitForm, openSignatureModal, addToast } = useApp();
  const isResubmit = !!submission && !isViewOnly;
  const hasWorkflow = Array.isArray(template?.workflow) && template.workflow.length > 0;

  // Resolve tagged subforms for this Main Form (or from saved submission.subformsData)
  const allKnownTemplates = useMemo(
    () => [...(formTemplates || []), ...(archivedTemplates || [])],
    [formTemplates, archivedTemplates]
  );

  const taggedSubforms = useMemo(() => {
    const rawIds = [
      ...(Array.isArray(template?.subforms) ? template.subforms : []),
      ...Object.keys(submission?.subformsData || {})
    ];
    const seen = new Set();
    const list = [];
    for (const rawId of rawIds) {
      const sid = typeof rawId === 'string' ? rawId : rawId?.id;
      if (!sid || sid === template?.id || seen.has(sid)) continue;
      seen.add(sid);
      const found = allKnownTemplates.find(ft => ft.id === sid);
      // Enforce same-department rule for Main Form and Subforms
      if (found && (!template?.department || found.department === template.department)) {
        list.push(found);
      }
    }
    return list;
  }, [template, submission, allKnownTemplates]);

  const parentMainForm = useMemo(() => {
    if (!template?.id || taggedSubforms.length > 0) return null;
    return (formTemplates || []).find(
      ft =>
        ft.id !== template.id &&
        ft.department === template.department &&
        Array.isArray(ft.subforms) &&
        ft.subforms.includes(template.id)
    ) || null;
  }, [template, taggedSubforms, formTemplates]);

  const [activeDocTabId, setActiveDocTabId] = useState('MAIN');

  const activeDocTemplate = useMemo(() => {
    if (activeDocTabId === 'MAIN') return template;
    return taggedSubforms.find(sf => sf.id === activeDocTabId) || template;
  }, [activeDocTabId, template, taggedSubforms]);

  const activeSubformFileType = (activeDocTemplate?.fileType || 'docx').toLowerCase();
  const isActiveSubformStatic = activeDocTabId !== 'MAIN' && (activeSubformFileType === 'pdf' || activeSubformFileType === 'image');
  const [staticSubformUrl, setStaticSubformUrl] = useState(null);
  const [staticSubformBlob, setStaticSubformBlob] = useState(null);
  const [staticSubformLoading, setStaticSubformLoading] = useState(false);
  const [staticSubformError, setStaticSubformError] = useState('');

  useEffect(() => {
    if (!isActiveSubformStatic || !activeDocTemplate?.id) {
      setStaticSubformUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setStaticSubformBlob(null);
      setStaticSubformLoading(false);
      setStaticSubformError('');
      return;
    }

    let cancelled = false;
    setStaticSubformLoading(true);
    setStaticSubformError('');

    apiService
      .getTemplateFile(activeDocTemplate.id)
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setStaticSubformBlob(blob);
        setStaticSubformUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setStaticSubformLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setStaticSubformError(err.message || 'Could not load subform attachment');
        setStaticSubformLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isActiveSubformStatic, activeDocTemplate?.id]);

  const mainFields = useMemo(() => template?.fields || [], [template]);
  const fields = useMemo(() => activeDocTemplate?.fields || [], [activeDocTemplate]);

  const [mainValues, setMainValues] = useState(() =>
    Object.fromEntries((template?.fields || []).map(f => [f.key, submission?.formData?.[f.key] ?? '']))
  );

  const [subformsValues, setSubformsValues] = useState(() => {
    const init = {};
    taggedSubforms.forEach(sf => {
      const saved = submission?.subformsData?.[sf.id] || {};
      init[sf.id] = Object.fromEntries((sf.fields || []).map(f => [f.key, saved[f.key] ?? '']));
    });
    return init;
  });

  useEffect(() => {
    if (!taggedSubforms.length) return;
    setSubformsValues(prev => {
      let changed = false;
      const next = { ...prev };
      taggedSubforms.forEach(sf => {
        if (!next[sf.id]) {
          changed = true;
          const saved = submission?.subformsData?.[sf.id] || {};
          next[sf.id] = Object.fromEntries((sf.fields || []).map(f => [f.key, saved[f.key] ?? '']));
        }
      });
      return changed ? next : prev;
    });
  }, [taggedSubforms, submission]);

  const values = useMemo(() => {
    if (activeDocTabId === 'MAIN' || !activeDocTemplate || activeDocTemplate.id === template?.id) {
      return mainValues;
    }
    return subformsValues[activeDocTemplate.id] || {};
  }, [activeDocTabId, activeDocTemplate, template, mainValues, subformsValues]);

  const setValues = useCallback((updater) => {
    if (activeDocTabId === 'MAIN' || !activeDocTemplate || activeDocTemplate.id === template?.id) {
      setMainValues(prev => (typeof updater === 'function' ? updater(prev) : updater));
    } else {
      const sfId = activeDocTemplate.id;
      setSubformsValues(prev => {
        const currentSfVals = prev[sfId] || {};
        const nextSfVals = typeof updater === 'function' ? updater(currentSfVals) : updater;
        return { ...prev, [sfId]: nextSfVals };
      });
    }
  }, [activeDocTabId, activeDocTemplate, template]);

  const [expiryDate, setExpiryDate] = useState(() => {
    const existing = submission?.expiryDate;
    return existing && existing >= tomorrow() ? existing : addDays(template?.defaultExpiryDays);
  });

  const [changeSummary, setChangeSummary] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPrintingBlank, setIsPrintingBlank] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Single-Field Placeholder Filling Dialogue state
  const [activeDialogField, setActiveDialogField] = useState(null);
  const [dialogFieldValue, setDialogFieldValue] = useState('');
  const [showMissingPromptModal, setShowMissingPromptModal] = useState(false);
  const [activeRailField, setActiveRailField] = useState(() => (isViewOnly ? null : fields[0]?.key || null));
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
  const sheetRef = useRef(null);
  const railBodyRef = useRef(null);
  const docBodyRef = useRef(null);
  const [mountedSlots, setMountedSlots] = useState([]);

  useEffect(() => {
    if (!isViewOnly) {
      setActiveRailField(fields[0]?.key || null);
    }
  }, [activeDocTabId]);

  useEffect(() => {
    if (!isViewOnly && !activeRailField && fields.length > 0) {
      setActiveRailField(fields[0].key);
    }
  }, [fields, activeRailField, isViewOnly]);

  // Unified checkbox & field completion helpers (handles 'Yes', 'yes', 'true', true consistently)
  const isCheckboxChecked = useCallback((val) => {
    if (val === true) return true;
    const s = String(val ?? '').trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === 'checked' || s === '1';
  }, []);

  const isFieldFilled = useCallback((f, val) => {
    if (f?.type === 'checkbox') return isCheckboxChecked(val);
    return String(val ?? '').trim().length > 0;
  }, [isCheckboxChecked]);

  const completedCount = useMemo(() => {
    return fields.filter(f => isFieldFilled(f, values[f.key])).length;
  }, [fields, values, isFieldFilled]);

  const missingMandatoryCount = useMemo(() => {
    return fields.filter(f => f.required && !isFieldFilled(f, values[f.key])).length;
  }, [fields, values, isFieldFilled]);

  const allMissingItems = useMemo(() => {
    const items = [];
    mainFields.forEach(f => {
      if (f.required && !isFieldFilled(f, mainValues[f.key])) {
        items.push({
          tabId: 'MAIN',
          tabTitle: `Main Form: ${template?.title || 'Main Form'}`,
          field: f,
          key: f.key,
          label: f.label || f.key
        });
      }
    });
    taggedSubforms.forEach((sf, idx) => {
      const sfVals = subformsValues[sf.id] || {};
      (sf.fields || []).forEach(f => {
        if (f.required && !isFieldFilled(f, sfVals[f.key])) {
          items.push({
            tabId: sf.id,
            tabTitle: `Subform ${idx + 1}: ${sf.title || 'Subform'}`,
            field: f,
            key: f.key,
            label: f.label || f.key
          });
        }
      });
    });
    return items;
  }, [mainFields, mainValues, template, taggedSubforms, subformsValues, isFieldFilled]);

  // Interactive Guided Form Copilot state & step builder
  const [showFormGuide, setShowFormGuide] = useState(() => {
    try {
      const saved = localStorage.getItem('smartdoc_show_form_guide');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [wizardIdx, setWizardIdx] = useState(0);

  const toggleFormGuide = useCallback(() => {
    setShowFormGuide(prev => {
      const next = !prev;
      try { localStorage.setItem('smartdoc_show_form_guide', String(next)); } catch {}
      return next;
    });
  }, []);

  const wizardSteps = useMemo(() => {
    const list = [];
    // 1. Main form fields
    mainFields.forEach((f, idx) => {
      const val = mainValues[f.key];
      const filled = isFieldFilled(f, val);
      list.push({
        id: `MAIN:${f.key}`,
        type: 'field',
        tabId: 'MAIN',
        tabTitle: template?.title || 'Main Form',
        fieldIndex: idx + 1,
        totalTabFields: mainFields.length,
        field: f,
        key: f.key,
        label: f.label || f.key,
        required: !!f.required,
        isDone: filled
      });
    });

    // 2. Tagged subform fields
    taggedSubforms.forEach((sf, sIdx) => {
      const sfVals = subformsValues[sf.id] || {};
      const sfFields = sf.fields || [];
      sfFields.forEach((f, fIdx) => {
        const val = sfVals[f.key];
        const filled = isFieldFilled(f, val);
        list.push({
          id: `${sf.id}:${f.key}`,
          type: 'field',
          tabId: sf.id,
          tabTitle: `Subform ${sIdx + 1}: ${sf.title}`,
          fieldIndex: fIdx + 1,
          totalTabFields: sfFields.length,
          field: f,
          key: f.key,
          label: f.label || f.key,
          required: !!f.required,
          isDone: filled
        });
      });
    });

    // 3. Digital Signature & PKI Seal step
    const sigReady = !!currentUser?.hasSignature;
    list.push({
      id: 'STEP:SIGNATURE',
      type: 'signature',
      label: 'Digital Signature & PKI Seal',
      required: true,
      isDone: sigReady
    });

    // 4. Final Review & Submit step
    list.push({
      id: 'STEP:SUBMIT',
      type: 'submit',
      label: 'Review Approval Route & Submit',
      required: true,
      isDone: allMissingItems.length === 0 && sigReady
    });

    return list;
  }, [mainFields, mainValues, template?.title, taggedSubforms, subformsValues, isFieldFilled, currentUser?.hasSignature, allMissingItems.length]);

  const safeWizardIdx = Math.min(wizardIdx, Math.max(0, wizardSteps.length - 1));
  const currentWizardStep = wizardSteps[safeWizardIdx] || wizardSteps[0];

  const wizardProgressPct = useMemo(() => {
    if (!wizardSteps.length) return 100;
    const doneSteps = wizardSteps.filter(s => s.isDone).length;
    return Math.round((doneSteps / wizardSteps.length) * 100);
  }, [wizardSteps]);

  const nextGuideTarget = useMemo(() => {
    const activeReq = fields.find(f => f.required && !isFieldFilled(f, values[f.key]));
    if (activeReq) {
      return { tabId: activeDocTabId, key: activeReq.key, label: activeReq.label || activeReq.key, required: true };
    }
    if (allMissingItems.length > 0) {
      return { ...allMissingItems[0], required: true };
    }
    const activeOpt = fields.find(f => !isFieldFilled(f, values[f.key]));
    if (activeOpt) {
      return { tabId: activeDocTabId, key: activeOpt.key, label: activeOpt.label || activeOpt.key, required: false };
    }
    return null;
  }, [fields, values, isFieldFilled, activeDocTabId, allMissingItems]);

  // Robust resolution for on-document form element (direct input wrap/box or in-text placeholder)
  const getDocFieldElement = useCallback((key) => {
    if (!key) return null;
    const cleanKey = String(key).replace(/[*:\s]+$/, '').trim();
    const sanitizedKey = String(key).replace(/\W+/g, '-').toLowerCase();
    const sanitizedClean = cleanKey.replace(/\W+/g, '-').toLowerCase();

    // 1. Direct ID matches (wrapper, input control, or in-text placeholder)
    const directMatch =
      document.getElementById(`live-wrap-${sanitizedKey}`) ||
      document.getElementById(`live-field-${sanitizedKey}`) ||
      document.getElementById(`live-placeholder-${sanitizedKey}`) ||
      document.getElementById(`live-wrap-${sanitizedClean}`) ||
      document.getElementById(`live-field-${sanitizedClean}`) ||
      document.getElementById(`live-placeholder-${sanitizedClean}`) ||
      document.getElementById(`live-field-${key}`) ||
      document.getElementById(`live-placeholder-${key}`);
    if (directMatch) return directMatch;

    // 2. Data attribute selectors
    const attrMatch =
      document.querySelector(`[data-field-key="${key}"]`) ||
      document.querySelector(`[data-field-key="${cleanKey}"]`) ||
      document.querySelector(`[data-field-key="${sanitizedKey}"]`) ||
      document.querySelector(`[data-field-key="${sanitizedClean}"]`) ||
      document.querySelector(`.sd-live-slot-field[data-field-key="${key}"]`) ||
      document.querySelector(`.sd-live-slot-field[data-field-key="${cleanKey}"]`);
    if (attrMatch) return attrMatch;

    // 3. Fallback prefix query
    return document.querySelector(`[id^="live-wrap-"][id*="${sanitizedClean}"]`) ||
           document.querySelector(`[id^="live-field-"][id*="${sanitizedClean}"]`) ||
           document.querySelector(`[id^="live-placeholder-"][id*="${sanitizedClean}"]`);
  }, []);

  // Robust resolution for right rail card & input elements
  const getRailFieldElements = useCallback((key) => {
    if (!key) return { railCard: null, railInput: null };
    const cleanKey = String(key).replace(/[*:\s]+$/, '').trim();
    const sanitizedKey = String(key).replace(/\W+/g, '-').toLowerCase();
    const sanitizedClean = cleanKey.replace(/\W+/g, '-').toLowerCase();

    const railCard =
      document.getElementById(`rail-card-${key}`) ||
      document.getElementById(`rail-card-${cleanKey}`) ||
      document.getElementById(`rail-card-${sanitizedKey}`) ||
      document.getElementById(`rail-card-${sanitizedClean}`) ||
      document.querySelector(`[data-rail-key="${key}"]`) ||
      document.querySelector(`[data-rail-key="${cleanKey}"]`) ||
      document.querySelector(`.sd-rail-field-card[data-rail-key="${key}"]`) ||
      document.querySelector(`.sd-rail-field-card[data-rail-key="${cleanKey}"]`);

    const railInput =
      document.getElementById(`rail-input-${key}`) ||
      document.getElementById(`rail-input-${cleanKey}`) ||
      document.getElementById(`rail-input-${sanitizedKey}`) ||
      document.getElementById(`rail-input-${sanitizedClean}`) ||
      railCard?.querySelector('.sd-rail-input') ||
      railCard?.querySelector('input, textarea, select');

    return { railCard, railInput };
  }, []);

  const updateConnectorLine = useCallback(() => {
    if (!showVisualLine || !activeRailField || !workspaceRef.current) {
      setConnectorCoords(null);
      return;
    }

    const docElem = getDocFieldElement(activeRailField);
    const { railCard } = getRailFieldElements(activeRailField);

    if (!docElem || !railCard || !workspaceRef.current) {
      setConnectorCoords(null);
      return;
    }

    const wsRect = workspaceRef.current.getBoundingClientRect();
    const railRect = railCard.getBoundingClientRect();

    // Resolve the exact single-line visual rect of the target field/placeholder.
    // Using getClientRects() prevents inline placeholders that wrap across 2 lines
    // from returning a full-paragraph union bounding box whose center points to unrelated text.
    const getTargetAnchorRect = (elem) => {
      const directWrap = elem.classList?.contains('sd-doc-live-field-wrap')
        ? elem
        : elem.closest?.('.sd-doc-live-field-wrap');
      if (directWrap) {
        return directWrap.getBoundingClientRect();
      }

      const inlineToken =
        elem.querySelector?.('.sd-ph-filled-value, .sd-ph-tag-token, .sd-doc-live-placeholder') ||
        elem;

      const rawRects = Array.from(inlineToken.getClientRects()).filter(
        (r) => r.width > 1 && r.height > 1
      );

      if (rawRects.length === 0) {
        return elem.getBoundingClientRect();
      }
      if (rawRects.length === 1) {
        return rawRects[0];
      }

      // Merge rects that sit on the same visual line (within 8px vertical top)
      const lineGroups = [];
      for (const r of rawRects) {
        const existing = lineGroups.find((g) => Math.abs(g.top - r.top) < 8);
        if (existing) {
          existing.left = Math.min(existing.left, r.left);
          existing.right = Math.max(existing.right, r.right);
          existing.top = Math.min(existing.top, r.top);
          existing.bottom = Math.max(existing.bottom, r.bottom);
          existing.width = existing.right - existing.left;
          existing.height = existing.bottom - existing.top;
        } else {
          lineGroups.push({
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height
          });
        }
      }

      lineGroups.sort((a, b) => a.top - b.top);

      // Anchor to the first line fragment if it is wide enough (>= 22px), otherwise the widest line fragment
      if (lineGroups[0].width >= 22) {
        return lineGroups[0];
      }
      return lineGroups.reduce((best, cur) => (cur.width > best.width ? cur : best), lineGroups[0]);
    };

    const docRect = getTargetAnchorRect(docElem);

    // If elements are not rendered in layout yet
    if (docRect.width === 0 && docRect.height === 0) {
      return;
    }

    // Verify docElem is reasonably within visible desk area (with buffer for smooth scrolling)
    const deskRect = deskRef.current?.getBoundingClientRect();
    if (deskRect) {
      if (docRect.bottom < (deskRect.top - 80) || docRect.top > (deskRect.bottom + 80)) {
        setConnectorCoords(null);
        return;
      }
    }

    const isDirectField = !!(
      docElem.classList?.contains('sd-doc-live-field-wrap') ||
      docElem.closest?.('.sd-doc-live-field-wrap')
    );

    // Anchor to document field/placeholder:
    // For inline text placeholders on Line N, anchor 4px inside the top of Line N
    // so the pointer lands directly on Line N and never sits on the text line above it (Line N-1).
    const x1 = Math.round(docRect.left + docRect.width / 2 - wsRect.left);
    const y1 = Math.round((isDirectField ? docRect.top - 1 : docRect.top + 4) - wsRect.top);

    // Anchor smoothly to the left border of the right rail card
    const x2 = Math.round(railRect.left - wsRect.left);
    const y2 = Math.round(railRect.top + Math.min(36, railRect.height / 2) - wsRect.top);

    setConnectorCoords({ x1, y1, x2, y2 });
  }, [showVisualLine, activeRailField, getDocFieldElement, getRailFieldElements]);

  useEffect(() => {
    if (!showVisualLine) {
      setConnectorCoords(null);
      return;
    }

    updateConnectorLine();
    const rafId = requestAnimationFrame(updateConnectorLine);

    const desk = deskRef.current;
    const railBody = railBodyRef.current;

    const onScrollOrResize = () => {
      window.requestAnimationFrame(updateConnectorLine);
    };

    window.addEventListener('resize', onScrollOrResize);
    desk?.addEventListener('scroll', onScrollOrResize, { passive: true });
    railBody?.addEventListener('scroll', onScrollOrResize, { passive: true });

    const timer1 = setTimeout(updateConnectorLine, 50);
    const timer2 = setTimeout(updateConnectorLine, 150);
    const timer3 = setTimeout(updateConnectorLine, 350);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener('resize', onScrollOrResize);
      desk?.removeEventListener('scroll', onScrollOrResize);
      railBody?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [showVisualLine, updateConnectorLine, activeRailField, values, mountedSlots]);

  const pathD = useMemo(() => {
    if (!connectorCoords) return '';
    const { x1, y1, x2, y2 } = connectorCoords;
    const dx = Math.max(60, (x2 - x1) * 0.42);
    const leadX = Math.min(36, Math.max(12, (x2 - x1) * 0.12));
    // Smooth low-profile bezier that glides directly into the target line without looping over the line above
    return `M ${x1} ${y1 - 4} C ${x1 + leadX} ${y1 - 18}, ${x2 - dx} ${y2 - 6}, ${x2} ${y2}`;
  }, [connectorCoords]);

  const handleFocusField = (key) => {
    setActiveRailField(key);
    const { railCard, railInput } = getRailFieldElements(key);
    if (railInput) {
      railInput.focus();
    }
    if (railCard) {
      railCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleRailInputFocus = (key) => {
    setActiveRailField(key);
    const docElem = getDocFieldElement(key);
    if (docElem) {
      docElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const goToWizardStep = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(idx, wizardSteps.length - 1));
    setWizardIdx(clamped);
    const step = wizardSteps[clamped];
    if (!step) return;

    if (step.type === 'field') {
      if (step.tabId && step.tabId !== activeDocTabId) {
        setActiveDocTabId(step.tabId);
        setTimeout(() => {
          setActiveRailField(step.key);
          const docElem = getDocFieldElement(step.key);
          docElem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const { railCard } = getRailFieldElements(step.key);
          railCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 120);
      } else {
        setActiveRailField(step.key);
        const docElem = getDocFieldElement(step.key);
        docElem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const { railCard } = getRailFieldElements(step.key);
        railCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else if (step.type === 'signature') {
      const sigEl = sheetRef.current?.querySelector('.sd-doc-signature-block');
      sigEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (step.type === 'submit') {
      const routeEl = sheetRef.current?.querySelector('.sd-form-filler-workflow-chain');
      routeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [wizardSteps, activeDocTabId, getDocFieldElement, getRailFieldElements]);

  const handleJumpToNextUnfilled = useCallback(() => {
    const nextIdx = wizardSteps.findIndex((s, i) => i > safeWizardIdx && !s.isDone);
    const fallbackIdx = wizardSteps.findIndex(s => !s.isDone);
    const targetIdx = nextIdx !== -1 ? nextIdx : (fallbackIdx !== -1 ? fallbackIdx : wizardSteps.length - 1);
    goToWizardStep(targetIdx);
  }, [wizardSteps, safeWizardIdx, goToWizardStep]);

  const getWizardFieldValue = useCallback((step) => {
    if (!step || step.type !== 'field') return '';
    if (step.tabId === 'MAIN') return mainValues[step.key] ?? '';
    return subformsValues[step.tabId]?.[step.key] ?? '';
  }, [mainValues, subformsValues]);

  const setWizardFieldValue = useCallback((step, newVal) => {
    if (!step || step.type !== 'field') return;
    if (step.tabId === 'MAIN') {
      setMainValues(prev => ({ ...prev, [step.key]: newVal }));
    } else {
      setSubformsValues(prev => ({
        ...prev,
        [step.tabId]: {
          ...(prev[step.tabId] || {}),
          [step.key]: newVal
        }
      }));
    }
  }, []);

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

  // Print handlers: WYSIWYG document printing (filled or pristine blank, exactly as displayed on screen)
  const handlePrint = (blank = false) => {
    setIsPrintingBlank(blank);
    setIsPrinting(true);
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    document.body.classList.add('sd-printing-live-form');

    // Immediately sanitize date inputs in DOM so empty dates do not show browser mm/dd/yyyy
    const sheet = sheetRef.current || document.querySelector('.sd-form-filler-sheet');
    const restoredDateInputs = [];
    if (sheet) {
      sheet.querySelectorAll('input[type="date"]').forEach(inp => {
        const currentVal = inp.value;
        inp.setAttribute('data-was-date', 'true');
        inp.type = 'text';
        inp.placeholder = '';
        inp.removeAttribute('placeholder');
        if (!currentVal || blank) {
          inp.value = '';
        } else {
          inp.value = formatDate(currentVal) || currentVal;
        }
        restoredDateInputs.push({ inp, currentVal });
      });
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setIsPrintingBlank(false);
          setIsPrinting(false);
          document.body.classList.remove('sd-printing-live-form');
          restoredDateInputs.forEach(({ inp, currentVal }) => {
            try {
              inp.type = 'date';
              inp.value = currentVal;
              inp.removeAttribute('data-was-date');
            } catch (_) {}
          });
        }, 300);
      }, 120);
    });
  };

  // Download PDF handler: Exports the exact on-screen form sheet to a razor-sharp, lossless PDF
  const handleDownloadPdf = async () => {
    const targetSheet = sheetRef.current || document.querySelector('.sd-form-filler-sheet');
    if (!targetSheet || downloadingPdf) return;
    try {
      setDownloadingPdf(true);
      addToast('Preparing PDF', 'Generating high-resolution PDF with authentic document formatting...', 'info');
      const safeTitle = (submission?.title || template?.title || 'Form').replace(/[^a-zA-Z0-9_-]/g, '_');
      const docCode = submission?.uniqueNumber || template?.code || safeTitle;
      const fileName = `${docCode}_${submission ? 'submission' : isViewOnly ? 'template' : isResubmit ? 'v' + bumpPreview(submission?.version) : 'filled'}.pdf`;
      await exportFormSheetToPdf(targetSheet, fileName);
      addToast('PDF Saved', `Successfully downloaded "${fileName}"`, 'success');
    } catch (err) {
      console.error('Download form sheet PDF error:', err);
      addToast('PDF Failed', err.message || 'Could not export form as PDF', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Browser print lifecycle hooks (e.g. File > Print or browser keyboard shortcuts)
  useEffect(() => {
    let restoredInputs = [];
    const handleBefore = () => {
      setIsPrinting(true);
      document.body.classList.add('sd-printing-live-form');
      const sheet = sheetRef.current || document.querySelector('.sd-form-filler-sheet');
      if (sheet) {
        sheet.querySelectorAll('input[type="date"]').forEach(inp => {
          const currentVal = inp.value;
          inp.setAttribute('data-was-date', 'true');
          inp.type = 'text';
          inp.placeholder = '';
          inp.removeAttribute('placeholder');
          if (!currentVal) {
            inp.value = '';
          } else {
            inp.value = formatDate(currentVal) || currentVal;
          }
          restoredInputs.push({ inp, currentVal });
        });
      }
    };
    const handleAfter = () => {
      setIsPrinting(false);
      setIsPrintingBlank(false);
      document.body.classList.remove('sd-printing-live-form');
      restoredInputs.forEach(({ inp, currentVal }) => {
        try {
          inp.type = 'date';
          inp.value = currentVal;
          inp.removeAttribute('data-was-date');
        } catch (_) {}
      });
      restoredInputs = [];
    };
    window.addEventListener('beforeprint', handleBefore);
    window.addEventListener('afterprint', handleAfter);
    return () => {
      window.removeEventListener('beforeprint', handleBefore);
      window.removeEventListener('afterprint', handleAfter);
      document.body.classList.remove('sd-printing-live-form');
    };
  }, []);

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
  }, [values, template, submission]);

  // Auto trigger print when opened with initialPrint={true}
  useEffect(() => {
    if (initialPrint) {
      const timer = setTimeout(() => {
        handlePrint(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [initialPrint]);

  // Auto trigger download when opened with initialDownload={true}
  useEffect(() => {
    if (initialDownload) {
      const timer = setTimeout(() => {
        handleDownloadPdf();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [initialDownload]);

  const missing = useMemo(
    () => fields.filter(f => f.required && !isFieldFilled(f, values[f.key])).map(f => f.key),
    [fields, values, isFieldFilled]
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

  // Map fields for fast key lookups (with fuzzy normalization for spaces, asterisks, hyphens, and underscores)
  const fieldsMap = useMemo(() => {
    const map = new Map();
    fields.forEach(f => {
      if (!f) return;
      if (f.key) {
        const k = String(f.key).toLowerCase();
        const cleanK = k.replace(/[*:\s]+$/, '').trim();
        map.set(k, f);
        map.set(cleanK, f);
        map.set(cleanK.replace(/\W+/g, '-'), f);
        map.set(cleanK.replace(/\W+/g, '_'), f);
        map.set(cleanK.replace(/\s+/g, ''), f);
      }
      if (f.label) {
        const l = String(f.label).toLowerCase();
        const cleanL = l.replace(/[*:\s]+$/, '').trim();
        map.set(l, f);
        map.set(cleanL, f);
        map.set(cleanL.replace(/\s+/g, ' ').trim(), f);
        map.set(cleanL.replace(/\s+/g, '_').trim(), f);
        map.set(cleanL.replace(/\W+/g, '-').trim(), f);
        map.set(cleanL.replace(/\s+/g, ''), f);
      }
    });
    return map;
  }, [fields]);

  // Process template HTML content into DOM slots for React portals
  const { processedHtml, placedKeys, hasDocxHtml } = useMemo(() => {
    const rawHtml = activeDocTemplate?.htmlContent?.trim();
    if (!rawHtml) {
      return { processedHtml: '', placedKeys: new Set(), hasDocxHtml: false };
    }

    let html = rawHtml;
    const placed = new Set();

    const buildSigSlotHtml = (slot, rawW) => {
      const cleanSlot = decodeSlotName(slot || 'Submitter') || 'Submitter';
      const s = cleanSlot.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const normW = (rawW === 'auto' || rawW === 'Auto')
        ? 'auto'
        : ((parseInt(rawW, 10) > 0 && parseInt(rawW, 10) <= 100) ? parseInt(rawW, 10) : null);
      if (normW === 'auto') {
        return `<span class="sd-live-slot-sig" data-sig-slot="${s}" data-width="auto" style="width: auto; min-width: 210px; max-width: 100%; display: inline-block; vertical-align: top; margin: 8px 10px 8px 0; box-sizing: border-box;"></span>`;
      }
      if (normW && normW < 100) {
        return `<span class="sd-live-slot-sig" data-sig-slot="${s}" data-width="${normW}" style="width: calc(${normW}% - 12px); max-width: calc(${normW}% - 12px); display: inline-block; vertical-align: top; margin: 8px 8px 8px 0; box-sizing: border-box;"></span>`;
      }
      if (normW === 100) {
        return `<span class="sd-live-slot-sig" data-sig-slot="${s}" data-width="100" style="width: 100%; max-width: 100%; display: block; margin: 10px 0; box-sizing: border-box;"></span>`;
      }
      return `<span class="sd-live-slot-sig" data-sig-slot="${s}"></span>`;
    };

    // 1a. Signature slots wrapped in <span data-sig-width="...">
    html = html.replace(
      /<span[^>]*data-sig-width="([^"]+)"[^>]*>\s*\{\{\s*(?:Signature|sig)\s*:\s*([^}|]+)(?:\|[^}]*)?\}\}\s*<\/span>/gi,
      (match, w, slot) => buildSigSlotHtml(slot, w)
    );

    // 1b. Signature slots: {{Signature: Slot}} or {{Signature: Slot|width=50}}
    html = html.replace(
      /\{\{\s*(?:Signature|sig)\s*:\s*([^}|]+)(?:\|\s*width\s*=\s*([^}]+))?\}\}/gi,
      (match, slot, w) => buildSigSlotHtml(slot, w)
    );

    // 1c. Raw .sd-doc-sig-block DOM elements
    html = html.replace(
      /<div[^>]*class="[^"]*sd-doc-sig-block[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
      (match) => {
        const slotMatch = match.match(/data-sig-slot="([^"]+)"/i);
        const widthMatch = match.match(/data-width="([^"]+)"/i);
        return buildSigSlotHtml(slotMatch ? slotMatch[1] : 'Submitter', widthMatch ? widthMatch[1] : null);
      }
    );
    html = html.replace(
      /<div[^>]*class="[^"]*sd-doc-sig-block[^"]*"[^>]*data-sig-slot="([^"]+)"[^>]*>.*?<\/div>/gi,
      (match, slot) => {
        const widthMatch = match.match(/data-width="([^"]+)"/i);
        return buildSigSlotHtml(slot, widthMatch ? widthMatch[1] : null);
      }
    );

    // 1d. Collapse paragraph breaks or empty spacer paragraphs between adjacent inline signature slots (< 100% or auto)
    // so side-by-side signatures (e.g. 50% + 50%) render on the same horizontal row
    html = html.replace(
      /(<span class="sd-live-slot-sig"[^>]*><\/span>)\s*(?:<\/p>\s*(?:<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)*<p[^>]*>|(?:<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+|<br\s*\/?>\s*)+(?=<span class="sd-live-slot-sig")/gi,
      '$1 '
    );

    // 2. System tags: {{Form ID}}, {{Submitted By}}, {{Submitted Date}}, {{Department}}, {{Version}}
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const formIdText = submission?.uniqueNumber || `[Auto-Generated on Submit]`;
    const submitterName = submission?.submittedByName || currentUser?.name || 'Submitter';
    const deptName = activeDocTemplate?.department || template?.department || submission?.department || 'Department';
    const verText = isResubmit ? bumpPreview(submission?.version) : (activeDocTemplate?.version || template?.version || '1.0');

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
      const cleanFn = fn.replace(/[*:\s]+$/, '').trim();
      const f = fieldsMap.get(fn.toLowerCase()) ||
                fieldsMap.get(cleanFn.toLowerCase()) ||
                fieldsMap.get(cleanFn.replace(/\s+/g, ' ').toLowerCase()) ||
                fieldsMap.get(cleanFn.replace(/\s+/g, '_').toLowerCase()) ||
                fieldsMap.get(cleanFn.replace(/\W+/g, '-').toLowerCase()) ||
                fieldsMap.get(cleanFn.replace(/\s+/g, '').toLowerCase());

      if (f) {
        placed.add(f.key);
        const isBold = isFieldBold(f);
        const isDirect = f.mode === 'input' || (f.mode !== 'placeholder' && (f.width || f.type === 'textarea'));
        const widthStyle = (isDirect && f.width)
          ? (f.width === 100 ? 'width: 100%; max-width: 100%; margin-right: 0;' : `width: calc(${f.width}% - 8px); max-width: calc(${f.width}% - 8px);`)
          : (isDirect && f.type === 'textarea' ? 'width: 100%; max-width: 100%; margin-right: 0;' : '');
        const widthAttr = (isDirect && f.width) ? ` data-width="${f.width}"` : '';
        const slotClass = `${isDirect ? 'sd-live-slot-field sd-live-slot-direct' : 'sd-live-slot-field sd-live-slot-inline'} ${isBold ? 'is-bold' : ''}`;
        return `<span class="${slotClass}" data-field-key="${f.key}"${widthAttr} style="${widthStyle}"></span>`;
      }
      return match;
    });

    // Support any field pills already in the stored HTML
    html = html.replace(/<span[^>]*class="[^"]*sd-doc-field-pill[^"]*"[^>]*data-field-key="([^"]+)"[^>]*>.*?<\/span>/gi, (match, key) => {
      const cleanKey = key.replace(/[*:\s]+$/, '').trim();
      const f = fieldsMap.get(key.toLowerCase()) ||
                fieldsMap.get(cleanKey.toLowerCase()) ||
                fieldsMap.get(cleanKey.replace(/\s+/g, ' ').toLowerCase()) ||
                fieldsMap.get(cleanKey.replace(/\s+/g, '_').toLowerCase()) ||
                fieldsMap.get(cleanKey.replace(/\W+/g, '-').toLowerCase());

      if (f) {
        placed.add(f.key);
        const isBold = isFieldBold(f);
        const isDirect = f && (f.mode === 'input' || (f.mode !== 'placeholder' && (f.width || f.type === 'textarea')));
        const widthStyle = (isDirect && f?.width)
          ? (f.width === 100 ? 'width: 100%; max-width: 100%; margin-right: 0;' : `width: calc(${f.width}% - 8px); max-width: calc(${f.width}% - 8px);`)
          : (isDirect && f?.type === 'textarea' ? 'width: 100%; max-width: 100%; margin-right: 0;' : '');
        const widthAttr = (isDirect && f?.width) ? ` data-width="${f.width}"` : '';
        const slotClass = `${isDirect ? 'sd-live-slot-field sd-live-slot-direct' : 'sd-live-slot-field sd-live-slot-inline'} ${isBold ? 'is-bold' : ''}`;
        return `<span class="${slotClass}" data-field-key="${f.key}"${widthAttr} style="${widthStyle}"></span>`;
      }
      return `<span class="sd-live-slot-field sd-live-slot-inline" data-field-key="${key}"></span>`;
    });

    // Normalize non-breaking spaces (&nbsp;) or missing whitespace between adjacent live field slots to a single breakable space
    html = html.replace(/(<\/span>)(?:&nbsp;|\u00A0|\s)*(<span class="sd-live-slot-field)/gi, '$1 $2');

    return { processedHtml: html, placedKeys: placed, hasDocxHtml: true };
  }, [activeDocTemplate, template, submission, currentUser, fieldsMap, isResubmit, isFieldBold]);

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
    let deptIndex = 0;
    sigNodes.forEach((node, idx) => {
      const slot = decodeSlotName(node.getAttribute('data-sig-slot') || 'Submitter') || 'Submitter';
      const isSub = ['submitter', 'applicant', 'originator'].includes(slot.toLowerCase());
      const currentDeptIndex = isSub ? -1 : deptIndex++;
      slots.push({ id: `sig-portal-${slot}-${idx}`, type: 'sig', slot, deptIndex: currentDeptIndex, node });
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
    return mountedSlots.some(s => s.type === 'sig' && ['submitter', 'applicant', 'originator'].includes(decodeSlotName(s.slot).toLowerCase()));
  }, [mountedSlots]);

  // Any workflow approval steps that do not have an explicit signature slot placed in the document HTML
  const unplacedWorkflowSteps = useMemo(() => {
    const activeWf = submission?.workflow?.length ? submission.workflow : (template?.workflow || []);
    if (!activeWf.length) return [];
    const placedDeptSlots = mountedSlots
      .filter(s => s.type === 'sig' && !['submitter', 'applicant', 'originator'].includes(decodeSlotName(s.slot).toLowerCase()))
      .map(s => decodeSlotName(s.slot).toLowerCase());
    return activeWf.filter((st, idx) => {
      const deptLower = decodeSlotName(st.department || '').toLowerCase();
      if (!deptLower) return false;
      const matchedByName = placedDeptSlots.some(ps => ps === deptLower || ps.includes(deptLower) || deptLower.includes(ps));
      if (matchedByName) return false;
      if (idx < placedDeptSlots.length) return false;
      return true;
    });
  }, [submission, template, mountedSlots]);

  // Submission handler
  const handleSubmit = async (e) => {
    e?.preventDefault();
    setTouched(true);

    if (!hasWorkflow) {
      addToast('Cannot Submit', 'This form cannot be submitted because no approval workflow or approvers have been configured.', 'warn');
      return;
    }

    if (allMissingItems.length > 0) {
      setShowMissingPromptModal(true);
      const firstMissing = allMissingItems[0];
      if (firstMissing && firstMissing.tabId !== activeDocTabId) {
        setActiveDocTabId(firstMissing.tabId);
      }
      const missingLabels = allMissingItems.map(item => item.label);
      addToast(
        'Missing Required Fields',
        `Please complete all mandatory fields across the form package (${missingLabels.slice(0, 3).join(', ')}${missingLabels.length > 3 ? '...' : ''}).`,
        'warn'
      );
      if (firstMissing && firstMissing.tabId === activeDocTabId) {
        const firstKey = firstMissing.key;
        const targetEl = document.getElementById(`live-placeholder-${firstKey.replace(/\W+/g, '-').toLowerCase()}`) ||
                         document.getElementById(`live-field-${firstKey.replace(/\W+/g, '-').toLowerCase()}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
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
      const payloadSubformsData = taggedSubforms.length > 0 ? subformsValues : undefined;
      const result = isResubmit
        ? await resubmitForm(submission.id, { formData: mainValues, subformsData: payloadSubformsData, changeSummary, expiryDate })
        : await submitForm({ templateId: template.id, formData: mainValues, subformsData: payloadSubformsData, expiryDate });

      if (result) {
        addToast(
          isResubmit ? 'Form Resubmitted' : 'Form Submitted Successfully',
          taggedSubforms.length > 0
            ? `"${template.title}" + ${taggedSubforms.length} subform(s) routed to the combined approval chain.`
            : `"${template.title}" has been routed to the approval chain.`,
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
    const isInvalid = !isViewOnly && touched && missing.includes(f.key);
    const elemId = `live-field-${f.key.replace(/\W+/g, '-').toLowerCase()}`;
    const rawVal = values[f.key];
    const val = isPrintingBlank ? '' : (rawVal ?? '');
    const hasVal = String(val).trim().length > 0;
    const isBold = isFieldBold(f);
    const isActive = !isPrinting && (isViewOnly ? highlightedFieldKey === f.key : activeRailField === f.key);
    const isReadOnlyMode = isViewOnly || isPrinting || isPrintingBlank;

    const commonProps = {
      id: elemId,
      'data-field-key': f.key,
      className: `sd-doc-live-input ${isInvalid ? 'is-invalid' : ''} ${isBold ? 'is-bold' : ''} ${isActive ? 'is-active-target' : ''}`,
      style: isBold ? { fontWeight: '700' } : undefined,
      value: isPrintingBlank ? '' : (hasVal ? (values[f.key] ?? '') : ''),
      disabled: isViewOnly,
      readOnly: isViewOnly,
      onChange: (e) => !isViewOnly && setValues(prev => ({ ...prev, [f.key]: e.target.value })),
      onFocus: () => !isViewOnly && handleFocusField(f.key),
      placeholder: isReadOnlyMode ? '' : (f.placeholder || (f.label ? `Enter ${f.label}…` : ''))
    };

    if (f.type === 'textarea') {
      return (
        <>
          <textarea rows={3} {...commonProps} className={`sd-doc-live-input sd-doc-live-textarea ${isInvalid ? 'is-invalid' : ''} ${isBold ? 'is-bold' : ''} ${isActive ? 'is-active-target' : ''}`} />
          <div className="sd-print-value sd-print-value-textarea">
            <div className="sd-print-text-block">{hasVal ? val : ''}</div>
          </div>
        </>
      );
    }
    if (f.type === 'date') {
      const inputType = isReadOnlyMode ? 'text' : 'date';
      const formattedDateVal = hasVal ? (formatDate(val) || val) : '';
      return (
        <>
          <input
            type={inputType}
            {...commonProps}
            placeholder={isReadOnlyMode ? '' : (f.placeholder || 'YYYY-MM-DD')}
            value={isPrintingBlank ? '' : (isReadOnlyMode ? formattedDateVal : (val ?? ''))}
          />
          <div className="sd-print-value sd-print-value-input">
            <span className="sd-print-text">{hasVal ? (formatDate(val) || val) : ''}</span>
          </div>
        </>
      );
    }
    if (f.type === 'number') {
      return (
        <>
          <input
            type={isReadOnlyMode && !hasVal ? 'text' : 'number'}
            step={isReadOnlyMode && !hasVal ? undefined : 'any'}
            {...commonProps}
          />
          <div className="sd-print-value sd-print-value-input">
            <span className="sd-print-text">{hasVal ? val : ''}</span>
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
          <select {...commonProps} value={isPrintingBlank ? '' : (values[f.key] ?? '')}>
            <option value="">{isReadOnlyMode ? '' : `-- Select ${f.label || 'option'} --`}</option>
            {opts.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
          <div className="sd-print-value sd-print-value-select">
            <span className="sd-print-text">{hasVal ? val : ''}</span>
          </div>
        </>
      );
    }
    if (f.type === 'checkbox') {
      const isChecked = !isPrintingBlank && isCheckboxChecked(values[f.key]);
      return (
        <>
          <label className={`sd-doc-live-checkbox ${isChecked ? 'is-checked' : 'is-unchecked'}`}>
            <input
              id={elemId}
              type="checkbox"
              checked={isChecked}
              disabled={isViewOnly}
              onFocus={() => !isViewOnly && handleFocusField(f.key)}
              onChange={(e) => !isViewOnly && setValues(prev => ({ ...prev, [f.key]: e.target.checked ? 'Yes' : '' }))}
            />
            <span className="sd-doc-checkbox-text">{f.placeholder || f.label || 'I Confirm & Agree'}</span>
            <span className={`sd-doc-checkbox-status-pill sd-print-hide ${isChecked ? 'is-checked' : 'is-unchecked'}`}>
              {isChecked ? '✓ Checked' : 'Unchecked'}
            </span>
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
          <span className="sd-print-text">{hasVal ? val : ''}</span>
        </div>
      </>
    );
  };

  // Render interactive in-text placeholder field
  const renderPlaceholderInput = (f, key) => {
    const rawVal = values[f.key];
    const val = isPrintingBlank ? '' : (rawVal ?? '');
    const hasVal = String(val).trim().length > 0;
    const isInvalid = !isViewOnly && touched && f.required && !hasVal;
    const elemId = `live-placeholder-${f.key.replace(/\W+/g, '-').toLowerCase()}`;
    const isBold = isFieldBold(f);
    const isDashMode = isViewOnly || isPrinting || isPrintingBlank;

    return (
      <span className={`sd-doc-live-placeholder-wrapper ${isBold ? 'is-bold' : ''}`}>
        <span
          role="button"
          tabIndex={isViewOnly && !onFieldClickInViewOnly ? -1 : 0}
          id={elemId}
          className={`sd-doc-live-placeholder ${hasVal ? 'is-filled' : 'is-empty'} ${isInvalid ? 'is-invalid' : ''} ${f.required ? 'is-required' : ''} ${!isPrinting && (isViewOnly ? highlightedFieldKey === f.key : activeRailField === f.key) ? 'is-active-target' : ''} ${isBold ? 'is-bold' : ''}`}
          style={isBold ? { fontWeight: '700' } : undefined}
          onClick={(e) => {
            if (isViewOnly) {
              if (onFieldClickInViewOnly) {
                e.preventDefault();
                e.stopPropagation();
                onFieldClickInViewOnly(f);
              }
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            handleFocusField(f.key);
          }}
          onKeyDown={(e) => {
            if (isViewOnly) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleFocusField(f.key);
            }
          }}
          onDoubleClick={(e) => {
            if (isViewOnly) return;
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
          ) : isDashMode ? (
            <span className={`sd-ph-empty-print-dash ${isBold ? 'is-bold' : ''}`} style={{ display: 'inline', ...(isBold ? { fontWeight: '700' } : {}) }}>—</span>
          ) : (
            <>
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
              <span className={`sd-ph-empty-print-dash ${isBold ? 'is-bold' : ''}`} style={isBold ? { fontWeight: '700' } : undefined}>—</span>
            </>
          )}
        </span>

        {/* Clean text printed when document is filled */}
        <span className="sd-print-value sd-print-placeholder-filled">
          {hasVal ? val : '—'}
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

      case 'checkbox': {
        const isChecked = isCheckboxChecked(val);
        return (
          <label
            className={`sd-rail-checkbox-label ${isChecked ? 'is-checked' : 'is-unchecked'}`}
            onFocus={() => handleRailInputFocus(f.key)}
          >
            <input
              type="checkbox"
              id={inputId}
              checked={isChecked}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.checked ? 'Yes' : '' }))}
            />
            <span className="sd-rail-checkbox-text">
              {isChecked ? '✓ Confirmed (Checked)' : 'Unchecked — Click to Confirm'}
            </span>
          </label>
        );
      }

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
    const isDirectInput = f.mode === 'input' || (f.mode !== 'placeholder' && (f.width || f.type === 'textarea'));
    if (!isDirectInput) {
      return renderPlaceholderInput(f, key);
    }

    const isBlock = f.type === 'textarea' || f.width === 100;
    const sanitizedKey = String(f.key).replace(/\W+/g, '-').toLowerCase();
    const isActive = !isPrinting && (isViewOnly ? highlightedFieldKey === f.key : activeRailField === f.key);

    return (
      <span
        id={`live-wrap-${sanitizedKey}`}
        data-field-key={f.key}
        className={`sd-doc-live-field-wrap ${isBlock ? 'is-block' : ''} ${isActive ? 'is-active-target' : ''} ${isViewOnly && submission ? 'is-locked-field' : ''}`}
        style={isViewOnly && onFieldClickInViewOnly ? { cursor: 'pointer' } : undefined}
        onClick={() => {
          if (isViewOnly) {
            onFieldClickInViewOnly?.(f);
            return;
          }
          handleFocusField(f.key);
        }}
      >
        <span className="sd-doc-live-field-label" title={f.label || f.key}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label || f.key}</span>
          {f.required && <span className="sd-required"> *</span>}
          {isViewOnly && submission && (
            <Lock
              size={10}
              className="sd-print-hide"
              style={{ marginLeft: '5px', opacity: 0.65, flexShrink: 0 }}
              title="Field locked"
            />
          )}
        </span>
        {f.description && (
          <span className="sd-doc-live-field-desc" title={f.description}>
            <Info size={11} className="sd-desc-icon-inline" />
            <span className="sd-doc-live-field-desc-text">{f.description}</span>
          </span>
        )}
        {renderInputControl(f, key)}
      </span>
    );
  };

  // Render on-form signature slot: strictly show only signature, name and department
  const renderSignatureSlot = (rawSlot, deptIndex = -1) => {
    const slot = decodeSlotName(rawSlot || 'Submitter') || 'Submitter';
    const slotLower = slot.toLowerCase();
    const isSubmitter = ['submitter', 'applicant', 'originator'].includes(slotLower);

    if (isSubmitter) {
      const submitterSigImg = submission?.signature ||
        submission?.submitterSignature?.signatureImage ||
        submission?.signatureImage ||
        (submission?.submittedById ? (users || []).find(u => u.id === submission.submittedById)?.signatureImage : null) ||
        (isViewOnly ? null : currentUser?.signatureImage);
      const submitterName = submission?.submittedByName || currentUser?.name || 'Submitter';
      const submitterDept = submission?.department ||
        submission?.submittedByDepartment ||
        currentUser?.department ||
        template?.department ||
        '';
      const isSigned = isViewOnly ? !!(submitterSigImg || submission?.submittedByName) : (hasSignature && !isPrintingBlank);

      if (isSigned) {
        return (
          <div className="sd-doc-signature-block">
            {submitterSigImg ? (
              <img
                src={submitterSigImg}
                alt={`${submitterName}'s signature`}
                className="sd-doc-signature-img"
              />
            ) : (
              <div className="sd-doc-signature-placeholder-ink">{submitterName}</div>
            )}
            <div className="sd-doc-signature-name">{submitterName}</div>
            {submitterDept && (
              <div className="sd-doc-signature-dept">{submitterDept}</div>
            )}
          </div>
        );
      }

      if (isViewOnly) {
        return (
          <div className="sd-doc-signature-block is-department is-pending">
            <div className="sd-doc-signature-pending-notice sd-print-hide">
              <PenLine size={12} /> Applicant / Submitter Signature (Signed on Submission)
            </div>
            <div className="sd-print-blank-sig-block">
              <span className="sd-print-line" />
              <div className="sd-doc-signature-name">{submission ? submitterName : 'Applicant / Submitter'}</div>
              {submitterDept && <div className="sd-doc-signature-dept">{submitterDept}</div>}
            </div>
          </div>
        );
      }

      return (
        <div className="sd-doc-signature-block is-unsigned">
          <button
            id="btn-draw-save-signature"
            type="button"
            className="sd-doc-live-sig-draw-btn sd-print-hide"
            onClick={openSignatureModal}
          >
            <PenLine size={14} /> Draw &amp; Save Signature
          </button>
          <div className="sd-print-blank-sig-block">
            <span className="sd-print-line" />
            <div className="sd-doc-signature-name">{submitterName}</div>
            {submitterDept && <div className="sd-doc-signature-dept">{submitterDept}</div>}
          </div>
        </div>
      );
    }

    const wfList = submission?.workflow || [];
    let matchingStep = wfList.find(st => {
      const deptClean = decodeSlotName(st?.department || '').toLowerCase();
      if (!deptClean) return false;
      return deptClean === slotLower || slotLower.includes(deptClean) || deptClean.includes(slotLower);
    });

    if (!matchingStep && deptIndex >= 0 && wfList[deptIndex]) {
      matchingStep = wfList[deptIndex];
    } else if (!matchingStep && wfList.length === 1) {
      matchingStep = wfList[0];
    }

    const isStepApproved = matchingStep?.status === 'APPROVED';

    if (matchingStep && isStepApproved) {
      const approverSig =
        matchingStep.signature ||
        matchingStep.signatureImage ||
        (matchingStep.actedById && submission?.submittedById === matchingStep.actedById ? submission?.signature : null) ||
        (matchingStep.actedById ? (users || []).find(u => u.id === matchingStep.actedById)?.signatureImage : null) ||
        (currentUser && (matchingStep.actedById === currentUser.id || matchingStep.actedByName === currentUser.name) ? currentUser.signatureImage : null);
      const approverName = matchingStep.actedByName || `${slot} Approver`;
      const approverDept = decodeSlotName(matchingStep.department || slot);

      return (
        <div className="sd-doc-signature-block is-department is-approved">
          {approverSig ? (
            <img
              src={approverSig}
              alt={`${approverName}'s signature`}
              className="sd-doc-signature-img"
            />
          ) : (
            <div className="sd-doc-signature-placeholder-ink">{approverName}</div>
          )}
          <div className="sd-doc-signature-name">{approverName}</div>
          <div className="sd-doc-signature-dept">
            {approverDept}
            <span style={{ color: '#059669', fontWeight: 600, marginLeft: '6px' }}>
              · ✓ Approved{matchingStep.actedAt ? ` (${formatDate(matchingStep.actedAt)})` : ''}
            </span>
          </div>
        </div>
      );
    }

    if (matchingStep && matchingStep.status === 'REJECTED') {
      const rejectorName = matchingStep.actedByName || `${slot} Reviewer`;
      const rejectorDept = decodeSlotName(matchingStep.department || slot);
      return (
        <div className="sd-doc-signature-block is-department is-pending">
          <div className="sd-doc-signature-pending-notice sd-print-hide" style={{ color: '#dc2626' }}>
            <X size={12} /> Rejected by {rejectorName} ({rejectorDept})
          </div>
          <div className="sd-print-blank-sig-block">
            <span className="sd-print-line" />
            <div className="sd-doc-signature-name">{rejectorName}</div>
            <div className="sd-doc-signature-dept">{rejectorDept} · Rejected</div>
          </div>
        </div>
      );
    }

    if (matchingStep && matchingStep.status === 'OBJECTION') {
      const reviewerName = matchingStep.actedByName || `${slot} Reviewer`;
      const reviewerDept = decodeSlotName(matchingStep.department || slot);
      return (
        <div className="sd-doc-signature-block is-department is-pending">
          <div className="sd-doc-signature-pending-notice sd-print-hide" style={{ color: '#d97706' }}>
            <AlertTriangle size={12} /> Changes Requested by {reviewerName} ({reviewerDept})
          </div>
          <div className="sd-print-blank-sig-block">
            <span className="sd-print-line" />
            <div className="sd-doc-signature-name">{reviewerName}</div>
            <div className="sd-doc-signature-dept">{reviewerDept} · Changes Requested</div>
          </div>
        </div>
      );
    }

    const displaySlot = decodeSlotName(matchingStep?.department || slot);
    return (
      <div className="sd-doc-signature-block is-department is-pending">
        <div className="sd-doc-signature-pending-notice sd-print-hide">
          <Clock size={12} /> Pending {displaySlot} Department Approval
        </div>
        <div className="sd-print-blank-sig-block">
          <span className="sd-print-line" />
          <div className="sd-doc-signature-name">{displaySlot} Approver</div>
          <div className="sd-doc-signature-dept">{displaySlot}</div>
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
              <span className="sd-badge sd-badge-gray">v{isResubmit ? bumpPreview(submission.version) : (submission?.version || template.version || '1.0')}</span>
              {taggedSubforms.length > 0 && (
                <span
                  className="sd-badge"
                  style={{
                    background: 'color-mix(in srgb, var(--primary-500) 14%, transparent)',
                    color: 'var(--primary-500)',
                    border: '1px solid color-mix(in srgb, var(--primary-500) 35%, transparent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Layers size={11} /> +{taggedSubforms.length} Subform{taggedSubforms.length > 1 ? 's' : ''}
                </span>
              )}
              {parentMainForm && (
                <span
                  className="sd-badge sd-badge-gray"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  title={`Linked subform of "${parentMainForm.title}" — governed by Main Form approval chain`}
                >
                  <Link2 size={11} /> Subform of {parentMainForm.title}
                </span>
              )}
              {headerBadgesOverride}
            </div>
            <div className="sd-form-filler-meta">
              {headerMetaOverride || (
                <>
                  <span>{template.code || template.fileName || 'Form Document'}</span>
                  <span>·</span>
                  <span>
                    {isViewOnly
                      ? 'Read-only form preview'
                      : taggedSubforms.length > 0
                      ? `Fill Main Form & ${taggedSubforms.length} tagged subform(s), sign once, and submit as one combined package`
                      : 'Fill out fields directly on the form and submit'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="sd-form-filler-header-right">
          {!isViewOnly && (
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
          )}

          {/* Print & Download Actions */}
          <div className="sd-print-actions">
            <button
              id="btn-print-form"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handlePrint(false)}
              title="Print form exactly as displayed with current filled values and digital signature (Ctrl+P)"
            >
              <Printer size={14} />
              <span>Print Form</span>
            </button>
            <button
              id="btn-download-live-form-pdf"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              title="Download high-resolution PDF of this form with all filled values and signatures"
            >
              {downloadingPdf ? <Loader2 size={14} className="sd-spin" /> : <Download size={14} />}
              <span>{downloadingPdf ? 'Exporting…' : 'Download PDF'}</span>
            </button>
            {!isViewOnly && (
              <button
                id="btn-print-blank-form"
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handlePrint(true)}
                title="Print a clean, blank copy of this form for physical pen-and-paper filling"
              >
                <FileDown size={14} />
                <span>Print Blank</span>
              </button>
            )}
          </div>

          {extraHeaderActions}

          {isViewOnly ? (
            <button
              id="btn-close-view-form"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
            >
              Close
            </button>
          ) : (
            <>
              <button
                id="btn-toggle-form-guide"
                type="button"
                className={`btn btn-sm ${showFormGuide ? 'btn-primary' : 'btn-secondary'}`}
                onClick={toggleFormGuide}
                title={showFormGuide ? 'Hide step-by-step form completion guide' : 'Show step-by-step form completion guide'}
              >
                <Compass size={14} />
                <span>Guide Me</span>
              </button>

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
            </>
          )}
        </div>
      </header>

      {/* Workspace Area: Document Canvas on Left/Center, Interactive Form Rail on Right */}
      <div className={`sd-form-filler-workspace ${isViewOnly && !customRightRail ? 'is-view-only' : ''}`} ref={workspaceRef}>
        {/* Main Canvas Scroll Area */}
        <main className={`sd-form-filler-desk ${isViewOnly && !customRightRail ? 'is-view-only' : ''}`} ref={deskRef}>
        {topBanner && <div className="sd-print-hide" style={{ width: '820px', maxWidth: '100%', marginBottom: '16px' }}>{topBanner}</div>}

        {/* Interactive Step-by-Step Guided Form Copilot */}
        {!isViewOnly && showFormGuide && currentWizardStep && (
          <div className="sd-guided-copilot-card sd-print-hide animate-fade-in">
            {/* Top Progress & Segmented Step Track */}
            <div className="sd-copilot-top">
              <div className="sd-copilot-brand">
                <span className="sd-copilot-icon-orb">
                  <Sparkles size={14} />
                </span>
                <span className="sd-copilot-title">Guided Form Copilot</span>
                <span className="sd-copilot-step-pill">
                  Step {safeWizardIdx + 1} of {wizardSteps.length}
                </span>
                <span className={`sd-copilot-pct-pill ${wizardProgressPct === 100 ? 'is-complete' : ''}`}>
                  {wizardProgressPct}% Complete
                </span>
              </div>

              {/* Segmented Clickable Progress Dots */}
              <div className="sd-copilot-segments" role="tablist" aria-label="Form completion steps">
                {wizardSteps.map((st, idx) => {
                  const isCurr = idx === safeWizardIdx;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className={`sd-copilot-seg ${isCurr ? 'is-current' : ''} ${st.isDone ? 'is-done' : st.required ? 'is-req' : ''}`}
                      onClick={() => goToWizardStep(idx)}
                      title={`Step ${idx + 1}: ${st.label}${st.isDone ? ' (Completed)' : st.required ? ' (Required)' : ' (Optional)'}`}
                    />
                  );
                })}
              </div>

              <div className="sd-copilot-top-actions">
                {allMissingItems.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={handleJumpToNextUnfilled}
                    title="Jump to the next unfilled mandatory field"
                  >
                    <span>Next Required ({allMissingItems.length})</span>
                    <ArrowRight size={11} />
                  </button>
                )}
                <button
                  type="button"
                  className="sd-icon-btn sd-form-guide-close"
                  onClick={toggleFormGuide}
                  title="Hide Guided Copilot"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Active Step Stage */}
            <div className="sd-copilot-stage">
              {currentWizardStep.type === 'field' && (() => {
                const f = currentWizardStep.field;
                const val = getWizardFieldValue(currentWizardStep);
                const opts = Array.isArray(f.options)
                  ? f.options
                  : (typeof f.options === 'string' ? f.options.split(',').map(s => s.trim()).filter(Boolean) : []);

                return (
                  <>
                    <div className="sd-copilot-stage-main">
                      <div className="sd-copilot-meta-row">
                        <span className="sd-copilot-sheet-tag">
                          {currentWizardStep.tabTitle} · Field {currentWizardStep.fieldIndex}/{currentWizardStep.totalTabFields}
                        </span>
                        {f.required ? (
                          <span className="sd-badge sd-badge-red sd-badge-xs">* Required</span>
                        ) : (
                          <span className="sd-badge sd-badge-gray sd-badge-xs">Optional</span>
                        )}
                        {currentWizardStep.isDone && (
                          <span className="sd-badge sd-badge-green sd-badge-xs">
                            <Check size={10} /> Filled
                          </span>
                        )}
                      </div>

                      <div className="sd-copilot-prompt">
                        {f.label || f.key}
                      </div>

                      {(f.description || f.placeholder) && (
                        <div className="sd-copilot-hint">
                          <Info size={12} />
                          <span>{f.description || f.placeholder}</span>
                        </div>
                      )}

                      {/* Live Interactive Input inside the Guided Copilot */}
                      <div className="sd-copilot-input-row">
                        {f.type === 'select' || f.type === 'dropdown' ? (
                          <select
                            className="sd-input sd-copilot-input"
                            value={val}
                            onChange={(e) => {
                              setWizardFieldValue(currentWizardStep, e.target.value);
                              if (e.target.value && safeWizardIdx < wizardSteps.length - 1) {
                                setTimeout(() => goToWizardStep(safeWizardIdx + 1), 180);
                              }
                            }}
                          >
                            <option value="">-- Select {f.label || f.key} --</option>
                            {opts.map((opt, i) => (
                              <option key={i} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : f.type === 'checkbox' ? (
                          <label className="sd-copilot-checkbox">
                            <input
                              type="checkbox"
                              checked={isCheckboxChecked(val)}
                              onChange={(e) => {
                                setWizardFieldValue(currentWizardStep, e.target.checked ? 'Yes' : '');
                              }}
                            />
                            <span>{f.placeholder || f.label || 'Yes, I confirm and agree'}</span>
                          </label>
                        ) : f.type === 'date' ? (
                          <div className="sd-copilot-date-row">
                            <input
                              type="date"
                              className="sd-input sd-copilot-input"
                              value={val}
                              onChange={(e) => setWizardFieldValue(currentWizardStep, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  goToWizardStep(safeWizardIdx + 1);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => setWizardFieldValue(currentWizardStep, new Date().toISOString().slice(0, 10))}
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => setWizardFieldValue(currentWizardStep, addDays(7))}
                            >
                              +7d
                            </button>
                          </div>
                        ) : f.type === 'textarea' ? (
                          <textarea
                            rows={2}
                            className="sd-input sd-copilot-input"
                            placeholder={f.placeholder || `Type ${f.label || f.key} here…`}
                            value={val}
                            onChange={(e) => setWizardFieldValue(currentWizardStep, e.target.value)}
                          />
                        ) : (
                          <input
                            type={f.type === 'number' ? 'number' : 'text'}
                            step={f.type === 'number' ? 'any' : undefined}
                            className="sd-input sd-copilot-input"
                            placeholder={f.placeholder || `Type ${f.label || f.key} and press Enter…`}
                            value={val}
                            onChange={(e) => setWizardFieldValue(currentWizardStep, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                goToWizardStep(safeWizardIdx + 1);
                              }
                            }}
                          />
                        )}
                      </div>
                    </div>

                    <div className="sd-copilot-nav">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={safeWizardIdx === 0}
                        onClick={() => goToWizardStep(safeWizardIdx - 1)}
                      >
                        <ArrowLeft size={13} /> Prev
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => goToWizardStep(safeWizardIdx + 1)}
                      >
                        <span>{safeWizardIdx + 1 < wizardSteps.length ? 'Next Step' : 'Finish'}</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </>
                );
              })()}

              {currentWizardStep.type === 'signature' && (
                <>
                  <div className="sd-copilot-stage-main">
                    <div className="sd-copilot-meta-row">
                      <span className="sd-copilot-sheet-tag">Cryptographic Authentication</span>
                      <span className={`sd-badge ${hasSignature ? 'sd-badge-green' : 'sd-badge-amber'} sd-badge-xs`}>
                        {hasSignature ? '✓ PKI Signature Ready' : '* Signature Required'}
                      </span>
                    </div>
                    <div className="sd-copilot-prompt">
                      Attach Your Digital Signature &amp; PKI Seal
                    </div>
                    <div className="sd-copilot-hint">
                      <ShieldCheck size={13} />
                      <span>
                        {hasSignature
                          ? `Signed as ${currentUser?.name} (${currentUser?.department}) with RSA-2048 non-repudiation.`
                          : 'Draw or upload your signature once — it will automatically appear in the signature block below.'}
                      </span>
                    </div>
                    <div className="sd-btn-row" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className={`btn btn-xs ${hasSignature ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={openSignatureModal}
                      >
                        <PenLine size={12} />
                        <span>{hasSignature ? 'Change / Redraw Signature' : 'Draw & Save Signature Now'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="sd-copilot-nav">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => goToWizardStep(safeWizardIdx - 1)}
                    >
                      <ArrowLeft size={13} /> Prev
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => goToWizardStep(safeWizardIdx + 1)}
                    >
                      <span>Review &amp; Submit</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </>
              )}

              {currentWizardStep.type === 'submit' && (
                <>
                  <div className="sd-copilot-stage-main">
                    <div className="sd-copilot-meta-row">
                      <span className="sd-copilot-sheet-tag">Final Step · Package Readiness</span>
                      {allMissingItems.length === 0 && hasSignature ? (
                        <span className="sd-badge sd-badge-green sd-badge-xs">✓ Ready to Submit</span>
                      ) : (
                        <span className="sd-badge sd-badge-amber sd-badge-xs">
                          {allMissingItems.length} Required Field{allMissingItems.length === 1 ? '' : 's'} Remaining
                        </span>
                      )}
                    </div>
                    <div className="sd-copilot-prompt">
                      {allMissingItems.length === 0 && hasSignature
                        ? `Everything is complete! Ready to route "${template.title}" for approval.`
                        : 'Almost there — complete the remaining items below before submitting:'}
                    </div>
                    <div className="sd-copilot-checklist">
                      <span className={`sd-copilot-check-pill ${allMissingItems.length === 0 ? 'is-ok' : 'is-warn'}`}>
                        {allMissingItems.length === 0 ? <Check size={12} /> : <AlertTriangle size={12} />}
                        {allMissingItems.length === 0
                          ? `All mandatory fields filled (${completedCount}/${fields.length})`
                          : `${allMissingItems.length} mandatory field(s) missing`}
                      </span>
                      <span className={`sd-copilot-check-pill ${hasSignature ? 'is-ok' : 'is-warn'}`}>
                        {hasSignature ? <Check size={12} /> : <AlertTriangle size={12} />}
                        {hasSignature ? 'PKI Signature Sealed' : 'Signature missing'}
                      </span>
                      <span className="sd-copilot-check-pill is-ok">
                        <Calendar size={12} />
                        Deadline: {formatDate(expiryDate)}
                      </span>
                    </div>
                  </div>

                  <div className="sd-copilot-nav">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => goToWizardStep(safeWizardIdx - 1)}
                    >
                      <ArrowLeft size={13} /> Prev
                    </button>
                    {allMissingItems.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleJumpToNextUnfilled}
                      >
                        <span>Fix Missing Field</span>
                        <ArrowRight size={13} />
                      </button>
                    ) : !hasSignature ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={openSignatureModal}
                      >
                        <PenLine size={13} />
                        <span>Add Signature</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={saving || !hasWorkflow}
                        onClick={handleSubmit}
                      >
                        <Send size={13} />
                        <span>{saving ? 'Submitting…' : isResubmit ? 'Resubmit Now' : 'Sign & Submit Now'}</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
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

        {/* Multi-Tab Document Switcher Bar (Main Form + Tagged Subforms) */}
        {taggedSubforms.length > 0 && (
          <div
            className="sd-print-hide"
            style={{
              width: '820px',
              maxWidth: '100%',
              marginBottom: '14px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Layers size={14} />
                <span>Combined Form Package ({1 + taggedSubforms.length} Documents — Shared Approval &amp; Single Sign-Off)</span>
              </div>
              {!isViewOnly && allMissingItems.length > 0 && (
                <span style={{ fontSize: '0.73rem', color: 'var(--warn-500)', fontWeight: 600 }}>
                  {allMissingItems.length} required field{allMissingItems.length > 1 ? 's' : ''} remaining across package
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {(() => {
                const isMainActive = activeDocTabId === 'MAIN';
                const mainFilledCount = mainFields.filter(f => isFieldFilled(f, mainValues[f.key])).length;
                const mainMissingReqCount = mainFields.filter(f => f.required && !isFieldFilled(f, mainValues[f.key])).length;
                return (
                  <button
                    type="button"
                    onClick={() => setActiveDocTabId('MAIN')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '6px 12px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: isMainActive ? 700 : 600,
                      cursor: 'pointer',
                      border: isMainActive ? '1px solid var(--primary-500)' : '1px solid var(--border-subtle)',
                      background: isMainActive
                        ? 'color-mix(in srgb, var(--primary-500) 15%, var(--bg-surface))'
                        : 'var(--bg-surface)',
                      color: isMainActive ? 'var(--primary-500)' : 'var(--text-main)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileText size={13} />
                    <span>Main Form: {template.title}</span>
                    <span
                      className="sd-badge sd-badge-xs"
                      style={{
                        background: mainMissingReqCount === 0
                          ? 'rgba(16, 185, 129, 0.16)'
                          : touched
                          ? 'rgba(239, 68, 68, 0.18)'
                          : 'var(--bg-elevated)',
                        color: mainMissingReqCount === 0
                          ? '#10b981'
                          : touched
                          ? '#ef4444'
                          : 'var(--text-muted)'
                      }}
                    >
                      {mainFilledCount}/{mainFields.length}
                    </span>
                  </button>
                );
              })()}

              {taggedSubforms.map((sf, idx) => {
                const isTabActive = activeDocTabId === sf.id;
                const sfFileType = (sf.fileType || 'docx').toLowerCase();
                const isStaticSubform = sfFileType === 'pdf' || sfFileType === 'image';
                const sfFields = sf.fields || [];
                const sfVals = subformsValues[sf.id] || {};
                const sfFilledCount = sfFields.filter(f => isFieldFilled(f, sfVals[f.key])).length;
                const sfMissingReqCount = sfFields.filter(f => f.required && !isFieldFilled(f, sfVals[f.key])).length;
                return (
                  <button
                    key={sf.id}
                    type="button"
                    onClick={() => setActiveDocTabId(sf.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '6px 12px',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: isTabActive ? 700 : 600,
                      cursor: 'pointer',
                      border: isTabActive ? '1px solid var(--primary-500)' : '1px solid var(--border-subtle)',
                      background: isTabActive
                        ? 'color-mix(in srgb, var(--primary-500) 15%, var(--bg-surface))'
                        : 'var(--bg-surface)',
                      color: isTabActive ? 'var(--primary-500)' : 'var(--text-main)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {sfFileType === 'image' ? <ImageIcon size={13} /> : <Layers size={13} />}
                    <span>Subform {idx + 1}: {sf.title}</span>
                    {isStaticSubform ? (
                      <span className="sd-badge sd-badge-gray sd-badge-xs">
                        {sfFileType.toUpperCase()}
                      </span>
                    ) : (
                      <span
                        className="sd-badge sd-badge-xs"
                        style={{
                          background: sfMissingReqCount === 0
                            ? 'rgba(16, 185, 129, 0.16)'
                            : touched
                            ? 'rgba(239, 68, 68, 0.18)'
                            : 'var(--bg-elevated)',
                          color: sfMissingReqCount === 0
                            ? '#10b981'
                            : touched
                            ? '#ef4444'
                            : 'var(--text-muted)'
                        }}
                      >
                        {sfFilledCount}/{sfFields.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Authentic A4 Paper Document Sheet */}
        <div
          ref={sheetRef}
          className="sd-form-filler-sheet size-a4 portrait margins-normal"
          style={{
            fontFamily: activeDocTemplate?.fontFamily || template?.fontFamily || undefined,
            fontSize: activeDocTemplate?.fontSize || template?.fontSize || undefined
          }}
        >
          {/* Header Mark */}
          <div className="sd-word-page-header-mark">
            <span>{activeDocTemplate?.department || template.department} — Enterprise {isActiveSubformStatic ? `${activeSubformFileType.toUpperCase()} Subform` : 'Word Form'}</span>
            <span>{activeDocTemplate?.code || template.code || 'CONFIDENTIAL'}</span>
          </div>

          {/* Form Body: Static PDF/Image Subform Viewer, Word Template HTML, or Official Clean Fallback */}
          {isActiveSubformStatic ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '520px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                    {activeDocTemplate?.title}
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Bundled {activeSubformFileType.toUpperCase()} Subform · {activeDocTemplate?.code || activeDocTemplate?.fileName}
                  </span>
                </div>
                {staticSubformBlob && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs sd-print-hide"
                    onClick={() => downloadBlob(staticSubformBlob, activeDocTemplate?.fileName || `${activeDocTemplate?.title}.${activeSubformFileType === 'pdf' ? 'pdf' : 'png'}`)}
                  >
                    <Download size={12} /> Download {activeSubformFileType.toUpperCase()}
                  </button>
                )}
              </div>

              {staticSubformLoading && (
                <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Loader2 size={18} className="sd-spin" /> Loading {activeSubformFileType.toUpperCase()} subform…
                </div>
              )}

              {staticSubformError && (
                <div className="sd-alert sd-alert-error">{staticSubformError}</div>
              )}

              {!staticSubformLoading && !staticSubformError && staticSubformUrl && activeSubformFileType === 'pdf' && (
                <iframe
                  src={staticSubformUrl}
                  title={activeDocTemplate?.title || 'PDF Subform'}
                  style={{ width: '100%', height: '680px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc' }}
                />
              )}

              {!staticSubformLoading && !staticSubformError && staticSubformUrl && activeSubformFileType === 'image' && (
                <div style={{ textAlign: 'center', padding: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                  <img
                    src={staticSubformUrl}
                    alt={activeDocTemplate?.title || 'Image Subform'}
                    style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }}
                  />
                </div>
              )}
            </div>
          ) : hasDocxHtml ? (
            <div
              ref={docBodyRef}
              className="sd-word-editor-body sd-pv-doc"
              style={{
                fontFamily: activeDocTemplate?.fontFamily || template?.fontFamily || undefined,
                fontSize: activeDocTemplate?.fontSize || template?.fontSize || undefined
              }}
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          ) : (
            <div>
              {/* Fallback Official Document Structure */}
              <div className="sd-form-filler-official-header">
                <div>
                  <div className="sd-form-filler-official-brand">{activeDocTemplate?.department || template.department}</div>
                  <h1 className="sd-form-filler-official-title">{activeDocTemplate?.title || template.title}</h1>
                </div>
                <div className="sd-form-filler-official-meta">
                  <div><strong>Form ID:</strong> {submission?.uniqueNumber || `FRM-${new Date().getFullYear()}-XXXX`}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Submitter:</strong> {currentUser.name}</div>
                </div>
              </div>

              {(activeDocTemplate?.description || template.description) && (
                <p className="sd-muted" style={{ marginBottom: '24px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {activeDocTemplate?.description || template.description}
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
              return createPortal(renderSignatureSlot(s.slot, s.deptIndex), s.node);
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

          {/* If the Word document didn't have an explicit submitter or department signature slot, append them at document bottom */}
          {!isActiveSubformStatic && (!hasSubmitterSigSlot || !hasDocxHtml || unplacedWorkflowSteps.length > 0) && (
            <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(!hasSubmitterSigSlot || !hasDocxHtml) && renderSignatureSlot('Submitter')}
              {unplacedWorkflowSteps.map((st, idx) => (
                <div key={`unplaced-sig-${st.department || idx}`}>
                  {renderSignatureSlot(st.department, idx)}
                </div>
              ))}
            </div>
          )}

          {/* Approval Route Summary at Bottom of Document (In-App Only) */}
          {hasWorkflow && (
            <div className="sd-form-filler-workflow-chain sd-print-hide" style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Sequential Department Approval Chain {taggedSubforms.length > 0 ? '(Shared Across Main Form & Tagged Subforms)' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <span
                  className={submission ? 'sd-badge sd-badge-success' : 'sd-badge sd-badge-accent'}
                  style={submission ? { background: 'rgba(16, 185, 129, 0.14)', color: '#059669', borderColor: 'rgba(16, 185, 129, 0.35)' } : undefined}
                >
                  {submission ? <CheckCircle2 size={11} /> : <User size={11} />}
                  {' '}1. {submission ? `${submission.submittedByName || 'Submitter'} (Submitted)` : `You (${currentUser.name})`}
                </span>
                {(submission?.workflow?.length ? submission.workflow : (template.workflow || [])).map((w, idx) => {
                  const stStatus = w.status || 'WAITING';
                  const isApproved = stStatus === 'APPROVED';
                  const isObjection = stStatus === 'OBJECTION';
                  const isRejected = stStatus === 'REJECTED';
                  const isPending = stStatus === 'PENDING' && submission?.status === 'IN_REVIEW';
                  const deptLabel = decodeSlotName(w.department || '');
                  return (
                    <React.Fragment key={idx}>
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>→</span>
                      <span
                        className={`sd-badge ${
                          isApproved ? 'sd-badge-success' :
                          isObjection ? 'sd-badge-warn' :
                          isRejected ? 'sd-badge-danger' :
                          isPending ? 'sd-badge-accent' :
                          'sd-badge-gray'
                        }`}
                        style={
                          isApproved
                            ? { background: 'rgba(16, 185, 129, 0.14)', color: '#059669', borderColor: 'rgba(16, 185, 129, 0.35)' }
                            : isObjection
                            ? { background: 'rgba(245, 158, 11, 0.14)', color: '#d97706', borderColor: 'rgba(245, 158, 11, 0.35)' }
                            : isRejected
                            ? { background: 'rgba(239, 68, 68, 0.14)', color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.35)' }
                            : undefined
                        }
                      >
                        {isApproved ? <CheckCircle2 size={11} /> : <ShieldCheck size={11} />}
                        {' '}{idx + 2}. {deptLabel}
                        {isApproved ? ` ✓${w.actedByName ? ` (${w.actedByName})` : ''}` : isObjection ? ' (Objection)' : isRejected ? ' (Rejected)' : isPending ? ' (Awaiting Decision)' : ''}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Mark (In-App Only) */}
          <div className="sd-word-page-footer-mark sd-print-hide">
            <span>SmartDoc Automated Form Engine</span>
            <span>
              {taggedSubforms.length > 0
                ? (activeDocTabId === 'MAIN'
                    ? `Main Form (1 of ${1 + taggedSubforms.length})`
                    : `Subform ${taggedSubforms.findIndex(sf => sf.id === activeDocTabId) + 1} (${taggedSubforms.findIndex(sf => sf.id === activeDocTabId) + 2} of ${1 + taggedSubforms.length})`)
                : 'Page 1 of 1'}
            </span>
          </div>
        </div>
      </main>

      {/* Right-Side Custom Review Rail (when viewing/reviewing a submission) */}
      {isViewOnly && customRightRail}

      {/* Right-Side Interactive Form Rail (when filling or modifying a form) */}
      {!isViewOnly && fields.length > 0 && (
        <aside className="sd-form-filler-rail sd-print-hide" aria-label="Form Fields Sidebar">
          <div className="sd-rail-header">
            <div className="sd-rail-header-top">
              <div className="sd-rail-title-row">
                <FileEdit size={16} className="sd-rail-icon" />
                <h3 className="sd-rail-title">
                  {taggedSubforms.length > 0
                    ? (activeDocTabId === 'MAIN' ? 'Main Form Fields' : `Subform Fields`)
                    : 'Document Form Fields'}
                </h3>
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
              {taggedSubforms.length > 0
                ? `Active sheet: "${activeDocTemplate?.title || template.title}". Switch tabs above the document to fill all bundled forms.`
                : 'Fill values here or click placeholders in the document sheet. Updates appear live on paper.'}
            </p>
            {missingMandatoryCount > 0 && (
              <div className="sd-rail-mandatory-alert">
                <AlertTriangle size={13} />
                <span>{missingMandatoryCount} mandatory field{missingMandatoryCount > 1 ? 's' : ''} remaining on this sheet</span>
              </div>
            )}
          </div>

          <div className="sd-rail-body" ref={railBodyRef}>
            {fields.map((f, idx) => {
              const val = values[f.key] ?? '';
              const hasVal = isFieldFilled(f, val);
              const isFieldInvalid = touched && f.required && !hasVal;
              const isActive = activeRailField === f.key;

              return (
                <div
                  id={`rail-card-${f.key}`}
                  data-rail-key={f.key}
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
      {!isViewOnly && showVisualLine && connectorCoords && (
        <svg
          className="sd-filler-connector-svg sd-print-hide"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sd-connector-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--primary-500, #a4fb4f)" stopOpacity="0.85" style={{ stopColor: 'var(--primary-500, #a4fb4f)', stopOpacity: 0.85 }} />
              <stop offset="100%" stopColor="var(--primary-500, #a4fb4f)" stopOpacity="1" style={{ stopColor: 'var(--primary-500, #a4fb4f)', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          {/* Ambient Glow Halo */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--primary-500, #a4fb4f)"
            strokeWidth="6"
            opacity="0.28"
          />
          {/* Main Animated Connector Line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--primary-500, #a4fb4f)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            className="sd-connector-line-animated"
          />
          {/* Target Pointer at Document Element: compact arrowhead landing directly on the target line */}
          <polygon
            points={`${connectorCoords.x1 - 4.5},${connectorCoords.y1 - 5} ${connectorCoords.x1 + 4.5},${connectorCoords.y1 - 5} ${connectorCoords.x1},${connectorCoords.y1 + 1}`}
            fill="var(--primary-500, #a4fb4f)"
          />
          {/* Source Marker at Right Rail Card: solid dot + pulsing radar ring */}
          <circle cx={connectorCoords.x2} cy={connectorCoords.y2} r={4} fill="var(--primary-500, #a4fb4f)" />
          <circle cx={connectorCoords.x2} cy={connectorCoords.y2} r={7} fill="var(--primary-500, #a4fb4f)" opacity="0.4" className="sd-connector-pulse" />
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
                        checked={isCheckboxChecked(dialogFieldValue)}
                        onChange={e => setDialogFieldValue(e.target.checked ? 'Yes' : '')}
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
                    Cannot submit until all required fields across the package are filled.
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
                {allMissingItems.map((item, idx) => {
                  const f = item.field;
                  return (
                    <div
                      key={`${item.tabId}-${f.key}-${idx}`}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--bad-500)', fontWeight: 800 }}>*</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          {f.label || f.key}
                        </span>
                        {taggedSubforms.length > 0 && (
                          <span className="sd-badge sd-badge-accent sd-badge-xs">
                            {item.tabTitle}
                          </span>
                        )}
                        <span className="sd-badge sd-badge-gray sd-badge-xs">
                          {f.mode === 'placeholder' ? 'Placeholder' : 'Input'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        style={{ fontSize: '0.72rem', padding: '3px 8px', flexShrink: 0 }}
                        onClick={() => {
                          setShowMissingPromptModal(false);
                          if (item.tabId !== activeDocTabId) {
                            setActiveDocTabId(item.tabId);
                          }
                          setTimeout(() => {
                            if (f.mode === 'placeholder') {
                              handleOpenFieldDialog(f);
                            } else {
                              const el = document.getElementById(`live-field-${f.key.replace(/\W+/g, '-').toLowerCase()}`);
                              if (el) {
                                el.focus();
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }
                          }, 80);
                        }}
                      >
                        Fill Now →
                      </button>
                    </div>
                  );
                })}
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
