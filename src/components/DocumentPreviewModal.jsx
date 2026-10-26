import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { Modal, downloadBlob } from './ui';
import { Download, Printer, Loader2, Lock, FileText, Image as ImageIcon } from 'lucide-react';
import { printWordDocument, printImageDocument } from '../utils/wordPrintEngine';

// Renders .docx, .pdf, or image in the browser, with download & authentic Word print
export const DocumentPreviewModal = () => {
  const { documentPreview, closeDocumentPreview, addToast } = useApp();
  const containerRef = useRef(null);
  const blobRef = useRef(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const [fileType, setFileType] = useState('docx');
  const [state, setState] = useState({ loading: true, error: '' });
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!documentPreview) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
      return;
    }

    let cancelled = false;
    setState({ loading: true, error: '' });

    const fn = String(documentPreview.fileName || '').toLowerCase();
    let detected = documentPreview.fileType;
    if (!detected) {
      if (fn.endsWith('.pdf')) detected = 'pdf';
      else if (/\.(png|jpe?g|webp|gif)$/i.test(fn)) detected = 'image';
      else detected = 'docx';
    }
    setFileType(detected);

    const load = documentPreview.kind === 'template'
      ? apiService.getTemplateFile(documentPreview.id)
      : apiService.getSubmissionDocument(documentPreview.id);

    load
      .then(async (blob) => {
        if (cancelled) return;
        blobRef.current = blob;

        if (detected === 'pdf' || detected === 'image') {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setState({ loading: false, error: '' });
        } else {
          // .docx rendering
          containerRef.current.innerHTML = '';
          await renderAsync(blob, containerRef.current, undefined, {
            inWrapper: true, breakPages: true, useBase64URL: true, ignoreLastRenderedPageBreak: true
          });
          if (!cancelled) setState({ loading: false, error: '' });
        }
      })
      .catch(err => { if (!cancelled) setState({ loading: false, error: err.message }); });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentPreview]);

  if (!documentPreview) return null;

  const defaultExt = fileType === 'pdf' ? '.pdf' : fileType === 'image' ? '.png' : '.docx';
  const fileName = documentPreview.fileName || `${documentPreview.title || 'document'}${defaultExt}`;
  const isNonEditable = fileType === 'pdf' || fileType === 'image';

  const handlePrint = async () => {
    if (fileType === 'pdf' && objectUrl) {
      const win = window.open(objectUrl, '_blank');
      win?.focus();
      return;
    }

    if (fileType === 'image' && objectUrl) {
      printImageDocument(objectUrl, fileName);
      return;
    }

    if (blobRef.current) {
      try {
        setPrinting(true);
        addToast?.('Preparing Word Document', 'Formatting document with Microsoft Word typography and margins...', 'info');
        await printWordDocument(blobRef.current, { title: fileName });
      } catch (err) {
        console.error('Word Print Error:', err);
        addToast?.('Print Failed', err.message || 'Could not print Word document', 'error');
      } finally {
        setPrinting(false);
      }
    }
  };

  const getSubtitle = () => {
    if (fileType === 'pdf') return 'Static PDF Document · Read-only (Non-editable)';
    if (fileType === 'image') return 'Static Image Document · Read-only (Non-editable)';
    return documentPreview.kind === 'template' ? 'Blank Word template' : 'Filled Word document with signatures';
  };

  return (
    <Modal
      id="document-preview-modal"
      size="full"
      title={
        <div className="sd-preview-title-wrap">
          <span>{documentPreview.title || 'Document'}</span>
          {isNonEditable && (
            <span className="sd-badge sd-badge-gray sd-badge-sm">
              <Lock size={12} /> Non-editable {fileType.toUpperCase()}
            </span>
          )}
        </div>
      }
      subtitle={getSubtitle()}
      onClose={closeDocumentPreview}
      footer={
        <>
          <button className="btn btn-secondary" onClick={closeDocumentPreview}>Close</button>
          <button
            id="btn-print-preview-doc"
            className="btn btn-secondary"
            disabled={state.loading || !!state.error || printing}
            onClick={handlePrint}
            title="Print authentic Word document just like printing in Microsoft Word"
          >
            {printing ? <Loader2 size={15} className="sd-spin" /> : <Printer size={15} />}
            <span>{printing ? 'Preparing…' : 'Print Word Document'}</span>
          </button>
          <button
            id="btn-download-doc"
            className="btn btn-primary"
            disabled={state.loading || !!state.error}
            onClick={() => downloadBlob(blobRef.current, fileName)}
          >
            <Download size={15} /> Download {fileType === 'pdf' ? '.pdf' : fileType === 'image' ? 'Image' : '.docx'}
          </button>
        </>
      }
    >
      {state.loading && (
        <div className="sd-loading"><Loader2 size={20} className="sd-spin" /> Preparing document…</div>
      )}
      {state.error && <div className="sd-alert sd-alert-error">{state.error}</div>}

      {/* Non-editable alert banner for PDF and Images */}
      {isNonEditable && !state.loading && !state.error && (
        <div className="sd-alert sd-alert-info sd-preview-banner">
          <Lock size={15} />
          <span>
            <strong>Static Document:</strong> This is a {fileType.toUpperCase()} file and is not editable. You can view, print, or download this file.
          </span>
        </div>
      )}

      {/* PDF View */}
      {fileType === 'pdf' && objectUrl && !state.loading && (
        <div className="sd-pdf-viewer-wrap">
          <iframe
            src={objectUrl}
            title={documentPreview.title || 'PDF Preview'}
            className="sd-pdf-iframe"
          />
        </div>
      )}

      {/* Image View */}
      {fileType === 'image' && objectUrl && !state.loading && (
        <div className="sd-image-preview-wrap">
          <img
            src={objectUrl}
            alt={documentPreview.title || 'Preview'}
            className="sd-image-preview-content"
          />
        </div>
      )}

      {/* Docx View */}
      <div
        ref={containerRef}
        className="sd-docx-host"
        style={{ display: fileType === 'docx' ? 'block' : 'none' }}
      />
    </Modal>
  );
};
