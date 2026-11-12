import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { Modal, fileToBase64 } from './ui';
import { PrePublishReviewPromptModal } from './PrePublishReviewPromptModal';
import { SendForReviewModal } from './SendForReviewModal';
import { ApprovalRouteModal } from './ApprovalRouteModal';
import {
  UploadCloud, FileText, X, Plus, PenLine, Info, Loader2, Lock,
  Image as ImageIcon, FolderInput, FileEdit, AlertTriangle, GitMerge, Tag,
  ChevronUp, ChevronDown, RefreshCw, GripVertical, Users, ShieldCheck,
  CheckCircle2, MessageSquare, RotateCcw, Clock
} from 'lucide-react';

const SLA_PRESETS = [3, 7, 14, 30];

const normalizeUploadWorkflow = (wf) => {
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

const serializeUploadWorkflow = (wf) =>
  normalizeUploadWorkflow(wf).map((item, i) => ({
    step: i + 1,
    department: item.department,
    ...(item.instruction ? { instruction: item.instruction } : {})
  }));

const guessType = (key) => {
  const k = key.toLowerCase();
  if (/date|dob|from|until|deadline/.test(k)) return 'date';
  if (/amount|qty|quantity|number of|days|cost|price|total|age/.test(k)) return 'number';
  if (/remark|reason|description|comment|purpose|details|notes/.test(k)) return 'textarea';
  return 'text';
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Admin flow: upload .docx -> mark mandatory fields -> build department approval chain -> publish
// Or upload static PDF / Image as reference document
export const TemplateUploadModal = ({ onClose, initialDepartment, initialFolderId, onOpenBulkImport }) => {
  const { currentUser, isSuperAdmin, users, departments, folders, formTemplates, createTemplate, startReview } = useApp();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null); // { name, base64, fileType, size }
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [fields, setFields] = useState([]);
  const [signatureSlots, setSignatureSlots] = useState([]);
  const [systemTags, setSystemTags] = useState([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState(initialDepartment || currentUser?.department || '');
  const [folderId, setFolderId] = useState(initialFolderId || '');
  const [audience, setAudience] = useState('DEPARTMENT');
  const [expiryDays, setExpiryDays] = useState(14);
  const [workflow, setWorkflow] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [editingNoteIdx, setEditingNoteIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  // Pre-publish prompt & Send for review states
  const [showPrePublishPrompt, setShowPrePublishPrompt] = useState(false);
  const [showSendForReview, setShowSendForReview] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);

  const activeDept = isSuperAdmin ? department : (currentUser?.department || '');
  const deptFolders = (folders || []).filter(f => f.department === activeDept);

  const handleFile = async (f) => {
    setParseError('');
    if (!f) return;

    const fn = f.name.toLowerCase();
    const isDoc = /\.doc$/i.test(fn);
    const isDocx = /\.docx$/i.test(fn);
    const isWord = isDoc || isDocx;
    const isPdf = /\.pdf$/i.test(fn);
    const isImg = /\.(png|jpe?g|webp)$/i.test(fn);

    if (!isWord && !isPdf && !isImg) {
      setParseError('Please choose a Word document (.doc, .docx), PDF (.pdf), or Image (.png, .jpg, .webp)');
      return;
    }

    setParsing(true);
    try {
      const base64 = await fileToBase64(f);

      if (isPdf || isImg) {
        // PDF and Images are uploaded as non-editable static documents
        const fileType = isPdf ? 'pdf' : 'image';
        setFile({ name: f.name, base64, fileType, size: f.size });
        setFields([]);
        setSignatureSlots([]);
        setSystemTags([]);
        if (!title) setTitle(f.name.replace(/\.[^.]+$/i, '').replace(/[_-]+/g, ' ').trim());
      } else {
        // Word .doc / .docx template (placeholders can be present or added after upload)
        let parsed = { fields: [], signatureSlots: [], systemTags: [] };
        try {
          parsed = await apiService.parseTemplate(base64);
        } catch (e) {
          console.info('[TemplateUpload] document has no initial placeholders:', e.message);
        }
        setFile({ name: f.name, base64, fileType: isDoc ? 'doc' : 'docx', size: f.size });
        setFields((parsed.fields || []).map(key => ({
          key,
          label: key,
          type: 'text',
          mode: 'placeholder',
          bold: false,
          required: true,
          description: '',
          placeholder: ''
        })));
        setSignatureSlots(parsed.signatureSlots || []);
        setSystemTags(parsed.systemTags || []);
        if (!title) setTitle(f.name.replace(/\.(docx|doc)$/i, '').replace(/[_-]+/g, ' ').trim());

        // Pre-fill approval chain from department signature placeholders, or fallback to owning/active department
        const deptNames = departments.map(d => d.name.toLowerCase());
        const fromSlots = (parsed.signatureSlots || []).filter(s => deptNames.includes(s.toLowerCase()))
          .map(s => ({ department: departments.find(d => d.name.toLowerCase() === s.toLowerCase()).name }));
        if (fromSlots.length > 0) {
          setWorkflow(normalizeUploadWorkflow(fromSlots));
        } else if (workflow.length === 0) {
          const fallbackDept = department || currentUser?.department || departments[0]?.name;
          if (fallbackDept) setWorkflow([{ department: fallbackDept }]);
        }
      }
    } catch (err) {
      setParseError(err.message);
    }
    setParsing(false);
  };

  const workflowItems = useMemo(() => normalizeUploadWorkflow(workflow), [workflow]);

  const remainingDepartments = useMemo(() => {
    const taken = new Set(workflowItems.map(w => w.department.toLowerCase()));
    return (departments || []).filter(d => d?.name && !taken.has(d.name.trim().toLowerCase()));
  }, [departments, workflowItems]);

  const moveStep = (i, dir) => {
    setWorkflow(prev => {
      const next = [...normalizeUploadWorkflow(prev)];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setEditingNoteIdx(prev => (prev === i ? i + dir : (prev === i + dir ? i : prev)));
  };

  const reorderStep = (fromIdx, toIdx) => {
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    setWorkflow(prev => {
      const next = [...normalizeUploadWorkflow(prev)];
      if (fromIdx < 0 || fromIdx >= next.length || toIdx < 0 || toIdx >= next.length) return next;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setEditingNoteIdx(null);
  };

  const addStep = (deptName) => {
    const clean = String(deptName || '').trim();
    if (!clean) return;
    setWorkflow(prev => normalizeUploadWorkflow([...prev, { department: clean }]));
  };

  const removeStep = (idx) => {
    setWorkflow(prev => normalizeUploadWorkflow(prev).filter((_, j) => j !== idx));
    setEditingNoteIdx(prev => (prev === idx ? null : (prev !== null && prev > idx ? prev - 1 : prev)));
  };

  const updateStepNote = (idx, text) => {
    setWorkflow(prev => {
      const next = [...normalizeUploadWorkflow(prev)];
      if (!next[idx]) return next;
      const clean = String(text || '').slice(0, 240);
      next[idx] = clean.trim()
        ? { ...next[idx], instruction: clean }
        : { department: next[idx].department };
      return next;
    });
  };

  const unmatchedSlots = signatureSlots.filter(
    s => s.toLowerCase() !== 'submitter' && !departments.some(d => d.name.toLowerCase() === s.toLowerCase())
  );
  
  const isDocx = file?.fileType === 'docx' || file?.fileType === 'doc';

  const duplicateConflict = useMemo(() => {
    if (!title.trim() && !file?.name) return null;
    const cleanT = title.trim().toLowerCase();
    const cleanFn = (file?.name || '').trim().toLowerCase();
    const targetFolderStr = String(folderId || '');
    const found = (formTemplates || []).find(t => {
      if (t.department !== activeDept) return false;
      if (t.status === 'ARCHIVED') return false;
      const tFolderStr = String(t.folderId || '');
      if (tFolderStr !== targetFolderStr) return false;
      const matchTitle = cleanT && t.title?.trim().toLowerCase() === cleanT;
      const matchFn = cleanFn && t.fileName?.trim().toLowerCase() === cleanFn;
      return matchTitle || matchFn;
    });
    return found ? (cleanT && found.title?.trim().toLowerCase() === cleanT ? `A document titled "${found.title}" already exists in this folder.` : `A file named "${found.fileName}" already exists in this folder.`) : null;
  }, [title, file, folderId, activeDept, formTemplates]);

  const canPublish = file && title.trim() && (!isDocx || workflowItems.length > 0) && !saving && !duplicateConflict;

  const handlePublish = async () => {
    if (duplicateConflict) {
      setParseError(duplicateConflict);
      return;
    }
    // For editable Word form templates, intercept to prompt user before publishing
    if (isDocx) {
      setShowPrePublishPrompt(true);
      return;
    }
    // Static documents (PDF/image) publish directly
    await executeDirectPublish();
  };

  const executeDirectPublish = async () => {
    setShowPrePublishPrompt(false);
    setSaving(true);
    try {
      const created = await createTemplate({
        title: title.trim(),
        description: description.trim(),
        department: isSuperAdmin ? department : currentUser.department,
        folderId: folderId || null,
        audience,
        fileBase64: file.base64,
        fileName: file.name,
        fileType: file.fileType || 'docx',
        fields: isDocx ? fields : [],
        workflow: isDocx ? serializeUploadWorkflow(workflow) : [],
        defaultExpiryDays: isDocx ? expiryDays : null,
        status: 'ACTIVE'
      });
      if (created) onClose();
    } catch (err) {
      setParseError(err.message || 'Failed to publish template');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!file) return;
    if (!title.trim()) {
      setParseError('Document title is required to save as draft');
      return;
    }
    if (duplicateConflict) {
      setParseError(duplicateConflict);
      return;
    }
    setShowPrePublishPrompt(false);
    setSaving(true);
    setParseError('');
    try {
      const created = await createTemplate({
        title: title.trim(),
        description: description.trim(),
        department: isSuperAdmin ? department : currentUser.department,
        folderId: folderId || null,
        audience,
        fileBase64: file.base64,
        fileName: file.name,
        fileType: file.fileType || 'docx',
        fields: isDocx ? fields : [],
        workflow: [],
        defaultExpiryDays: isDocx ? expiryDays : null,
        status: 'DRAFT',
        isDraft: true
      });
      if (created) onClose();
    } catch (err) {
      setParseError(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenSendForReview = () => {
    setShowPrePublishPrompt(false);
    setShowSendForReview(true);
  };

  const handleSendForReview = async ({ reviewerIds, message }) => {
    setSaving(true);
    try {
      let html = `<p>${title.trim()}</p>`;
      try {
        const parsed = await apiService.parseDocx(file.base64);
        if (parsed.html) html = parsed.html;
      } catch (err) {
        console.warn('Failed to parse docx for review, using fallback HTML:', err);
      }

      const res = await startReview({
        title: title.trim(),
        description: description.trim(),
        department: isSuperAdmin ? department : currentUser.department,
        folderId: folderId || null,
        audience,
        defaultExpiryDays: expiryDays || 14,
        workflow: serializeUploadWorkflow(workflow),
        htmlContent: html,
        reviewerIds,
        message
      });

      if (res) {
        setShowSendForReview(false);
        onClose();
        return true;
      }
    } catch (err) {
      setParseError(err.message || 'Failed to send template for review');
    } finally {
      setSaving(false);
    }
    return false;
  };

  const modalTitle = !file
    ? 'Upload Form or Document'
    : isDocx
      ? 'Upload Word Form Template'
      : file.fileType === 'pdf'
        ? 'Upload PDF Document'
        : 'Upload Image Document';

  const modalSubtitle = !file
    ? 'Upload Word (.doc, .docx) templates to collect data, or upload PDF and images as non-editable reference documents.'
    : isDocx
      ? 'Configure interactive form fields and multi-stage department approval chain.'
      : 'Preserved in original format as a secure, non-editable reference document on the drive.';

  return (
    <>
      <Modal
      id="template-upload-modal"
      size="lg"
      title={modalTitle}
      subtitle={modalSubtitle}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            id="btn-upload-draft"
            type="button"
            className="btn btn-secondary"
            disabled={!file || !title.trim() || saving || !!duplicateConflict}
            onClick={handleSaveDraft}
            title="Save document as an unpublished draft without configuring approval workflows"
          >
            <FileEdit size={14} /> Upload as Draft
          </button>
          <button
            id="btn-publish-template"
            className="btn btn-primary"
            disabled={!canPublish}
            onClick={handlePublish}
          >
            {saving ? 'Saving…' : isDocx ? 'Publish Form Template' : 'Upload to Drive'}
          </button>
        </>
      }
    >
      <div className="sd-upload-modal-body">
        {/* 1. File Upload Dropzone / Selected File Card */}
        {!file ? (
          <>
            <div
              className={`sd-dropzone ${dragOver ? 'is-over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
            >
              {parsing ? <Loader2 size={32} className="sd-spin" /> : <UploadCloud size={32} className="sd-dropzone-icon" />}
              <strong>{parsing ? 'Analyzing document…' : 'Drag & drop file here, or click to browse'}</strong>
              <span className="sd-dropzone-hint">Supports Word (.doc, .docx), PDF (.pdf), and Images (.png, .jpg, .webp)</span>
              <div className="sd-format-tag-list">
                <span className="sd-format-tag">.DOC / .DOCX Fillable Forms</span>
                <span className="sd-format-tag">.PDF Reference Documents</span>
                <span className="sd-format-tag">.PNG / .JPG Images</span>
              </div>
              <input
                ref={inputRef}
                id="input-template-file"
                type="file"
                accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
            {onOpenBulkImport && (
              <div className="sd-bulk-switch-banner" style={{ marginTop: '0.85rem', padding: '0.75rem 1rem', background: 'var(--bg-card-subtle)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="sd-muted sd-small">Need to upload multiple documents, forms, or PDFs at once?</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={onOpenBulkImport}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <FolderInput size={13} /> Switch to Bulk Importer &rarr;
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="sd-upload-file-card">
            <div className={`sd-upload-file-icon-box ${
              isDocx ? 'sd-file-icon-docx' : file.fileType === 'pdf' ? 'sd-file-icon-pdf' : 'sd-file-icon-image'
            }`}>
              {file.fileType === 'image' ? <ImageIcon size={22} /> : <FileText size={22} />}
            </div>
            <div className="sd-upload-file-content">
              <div className="sd-upload-file-title" title={file.name}>
                {file.name}
              </div>
              <div className="sd-upload-file-meta-row">
                {isDocx ? (
                  <>
                    <span className="sd-badge sd-badge-accent sd-badge-xs">Fillable Word Template</span>
                    <span>{fields.length} form field{fields.length === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{signatureSlots.length} signature spot{signatureSlots.length === 1 ? '' : 's'}</span>
                    {file.size ? <><span>·</span><span>{formatSize(file.size)}</span></> : null}
                  </>
                ) : (
                  <>
                    <span className={`sd-badge sd-badge-xs ${file.fileType === 'pdf' ? 'sd-badge-red' : 'sd-badge-green'}`}>
                      <Lock size={10} /> Static {file.fileType?.toUpperCase()} (Non-editable)
                    </span>
                    {file.size ? <span>{formatSize(file.size)}</span> : null}
                  </>
                )}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setFile(null); setFields([]); setSignatureSlots([]); setSystemTags([]); }}
              title="Choose a different file"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} /> Change File
            </button>
          </div>
        )}

        {parseError && (
          <div className="sd-alert sd-alert-error">
            <Info size={16} />
            <span>{parseError}</span>
          </div>
        )}

        {duplicateConflict && (
          <div className="sd-alert sd-alert-error" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span><strong>Duplicate File:</strong> {duplicateConflict} Duplicate files are not allowed in the same folder.</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE A: Static Document (PDF or Image)                   */}
        {/* No approval chain, no form fields, clean 1-screen setup  */}
        {/* ======================================================== */}
        {file && !isDocx && (
          <div className="sd-upload-section-group animate-fade-in">
            <div className="sd-upload-callout sd-upload-callout-info">
              <Info size={18} />
              <div>
                <div className="sd-upload-callout-title">Static Reference Document</div>
                <div>
                  This document is preserved in its original format. Team members can view and download it directly from the drive. It does not collect interactive form fields or require an approval signature chain.
                </div>
              </div>
            </div>

            <div className="sd-upload-card">
              <div className="sd-card-section-header">
                <div className="sd-card-section-title">
                  <FileText size={16} /> Document Details &amp; Storage
                </div>
              </div>

              <div className="sd-grid-2">
                <label className="sd-field">
                  <span className="sd-label">Document Name *</span>
                  <input
                    id="input-template-title"
                    className="sd-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Employee Handbook"
                  />
                </label>

                <label className="sd-field">
                  <span className="sd-label">Owning Department</span>
                  {isSuperAdmin ? (
                    <select className="sd-input" value={department} onChange={e => setDepartment(e.target.value)}>
                      {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  ) : (
                    <input className="sd-input" value={currentUser.department} disabled />
                  )}
                </label>
              </div>

              <div className="sd-grid-2">
                <label className="sd-field">
                  <span className="sd-label">Destination Folder</span>
                  <select className="sd-input" value={folderId} onChange={e => setFolderId(e.target.value)}>
                    <option value="">📁 (Root of {activeDept})</option>
                    {deptFolders.map(f => (
                      <option key={f.id} value={f.id}>📁 {f.name}</option>
                    ))}
                  </select>
                </label>

                <label className="sd-field">
                  <span className="sd-label">Who Can Access This Document</span>
                  <select className="sd-input" value={audience} onChange={e => setAudience(e.target.value)}>
                    <option value="DEPARTMENT">Members of the owning department</option>
                    <option value="ALL">Everyone in the company</option>
                  </select>
                </label>
              </div>

              <label className="sd-field">
                <span className="sd-label">Description (Optional)</span>
                <input
                  className="sd-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description or purpose shown in the explorer list"
                />
              </label>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE B: Fillable Word Template (.docx)                   */}
        {/* Streamlined cards: Details -> Detected Fields (if any) -> Workflow */}
        {/* ======================================================== */}
        {file && isDocx && (
          <div className="sd-upload-section-group animate-fade-in">
            {/* Card 1: Template Details & Storage */}
            <div className="sd-upload-card">
              <div className="sd-card-section-header">
                <div className="sd-card-section-title">
                  <FileText size={16} /> Template Details &amp; Storage
                </div>
              </div>

              <div className="sd-grid-2">
                <label className="sd-field">
                  <span className="sd-label">Template Name *</span>
                  <input
                    id="input-template-title"
                    className="sd-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Equipment Request Form"
                  />
                </label>

                <label className="sd-field">
                  <span className="sd-label">Owning Department</span>
                  {isSuperAdmin ? (
                    <select className="sd-input" value={department} onChange={e => setDepartment(e.target.value)}>
                      {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  ) : (
                    <input className="sd-input" value={currentUser.department} disabled />
                  )}
                </label>
              </div>

              <div className="sd-grid-2">
                <label className="sd-field">
                  <span className="sd-label">Destination Folder</span>
                  <select className="sd-input" value={folderId} onChange={e => setFolderId(e.target.value)}>
                    <option value="">📁 (Root of {activeDept})</option>
                    {deptFolders.map(f => (
                      <option key={f.id} value={f.id}>📁 {f.name}</option>
                    ))}
                  </select>
                </label>

                <div className="sd-field">
                  <span className="sd-label">Who Can Access This Form</span>
                  <div className="sd-wf-segmented sd-wf-segmented-block" role="group" aria-label="Form audience">
                    <button
                      type="button"
                      className={`sd-wf-seg-btn ${audience === 'DEPARTMENT' ? 'active' : ''}`}
                      onClick={() => setAudience('DEPARTMENT')}
                    >
                      Owning Dept Only
                    </button>
                    <button
                      type="button"
                      className={`sd-wf-seg-btn ${audience === 'ALL' ? 'active' : ''}`}
                      onClick={() => setAudience('ALL')}
                    >
                      Everyone in Company
                    </button>
                  </div>
                </div>
              </div>

              <div className="sd-grid-2">
                <div className="sd-field">
                  <span className="sd-label">
                    <Clock size={12} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                    Default Decision Deadline
                  </span>
                  <div className="sd-wf-sla-group">
                    <div className="sd-wf-sla-pills">
                      {SLA_PRESETS.map(preset => (
                        <button
                          key={preset}
                          type="button"
                          className={`sd-wf-sla-pill ${Number(expiryDays) === preset ? 'active' : ''}`}
                          onClick={() => setExpiryDays(preset)}
                        >
                          {preset}d
                        </button>
                      ))}
                    </div>
                    <div className="sd-workflow-days-wrap">
                      <input
                        className="sd-input sd-input-sm"
                        type="number"
                        min="1"
                        max="365"
                        value={expiryDays}
                        onChange={e => setExpiryDays(e.target.value)}
                      />
                      <span className="sd-workflow-days-suffix">days</span>
                    </div>
                  </div>
                </div>

                <label className="sd-field">
                  <span className="sd-label">Description (Optional)</span>
                  <input
                    className="sd-input"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Brief description shown in explorer"
                  />
                </label>
              </div>
            </div>

            {/* Card 2: Detected Form Fields (ONLY rendered when fields exist in file) */}
            {fields.length > 0 && (
              <div className="sd-upload-card">
                <div className="sd-card-section-header">
                  <div className="sd-card-section-title">
                    <Tag size={16} /> Detected Placeholders ({fields.length})
                  </div>
                  <span className="sd-muted sd-small">Detected from document</span>
                </div>

                <div className="sd-detected-tags-cloud">
                  {fields.map(f => (
                    <span key={f.key} className="sd-detected-tag" title={`Placeholder {{${f.key}}}`}>
                      <code>{`{{${f.key}}}`}</code>
                    </span>
                  ))}
                </div>

                {systemTags.length > 0 && (
                  <p className="sd-hint" style={{ margin: 0, fontSize: '0.78rem' }}>
                    <Info size={13} /> Auto-filled system tags: {systemTags.map(t => `{{${t}}}`).join(', ')}
                  </p>
                )}

                <div className="sd-muted sd-small" style={{ fontSize: '0.76rem' }}>
                  Placeholders and form layout can be edited anytime directly in <strong>Word Form Studio</strong>.
                </div>
              </div>
            )}

            {/* Card 3: Approval Route */}
            <div className="sd-upload-card">
              <div className="sd-card-section-header">
                <div className="sd-card-section-title">
                  <GitMerge size={16} /> Approval Route
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  style={{ height: '28px', padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setShowRouteModal(true)}
                >
                  <GitMerge size={13} /> Edit Route…
                </button>
              </div>

              {workflowItems.length === 0 ? (
                <div className="sd-ar-empty-box" style={{ margin: '4px 0 0' }}>
                  No approval steps selected — form will upload as a <strong>Draft</strong> unless you add steps via <strong>Edit Route…</strong>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {workflowItems.map((item, i) => (
                    <React.Fragment key={item.department}>
                      <span className="sd-ar-upload-step-pill">
                        <span className="sd-ar-upload-step-num">{i + 1}</span>
                        <span>{item.department}</span>
                      </span>
                      {i < workflowItems.length - 1 && (
                        <span className="sd-muted" style={{ fontSize: '0.8rem' }}>→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>

    {showPrePublishPrompt && (
      <PrePublishReviewPromptModal
        title={title}
        isPublishing={saving}
        onClose={() => setShowPrePublishPrompt(false)}
        onPublishDirect={executeDirectPublish}
        onSendForReview={handleOpenSendForReview}
      />
    )}

    {showSendForReview && (
      <SendForReviewModal
        title={title}
        onClose={() => setShowSendForReview(false)}
        onBack={() => {
          setShowSendForReview(false);
          setShowPrePublishPrompt(true);
        }}
        onSend={handleSendForReview}
      />
    )}

    {showRouteModal && (
      <ApprovalRouteModal
        isOpen={showRouteModal}
        onClose={() => setShowRouteModal(false)}
        formTitle={title.trim() || file?.name || 'Uploaded Word Template'}
        owningDepartment={activeDept}
        workflow={workflowItems}
        audience={audience}
        defaultExpiryDays={expiryDays}
        onApply={({ workflow: nextWf, audience: nextAud, defaultExpiryDays: nextDays }) => {
          setWorkflow(normalizeUploadWorkflow(nextWf));
          if (nextAud) setAudience(nextAud);
          if (nextDays) setExpiryDays(nextDays);
        }}
      />
    )}
  </>
);
};
