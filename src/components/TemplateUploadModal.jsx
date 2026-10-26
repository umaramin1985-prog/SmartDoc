import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { Modal, fileToBase64 } from './ui';
import { PrePublishReviewPromptModal } from './PrePublishReviewPromptModal';
import { SendForReviewModal } from './SendForReviewModal';
import {
  UploadCloud, FileText, ArrowUp, ArrowDown, X, Plus, PenLine, Info, Loader2, Lock,
  Image as ImageIcon, CheckCircle2, Folder, Building2, HelpCircle, Trash2, Bold,
  FolderInput, FileEdit, AlertTriangle
} from 'lucide-react';

const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' }
];

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
  const { currentUser, isSuperAdmin, departments, folders, formTemplates, createTemplate, startReview } = useApp();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null); // { name, base64, fileType, size }
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [fields, setFields] = useState([]);
  const [signatureSlots, setSignatureSlots] = useState([]);
  const [systemTags, setSystemTags] = useState([]);

  // Adding custom placeholders in modal
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldBold, setNewFieldBold] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState(initialDepartment || currentUser?.department || '');
  const [folderId, setFolderId] = useState(initialFolderId || '');
  const [audience, setAudience] = useState('DEPARTMENT');
  const [expiryDays, setExpiryDays] = useState(14);
  const [workflow, setWorkflow] = useState([]);
  const [stepToAdd, setStepToAdd] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Pre-publish prompt & Send for review states
  const [showPrePublishPrompt, setShowPrePublishPrompt] = useState(false);
  const [showSendForReview, setShowSendForReview] = useState(false);

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
          type: guessType(key),
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
          .map(s => departments.find(d => d.name.toLowerCase() === s.toLowerCase()).name);
        if (fromSlots.length > 0) {
          setWorkflow(fromSlots);
        } else if (workflow.length === 0) {
          const fallbackDept = department || currentUser?.department || departments[0]?.name;
          if (fallbackDept) setWorkflow([fallbackDept]);
        }
      }
    } catch (err) {
      setParseError(err.message);
    }
    setParsing(false);
  };

  const handleAddCustomField = () => {
    const raw = newFieldKey.trim();
    if (!raw) return;
    const cleanKey = raw.replace(/[^a-zA-Z0-9_\s-]/g, '').trim();
    if (!cleanKey) return;
    if (fields.some(f => f.key.toLowerCase() === cleanKey.toLowerCase())) {
      setParseError(`Placeholder "${cleanKey}" already exists`);
      return;
    }
    setFields(prev => [...prev, {
      key: cleanKey,
      label: cleanKey,
      type: newFieldType,
      mode: 'placeholder',
      bold: newFieldBold,
      required: newFieldRequired,
      description: '',
      placeholder: ''
    }]);
    setNewFieldKey('');
    setNewFieldRequired(false);
    setNewFieldBold(false);
    setParseError('');
  };

  const removeField = (keyToRemove) => {
    setFields(prev => prev.filter(f => f.key !== keyToRemove));
  };

  const updateField = (key, patch) => setFields(prev => prev.map(f => (f.key === key ? { ...f, ...patch } : f)));
  const moveStep = (i, dir) => setWorkflow(prev => {
    const next = [...prev];
    const j = i + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

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

  const canPublish = file && title.trim() && (!isDocx || workflow.length > 0) && !saving && !duplicateConflict;

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
        workflow: isDocx ? workflow : [],
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
        workflow: workflow.map((dept, i) => ({ step: i + 1, department: dept })),
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
                hidden
                onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
            {onOpenBulkImport && (
              <div className="sd-bulk-switch-banner" style={{ marginTop: '0.85rem', padding: '0.75rem 1rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            >
              Change File
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

            <div className="sd-upload-form-group">
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
        {/* Full sequential setup: details -> fields -> workflow     */}
        {/* ======================================================== */}
        {file && isDocx && (
          <div className="sd-upload-section-group animate-fade-in">
            {/* Step 1: Template Information */}
            <section className="sd-section">
              <h3 className="sd-section-title"><span className="sd-step-num">1</span> Template Details &amp; Storage</h3>
              <div className="sd-upload-form-group">
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

                  <label className="sd-field">
                    <span className="sd-label">Who Can Access This Form</span>
                    <select className="sd-input" value={audience} onChange={e => setAudience(e.target.value)}>
                      <option value="DEPARTMENT">Members of the owning department</option>
                      <option value="ALL">Everyone in the company</option>
                    </select>
                  </label>
                </div>

                <div className="sd-grid-2">
                  <label className="sd-field">
                    <span className="sd-label">Default Decision Deadline (days)</span>
                    <input
                      className="sd-input"
                      type="number"
                      min="1"
                      max="365"
                      value={expiryDays}
                      onChange={e => setExpiryDays(e.target.value)}
                    />
                  </label>

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
            </section>

            {/* Step 2: Form Placeholders / Fields */}
            <section className="sd-section">
              <div className="sd-flex-between sd-mb-xs">
                <h3 className="sd-section-title">
                  <span className="sd-step-num">2</span> Form Placeholders / Fields ({fields.length})
                </h3>
              </div>

              {fields.length === 0 ? (
                <div className="sd-alert sd-alert-info sd-mb-sm">
                  <Info size={16} />
                  <div>
                    <strong>No placeholders detected in this Word file yet.</strong>
                    <div className="sd-small sd-mt-xs">
                      You can add custom placeholders below right now, or publish this document and add placeholders anytime later in <strong>Word Form Studio</strong> (via "Edit form").
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sd-table-wrap sd-card sd-mb-sm">
                  <table className="sd-table">
                    <thead>
                      <tr>
                        <th>Placeholder Tag</th>
                        <th style={{ width: 135 }}>Field Type</th>
                        <th style={{ width: 165 }}>Fill Style</th>
                        <th style={{ width: 95 }}>Weight</th>
                        <th style={{ width: 90 }}>Mandatory</th>
                        <th style={{ width: 44 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map(f => (
                        <tr key={f.key}>
                          <td><code className="sd-code">{`{{${f.key}}}`}</code></td>
                          <td>
                            <select className="sd-input sd-input-sm" value={f.type} onChange={e => updateField(f.key, { type: e.target.value })}>
                              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </td>
                          <td>
                            <select
                              className="sd-input sd-input-sm"
                              value={f.mode || 'placeholder'}
                              onChange={e => updateField(f.key, { mode: e.target.value })}
                            >
                              <option value="placeholder">🏷️ Placeholder (Dialog)</option>
                              <option value="input">📝 Direct Input</option>
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`btn btn-xs ${f.bold ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => updateField(f.key, { bold: !f.bold })}
                              title={f.bold ? 'Bold text (700) enabled. Click for normal.' : 'Normal text. Click to make bold.'}
                            >
                              <Bold size={11} />
                              <span>{f.bold ? 'Bold' : 'Normal'}</span>
                            </button>
                          </td>
                          <td>
                            <label className="sd-switch">
                              <input type="checkbox" checked={f.required} onChange={e => updateField(f.key, { required: e.target.checked })} />
                              <span>{f.required ? 'Yes' : 'No'}</span>
                            </label>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="sd-icon-btn sd-danger-hover"
                              title="Remove placeholder"
                              onClick={() => removeField(f.key)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add Custom Placeholder Box */}
              <div className="sd-card sd-p-sm sd-bg-subtle">
                <div className="sd-small sd-font-medium sd-mb-xs">Add Placeholder / Field</div>
                <div className="sd-inline-form">
                  <input
                    id="input-new-placeholder-key"
                    className="sd-input sd-input-sm"
                    style={{ flex: 2 }}
                    placeholder="Placeholder name (e.g. Employee Name, Start Date)…"
                    value={newFieldKey}
                    onChange={e => setNewFieldKey(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomField(); } }}
                  />
                  <select
                    className="sd-input sd-input-sm"
                    style={{ width: 130 }}
                    value={newFieldType}
                    onChange={e => setNewFieldType(e.target.value)}
                  >
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="sd-switch" title="Make placeholder text bold (700)">
                    <input
                      type="checkbox"
                      checked={newFieldBold}
                      onChange={e => setNewFieldBold(e.target.checked)}
                    />
                    <span className="sd-small">Bold</span>
                  </label>
                  <label className="sd-switch" title="Make this field mandatory">
                    <input
                      type="checkbox"
                      checked={newFieldRequired}
                      onChange={e => setNewFieldRequired(e.target.checked)}
                    />
                    <span className="sd-small">Required</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!newFieldKey.trim()}
                    onClick={handleAddCustomField}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
              {systemTags.length > 0 && (
                <p className="sd-hint sd-mt-xs">
                  <Info size={13} /> Auto-filled system tags: {systemTags.map(t => `{{${t}}}`).join(', ')}
                </p>
              )}
            </section>

            {/* Step 3: Approval Workflow */}
            <section className="sd-section">
              <h3 className="sd-section-title"><span className="sd-step-num">3</span> Sequential Approval Chain</h3>
              <p className="sd-muted sd-mb-sm">
                Submissions will route through these departments in order. Any department admin can approve and stamp their digital signature.
              </p>
              <ol className="sd-step-list">
                <li className="sd-step-item is-fixed">
                  <span className="sd-step-index">0</span>
                  <span className="sd-step-name">Submitter fills &amp; signs with saved signature</span>
                </li>
                {workflow.map((dept, i) => {
                  const deptName = typeof dept === 'string' ? dept : (dept?.department || '');
                  return (
                    <li key={`${deptName}-${i}`} className="sd-step-item">
                      <span className="sd-step-index">{i + 1}</span>
                      <span className="sd-step-name">{deptName} <span className="sd-muted">— any department admin</span></span>
                      <div className="sd-step-actions">
                        <button className="sd-icon-btn" disabled={i === 0} onClick={() => moveStep(i, -1)} title="Move up"><ArrowUp size={15} /></button>
                        <button className="sd-icon-btn" disabled={i === workflow.length - 1} onClick={() => moveStep(i, 1)} title="Move down"><ArrowDown size={15} /></button>
                        <button className="sd-icon-btn" onClick={() => setWorkflow(prev => prev.filter((_, j) => j !== i))} title="Remove"><X size={15} /></button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="sd-inline-form">
                <select id="select-workflow-dept" className="sd-input" value={stepToAdd} onChange={e => setStepToAdd(e.target.value)}>
                  <option value="">Select an approving department…</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <button
                  id="btn-add-workflow-step"
                  className="btn btn-secondary"
                  disabled={!stepToAdd}
                  onClick={() => { setWorkflow(prev => [...prev, stepToAdd]); setStepToAdd(''); }}
                >
                  <Plus size={15} /> Add approval step
                </button>
              </div>

              {workflow.length === 0 && (
                <div
                  className="sd-draft-hint-banner"
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(234, 179, 8, 0.08)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileEdit size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
                    <span className="sd-small" style={{ color: '#fbbf24' }}>
                      <strong>Want to skip the approval workflow?</strong> You can upload this document as an unpublished <strong>Draft</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    disabled={saving || !title.trim()}
                    onClick={handleSaveDraft}
                  >
                    Upload as Draft
                  </button>
                </div>
              )}

              <div className="sd-sig-summary sd-mt-sm">
                <PenLine size={14} />
                {signatureSlots.length > 0 ? (
                  <span>
                    Signature slots in document: {signatureSlots.join(', ')}.
                    {unmatchedSlots.length > 0 && <strong className="sd-text-warn"> Not matching any department: {unmatchedSlots.join(', ')} (will stay blank).</strong>}
                  </span>
                ) : (
                  <span>No signature placeholders detected — a “Signatures” section will be appended at the end of the document.</span>
                )}
              </div>
            </section>
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
        onSend={handleSendForReview}
      />
    )}
  </>
);
};
