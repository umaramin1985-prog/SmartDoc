import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, fileToBase64, formatSize } from './ui';
import {
  UploadCloud, FileText, FolderInput, Folder, Building2,
  Trash2, Plus, ArrowUp, ArrowDown, CheckCircle2, AlertTriangle,
  Loader2, X, Image as ImageIcon, Lock, ShieldCheck, Check, FileEdit
} from 'lucide-react';

export const BulkImportModal = ({ onClose, onDone, initialDepartment, initialFolderId }) => {
  const {
    currentUser, isSuperAdmin, departments, folders, formTemplates,
    bulkImportTemplates, addToast
  } = useApp();

  const fileInputRef = useRef(null);

  // Form & Destination state
  const [department, setDepartment] = useState(initialDepartment || currentUser?.department || '');
  const [folderId, setFolderId] = useState(initialFolderId || '');
  const [audience, setAudience] = useState('DEPARTMENT');
  const [expiryDays, setExpiryDays] = useState(14);

  // Staged files state
  // Each item: { id, file, name, size, base64, fileType, title }
  const [stagedFiles, setStagedFiles] = useState([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Execution state
  const [importing, setImporting] = useState(false);
  const [resultsSummary, setResultsSummary] = useState(null);

  const activeDept = isSuperAdmin ? department : (currentUser?.department || '');
  const deptFolders = useMemo(() => (folders || []).filter(f => f.department === activeDept), [folders, activeDept]);

  // Clean title from file name
  const cleanTitleFromName = (fn) => {
    return fn
      .replace(/\.[^.]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Detect file type
  const detectFileType = (fn) => {
    const lower = fn.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) return 'image';
    if (lower.endsWith('.doc')) return 'doc';
    return 'docx';
  };

  // Add multiple files from FileList / DataTransfer
  const handleFilesAdded = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const rawFiles = Array.from(fileList);

    // Validate supported formats
    const validFiles = rawFiles.filter(f => {
      const lower = f.name.toLowerCase();
      return /\.(docx|doc|pdf|png|jpe?g|webp)$/i.test(lower);
    });

    if (validFiles.length < rawFiles.length) {
      addToast(
        'Some files skipped',
        'Only Word (.doc, .docx), PDF (.pdf), and Images (.png, .jpg, .webp) are supported.',
        'warning'
      );
    }

    if (validFiles.length === 0) return;

    setReadingFiles(true);
    try {
      const newItems = await Promise.all(
        validFiles.map(async (f) => {
          const base64 = await fileToBase64(f);
          const fileType = detectFileType(f.name);
          return {
            id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            file: f,
            name: f.name,
            size: f.size,
            base64,
            fileType,
            title: cleanTitleFromName(f.name)
          };
        })
      );

      setStagedFiles(prev => [...prev, ...newItems]);
    } catch (err) {
      console.error('File read error:', err);
      addToast('File Read Error', err.message || 'Failed to read some files', 'error');
    } finally {
      setReadingFiles(false);
    }
  };

  const handleUpdateTitle = (id, newTitle) => {
    setStagedFiles(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
  };

  const handleRemoveStaged = (id) => {
    setStagedFiles(prev => prev.filter(item => item.id !== id));
  };

  const totalStagedSize = useMemo(() => {
    return stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  }, [stagedFiles]);

  const hasWordTemplates = useMemo(() => {
    return stagedFiles.some(f => f.fileType === 'docx' || f.fileType === 'doc');
  }, [stagedFiles]);

  const wordCount = useMemo(() => stagedFiles.filter(f => f.fileType === 'docx' || f.fileType === 'doc').length, [stagedFiles]);
  const pdfCount = useMemo(() => stagedFiles.filter(f => f.fileType === 'pdf').length, [stagedFiles]);
  const imgCount = useMemo(() => stagedFiles.filter(f => f.fileType === 'image').length, [stagedFiles]);

  const duplicateConflicts = useMemo(() => {
    const targetFolderStr = String(folderId || '');
    const conflicts = new Map();
    const seenTitles = new Map();
    const seenFileNames = new Map();

    stagedFiles.forEach(item => {
      const cleanT = (item.title || item.name || '').trim().toLowerCase();
      const cleanFn = (item.name || '').trim().toLowerCase();

      // Check within current batch
      if (cleanFn && seenFileNames.has(cleanFn)) {
        conflicts.set(item.id, `Duplicate file name in batch`);
        return;
      }
      if (cleanT && seenTitles.has(cleanT)) {
        conflicts.set(item.id, `Duplicate title in batch`);
        return;
      }
      seenFileNames.set(cleanFn, item.id);
      seenTitles.set(cleanT, item.id);

      // Check against existing templates in target folder
      const existing = (formTemplates || []).find(t => {
        if (t.department !== activeDept) return false;
        if (t.status === 'ARCHIVED') return false;
        const tFolderStr = String(t.folderId || '');
        if (tFolderStr !== targetFolderStr) return false;
        return (cleanT && t.title?.trim().toLowerCase() === cleanT) || (cleanFn && t.fileName?.trim().toLowerCase() === cleanFn);
      });

      if (existing) {
        conflicts.set(item.id, `Already exists in this folder (${existing.title || existing.fileName})`);
      }
    });

    return conflicts;
  }, [stagedFiles, folderId, activeDept, formTemplates]);

  const handleRemoveDuplicates = () => {
    if (duplicateConflicts.size === 0) return;
    setStagedFiles(prev => prev.filter(item => !duplicateConflicts.has(item.id)));
    addToast('Duplicates Removed', `Removed ${duplicateConflicts.size} duplicate file(s) from the import queue.`, 'info');
  };

  const handleExecuteBulkImport = async () => {
    if (stagedFiles.length === 0) {
      addToast('No files staged', 'Please select at least one document to import.', 'warning');
      return;
    }

    if (!activeDept) {
      addToast('Department required', 'Please select a target department for the imported documents.', 'warning');
      return;
    }

    if (duplicateConflicts.size > 0) {
      addToast(
        'Duplicate Files Detected',
        `${duplicateConflicts.size} file(s) are duplicated or already exist in this folder. Duplicate files are not allowed in the same folder.`,
        'warning'
      );
      return;
    }

    setImporting(true);

    try {
      const payload = {
        department: activeDept,
        folderId: folderId || null,
        audience,
        defaultExpiryDays: parseInt(expiryDays, 10) || 14,
        workflow: [],
        isDraft: true,
        status: 'DRAFT',
        files: stagedFiles.map(item => ({
          title: item.title.trim() || item.name,
          fileName: item.name,
          fileType: item.fileType,
          fileBase64: item.base64
        }))
      };

      const res = await bulkImportTemplates(payload);

      if (res && res.success) {
        setResultsSummary(res);
        addToast(
          'Bulk Import Successful',
          `Successfully imported ${res.importedCount} of ${res.totalCount} documents as drafts into ${activeDept}.`,
          'success'
        );
      }
    } catch (err) {
      console.error('Bulk import error:', err);
      addToast('Import Failed', err.message || 'Failed to complete bulk import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const getFolderLabel = (fId) => {
    if (!fId) return 'Root of Department Drive';
    const found = deptFolders.find(f => String(f.id) === String(fId));
    return found ? found.name : 'Selected Folder';
  };

  return (
    <Modal
      id="bulk-import-modal"
      size="xl"
      title="Bulk Import Documents (Drafts)"
      subtitle="Batch upload Word form templates, PDF documents, and images directly into your department drive as unpublished drafts."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (resultsSummary && onDone) onDone();
              onClose();
            }}
            disabled={importing}
          >
            {resultsSummary ? 'Close' : 'Cancel'}
          </button>

          {!resultsSummary && stagedFiles.length === 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={16} /> Browse Files…
            </button>
          )}

          {!resultsSummary && stagedFiles.length > 0 && (
            <button
              id="btn-execute-bulk-import"
              type="button"
              className="btn btn-primary btn-lg"
              disabled={importing || readingFiles || duplicateConflicts.size > 0}
              onClick={handleExecuteBulkImport}
            >
              {importing ? (
                <>
                  <Loader2 size={16} className="sd-spin" />
                  <span>Importing {stagedFiles.length} Documents…</span>
                </>
              ) : (
                <>
                  <UploadCloud size={16} />
                  <span>Import {stagedFiles.length} Document{stagedFiles.length === 1 ? '' : 's'} as Drafts &rarr;</span>
                </>
              )}
            </button>
          )}

          {resultsSummary && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (onDone) onDone();
                onClose();
              }}
            >
              <Check size={16} /> Done &amp; View in Explorer
            </button>
          )}
        </>
      }
    >
      <div className="sd-bulk-import-container">
        {/* Hidden Multi-file input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept=".docx,.doc,.pdf,.png,.jpg,.jpeg,.webp"
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files) handleFilesAdded(e.target.files);
            e.target.value = '';
          }}
        />

        {/* 1. Results View (Celebratory Screen) */}
        {resultsSummary ? (
          <div className="sd-bulk-success-hero animate-fade-in">
            <div className="sd-bulk-success-icon">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="sd-bulk-success-title">Bulk Import Completed!</h3>
            <p className="sd-bulk-success-subtitle">
              Imported <strong>{resultsSummary.importedCount}</strong> of <strong>{resultsSummary.totalCount}</strong> documents as <strong>unpublished drafts</strong> into{' '}
              <strong>{activeDept}</strong> &gt; <strong>{getFolderLabel(folderId)}</strong>.
            </p>

            <div className="sd-bulk-success-list">
              <table className="sd-table sd-bulk-table">
                <thead>
                  <tr>
                    <th>Imported Document</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(resultsSummary.results || []).map((r, i) => (
                    <tr key={i} className="sd-bulk-row">
                      <td>
                        <strong>{r.title}</strong>
                        <div className="sd-muted sd-small">{r.fileName}</div>
                      </td>
                      <td>
                        <span className="sd-badge sd-badge-gray sd-badge-sm">
                          {r.fileType ? r.fileType.toUpperCase() : 'DOC'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="sd-badge sd-badge-accent sd-badge-sm">
                          <Check size={12} /> Imported
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* 2. Top Destination Ribbon */}
            <div className="sd-bulk-dest-ribbon">
              <div className="sd-bulk-dest-group">
                <span className="sd-bulk-dest-label">
                  <Building2 size={14} /> Destination:
                </span>

                {isSuperAdmin ? (
                  <select
                    id="bulk-dept-select"
                    className="sd-bulk-dest-select"
                    value={department}
                    disabled={importing}
                    onChange={e => {
                      setDepartment(e.target.value);
                      setFolderId('');
                    }}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="sd-bulk-dest-badge">
                    {activeDept}
                  </span>
                )}

                <span className="sd-bulk-dest-divider">/</span>

                <span className="sd-bulk-dest-label">
                  <Folder size={14} /> Folder:
                </span>

                <select
                  id="bulk-folder-select"
                  className="sd-bulk-dest-select"
                  value={folderId}
                  disabled={importing}
                  onChange={e => setFolderId(e.target.value)}
                >
                  <option value="">(Root of Department Drive)</option>
                  {deptFolders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="sd-bulk-dest-group">
                <span className="sd-bulk-dest-label">Audience:</span>
                <div className="sd-segmented-control" style={{ width: 'auto' }}>
                  <button
                    type="button"
                    className={`sd-seg-btn ${audience === 'DEPARTMENT' ? 'is-active' : ''}`}
                    onClick={() => setAudience('DEPARTMENT')}
                    disabled={importing}
                  >
                    Department Only
                  </button>
                  <button
                    type="button"
                    className={`sd-seg-btn ${audience === 'ALL' ? 'is-active' : ''}`}
                    onClick={() => setAudience('ALL')}
                    disabled={importing}
                  >
                    All Company Users
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Empty State: Hero Drag & Drop Zone */}
            {stagedFiles.length === 0 ? (
              <div
                id="bulk-dropzone"
                className={`sd-bulk-hero-dropzone ${dragOver ? 'is-dragover' : ''} ${readingFiles ? 'is-loading' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFilesAdded(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                {readingFiles ? (
                  <>
                    <Loader2 size={48} className="sd-spin sd-text-accent" />
                    <h3 className="sd-bulk-hero-title">Reading &amp; analyzing files…</h3>
                    <p className="sd-bulk-hero-subtitle">Parsing placeholders and preparing batch staging</p>
                  </>
                ) : (
                  <>
                    <div className="sd-bulk-hero-icon-box">
                      <UploadCloud size={40} />
                    </div>
                    <h3 className="sd-bulk-hero-title">
                      Drag &amp; drop multiple files here, or browse
                    </h3>
                    <p className="sd-bulk-hero-subtitle">
                      Batch upload Word templates (.docx, .doc), Adobe PDFs (.pdf), and images (.png, .jpg, .webp) up to 50MB each.
                    </p>

                    <button
                      type="button"
                      className="sd-hero-browse-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <Plus size={18} /> Browse Computer Files
                    </button>

                    <div className="sd-bulk-format-chips">
                      <span className="sd-bulk-format-chip is-word">
                        <FileText size={13} /> Word Forms (.docx, .doc) — Auto-detects interactive fields
                      </span>
                      <span className="sd-bulk-format-chip is-pdf">
                        <Lock size={13} /> Adobe PDF (.pdf) — Secure reference document
                      </span>
                      <span className="sd-bulk-format-chip is-img">
                        <ImageIcon size={13} /> Images (.png, .jpg, .webp) — Drive document
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* 4. Active State: Staged Queue Console */
              <>
                {/* Summary & Toolbar Strip */}
                <div className="sd-bulk-summary-bar">
                  <div className="sd-bulk-summary-left">
                    <span className="sd-bulk-summary-count">
                      <span className="sd-bulk-summary-dot" />
                      {stagedFiles.length} Document{stagedFiles.length === 1 ? '' : 's'} Staged
                    </span>
                    <span className="sd-badge sd-badge-gray">
                      {formatSize(totalStagedSize)}
                    </span>
                    <span className="sd-bulk-summary-breakdown">
                      {[
                        wordCount > 0 ? `${wordCount} Word Form${wordCount > 1 ? 's' : ''}` : null,
                        pdfCount > 0 ? `${pdfCount} PDF${pdfCount > 1 ? 's' : ''}` : null,
                        imgCount > 0 ? `${imgCount} Image${imgCount > 1 ? 's' : ''}` : null
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>

                  {!importing && (
                    <div className="sd-btn-row">
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus size={12} /> Add More Files
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs sd-danger-hover"
                        onClick={() => setStagedFiles([])}
                      >
                        <Trash2 size={12} /> Clear All
                      </button>
                    </div>
                  )}
                </div>

                {/* Mini Drop Strip */}
                {!importing && (
                  <div
                    className={`sd-bulk-mini-dropzone ${dragOver ? 'is-dragover' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOver(false);
                      handleFilesAdded(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <UploadCloud size={15} />
                    <span>Drop additional files here to add to queue</span>
                  </div>
                )}

                {/* Two-Column Workspace */}
                <div className="sd-bulk-layout-grid">
                  {/* Left Column: Staged Files Table */}
                  <div className="sd-bulk-queue-col">
                    {duplicateConflicts.size > 0 && (
                      <div className="sd-alert sd-alert-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                          <span className="sd-small">
                            <strong>Duplicate files detected:</strong> {duplicateConflicts.size} file(s) already exist in this folder or are duplicated in this batch. Duplicate files are not allowed in the same folder.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={handleRemoveDuplicates}
                        >
                          Remove Duplicates ({duplicateConflicts.size})
                        </button>
                      </div>
                    )}
                    <div className="sd-bulk-table-card">
                      <div className="sd-bulk-table-container">
                        <table className="sd-table sd-bulk-table">
                          <thead>
                            <tr>
                              <th style={{ width: '48%' }}>Document Title &amp; Original File</th>
                              <th style={{ width: '22%' }}>Type</th>
                              <th style={{ width: '18%' }}>Size</th>
                              <th style={{ width: '12%', textAlign: 'center' }}>Remove</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stagedFiles.map((item) => {
                              const isWord = item.fileType === 'docx' || item.fileType === 'doc';
                              const isPdf = item.fileType === 'pdf';

                              return (
                                <tr key={item.id} className="sd-bulk-row">
                                  <td>
                                    <div className="sd-bulk-file-info">
                                      <div className={`sd-bulk-file-icon ${isWord ? 'sd-icon-word' : isPdf ? 'sd-icon-pdf' : 'sd-icon-img'}`}>
                                        {isWord ? <FileText size={17} /> : isPdf ? <FileText size={17} /> : <ImageIcon size={17} />}
                                      </div>
                                      <div className="sd-bulk-title-wrap">
                                        <input
                                          className={`sd-bulk-title-input ${duplicateConflicts.has(item.id) ? 'is-invalid' : ''}`}
                                          value={item.title}
                                          onChange={e => handleUpdateTitle(item.id, e.target.value)}
                                          disabled={importing}
                                          placeholder="Enter document title…"
                                          title="Click to edit document title"
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                          <span className="sd-bulk-filename" title={item.name}>
                                            {item.name}
                                          </span>
                                          {duplicateConflicts.has(item.id) && (
                                            <span className="sd-badge sd-badge-warn sd-badge-xs" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                                              <AlertTriangle size={10} style={{ marginRight: '3px' }} /> {duplicateConflicts.get(item.id)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <td>
                                    {isWord ? (
                                      <span className="sd-badge sd-badge-accent sd-badge-sm">
                                        ⚡ Word Form
                                      </span>
                                    ) : isPdf ? (
                                      <span className="sd-badge sd-badge-gray sd-badge-sm">
                                        <Lock size={10} /> Static PDF
                                      </span>
                                    ) : (
                                      <span className="sd-badge sd-badge-gray sd-badge-sm">
                                        <Lock size={10} /> Image Doc
                                      </span>
                                    )}
                                  </td>

                                  <td>
                                    <span className="sd-muted sd-small">{formatSize(item.size)}</span>
                                  </td>

                                  <td style={{ textAlign: 'center' }}>
                                    {!importing && (
                                      <button
                                        type="button"
                                        className="sd-icon-btn sd-icon-btn-sm sd-danger-hover"
                                        onClick={() => handleRemoveStaged(item.id)}
                                        title="Remove file from queue"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Settings & Draft Intake Summary */}
                  <div className="sd-bulk-settings-col">
                    {/* Draft Ingestion Mode Banner */}
                    <div className="sd-bulk-card" style={{ border: '1px solid rgba(234, 179, 8, 0.4)', background: 'rgba(234, 179, 8, 0.05)' }}>
                      <h4 className="sd-bulk-card-title" style={{ color: '#fbbf24' }}>
                        <FileEdit size={16} />
                        Draft Ingestion Mode
                      </h4>
                      <p className="sd-muted sd-small" style={{ lineHeight: 1.5, margin: '8px 0 0' }}>
                        All bulk imported documents are automatically saved as <strong>unpublished drafts</strong>.
                      </p>
                      <ul className="sd-muted sd-small" style={{ margin: '10px 0 0', paddingLeft: '18px', lineHeight: 1.6 }}>
                        <li>No approval workflow required upfront.</li>
                        <li>Safe and non-disruptive: hidden from general users until published.</li>
                        <li>Department admins can review, customize fields, attach approval workflows, and publish individually when ready.</li>
                      </ul>
                    </div>

                    <div className="sd-bulk-card">
                      <h4 className="sd-bulk-card-title">
                        <FolderInput size={15} className="sd-text-accent" />
                        Target Destination &amp; Defaults
                      </h4>
                      <div className="sd-kv-list" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span className="sd-muted">Department:</span>
                          <strong>{activeDept}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span className="sd-muted">Folder:</span>
                          <span>{getFolderLabel(folderId)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span className="sd-muted">Audience:</span>
                          <span>{audience === 'ALL' ? 'All Company Users' : 'Department Only'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                          <span className="sd-muted">Status:</span>
                          <span className="sd-badge sd-badge-warn sd-badge-xs">Draft · Unpublished</span>
                        </div>
                      </div>

                      <div className="sd-form-group" style={{ marginTop: 14 }}>
                        <label className="sd-label" htmlFor="bulk-expiry-input">
                          Default Decision Deadline (Days)
                        </label>
                        <input
                          id="bulk-expiry-input"
                          type="number"
                          min="1"
                          max="365"
                          className="sd-input sd-input-sm"
                          value={expiryDays}
                          disabled={importing}
                          onChange={e => setExpiryDays(e.target.value)}
                        />
                        <span className="sd-field-hint">Initial submission deadline assigned when forms are eventually published.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
