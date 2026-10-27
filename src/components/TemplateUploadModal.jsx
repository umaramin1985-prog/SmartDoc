import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { Modal, fileToBase64 } from './ui';
import { PrePublishReviewPromptModal } from './PrePublishReviewPromptModal';
import { SendForReviewModal } from './SendForReviewModal';
import {
  UploadCloud, FileText, X, Plus, PenLine, Info, Loader2, Lock,
  Image as ImageIcon, FolderInput, FileEdit, AlertTriangle, GitMerge, Tag,
  ChevronUp, ChevronDown, RefreshCw
} from 'lucide-react';

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
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' }}
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

                <div className="sd-muted sd-small" style={{ fontSize: '0.76rem', color: '#71717a' }}>
                  Placeholders and form layout can be edited anytime directly in <strong>Word Form Studio</strong>.
                </div>
              </div>
            )}

            {/* Card 3: Sequential Approval Chain */}
            <div className="sd-upload-card">
              <div className="sd-card-section-header">
                <div className="sd-card-section-title">
                  <GitMerge size={16} /> Sequential Approval Chain
                </div>
                <span className="sd-muted sd-small">{workflow.length} step{workflow.length === 1 ? '' : 's'}</span>
              </div>

              <p className="sd-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                Submissions route sequentially through these departments. Any department admin can approve and stamp their digital signature.
              </p>

              <div className="sd-upload-workflow-pipeline">
                <div className="sd-upload-workflow-step is-originator">
                  <div className="sd-workflow-step-num is-originator">0</div>
                  <div className="sd-workflow-step-name">
                    Submitter / Originator
                    <span className="sd-workflow-step-desc">— fills form &amp; signs with saved signature</span>
                  </div>
                  <span className="sd-badge sd-badge-xs">Origin</span>
                </div>

                {workflow.map((dept, i) => {
                  const deptName = typeof dept === 'string' ? dept : (dept?.department || '');
                  return (
                    <div key={`${deptName}-${i}`} className="sd-upload-workflow-step">
                      <div className="sd-workflow-step-num">{i + 1}</div>
                      <div className="sd-workflow-step-name">
                        {deptName}
                        <span className="sd-workflow-step-desc">— any department admin</span>
                      </div>
                      <div className="sd-workflow-step-actions">
                        <button
                          type="button"
                          className="sd-icon-btn"
                          disabled={i === 0}
                          onClick={() => moveStep(i, -1)}
                          title="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="sd-icon-btn"
                          disabled={i === workflow.length - 1}
                          onClick={() => moveStep(i, 1)}
                          title="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="sd-icon-btn sd-danger-hover"
                          onClick={() => setWorkflow(prev => prev.filter((_, j) => j !== i))}
                          title="Remove step"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="sd-inline-form">
                <select
                  id="select-workflow-dept"
                  className="sd-input"
                  value={stepToAdd}
                  onChange={e => setStepToAdd(e.target.value)}
                >
                  <option value="">Select an approving department…</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <button
                  type="button"
                  id="btn-add-workflow-step"
                  className="btn btn-secondary"
                  disabled={!stepToAdd}
                  onClick={() => { setWorkflow(prev => [...prev, stepToAdd]); setStepToAdd(''); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} /> Add Step
                </button>
              </div>

              {workflow.length === 0 && (
                <div className="sd-upload-draft-banner">
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

              <div className="sd-sig-summary">
                <PenLine size={14} />
                {signatureSlots.length > 0 ? (
                  <span>
                    Signature slots in document: <strong style={{ color: '#ffffff' }}>{signatureSlots.join(', ')}</strong>.
                    {unmatchedSlots.length > 0 && (
                      <span className="sd-text-warn"> Unmatched slots: {unmatchedSlots.join(', ')} (will stay blank).</span>
                    )}
                  </span>
                ) : (
                  <span>No signature placeholders detected — a “Signatures” section will be appended at the end of the document.</span>
                )}
              </div>
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
        onSend={handleSendForReview}
      />
    )}
  </>
);
};
