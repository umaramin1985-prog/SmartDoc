import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { Modal, downloadBlob } from './ui';
import { Download, Printer, Loader2, Lock, FileText, Image as ImageIcon, FileDown } from 'lucide-react';
import { printWordDocument, printImageDocument } from '../utils/wordPrintEngine';
import { exportWordToPdf } from '../utils/pdfExportEngine';
import { FillFormModal } from './FillFormModal';

// Renders .docx, .pdf, or image in the browser, with download & authentic Word print
export const DocumentPreviewModal = () => {
  const { documentPreview, closeDocumentPreview, addToast, formSubmissions, formTemplates } = useApp();
  const containerRef = useRef(null);
  const blobRef = useRef(null);
  const [objectUrl, setObjectUrl] = useState(null);
  const [fileType, setFileType] = useState('docx');
  const [state, setState] = useState({ loading: true, error: '' });
  const [printing, setPrinting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgressText, setPdfProgressText] = useState('');

  useEffect(() => {
    if (!documentPreview || documentPreview.kind === 'submission') {
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
          if (containerRef.current) {
            containerRef.current.innerHTML = '';
            await renderAsync(blob, containerRef.current, undefined, {
              inWrapper: true, breakPages: true, useBase64URL: true, ignoreLastRenderedPageBreak: true
            });
          }
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

  // If previewing a submission, delegate to authentic form sheet
  if (documentPreview.kind === 'submission') {
    const sub = formSubmissions?.find(x => String(x.id) === String(documentPreview.id));
    const tmpl = formTemplates?.find(t => String(t.id) === String(sub?.templateId));
    if (sub) {
      return (
        <FillFormModal
          template={tmpl || {
            id: sub.templateId,
            title: sub.title,
            department: sub.department,
            fields: sub.fields || Object.keys(sub.formData || {}).map(k => ({ key: k, label: k })),
            workflow: sub.workflow
          }}
          submission={sub}
          isViewOnly={true}
          onClose={closeDocumentPreview}
        />
      );
    }
  }

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

  const handleDownloadPdf = async () => {
    if (fileType === 'pdf') {
      downloadBlob(blobRef.current, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
      return;
    }

    if (!blobRef.current && !containerRef.current) return;

    try {
      setExportingPdf(true);
      setPdfProgressText('Initializing PDF export…');
      addToast?.('Exporting PDF', 'Converting Word document to high-resolution PDF...', 'info');

      // Prefer clean blob for pristine isolated rendering
      const target = blobRef.current || containerRef.current;

      await exportWordToPdf(target, fileName, (progress) => {
        setPdfProgressText(progress.status || 'Generating PDF…');
      });

      const outName = fileName.replace(/\.docx?$/i, '') + '.pdf';
      addToast?.('PDF Saved', `Successfully downloaded "${outName}"`, 'success');
    } catch (err) {
      console.error('PDF Export Error:', err);
      addToast?.('PDF Export Failed', err.message || 'Could not export document as PDF', 'error');
    } finally {
      setExportingPdf(false);
      setPdfProgressText('');
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
            disabled={state.loading || !!state.error || printing || exportingPdf}
            onClick={handlePrint}
            title="Print authentic Word document just like printing in Microsoft Word"
          >
            {printing ? <Loader2 size={15} className="sd-spin" /> : <Printer size={15} />}
            <span>{printing ? 'Preparing…' : 'Print Word Document'}</span>
          </button>

          {/* For Word documents (.doc/.docx), offer both Save as PDF and Download .docx */}
          {fileType === 'docx' ? (
            <>
              <button
                id="btn-download-pdf"
                className="btn btn-secondary"
                disabled={state.loading || !!state.error || exportingPdf}
                onClick={handleDownloadPdf}
                title="Convert and save this document as a PDF file"
              >
                {exportingPdf ? <Loader2 size={15} className="sd-spin" /> : <FileDown size={15} />}
                <span>{exportingPdf ? (pdfProgressText || 'Saving PDF…') : 'Save as PDF'}</span>
              </button>
              <button
                id="btn-download-doc"
                className="btn btn-primary"
                disabled={state.loading || !!state.error || exportingPdf}
                onClick={() => downloadBlob(blobRef.current, fileName)}
                title="Download original Microsoft Word (.docx) document"
              >
                <Download size={15} />
                <span>Download .docx</span>
              </button>
            </>
          ) : (
            <button
              id="btn-download-doc"
              className="btn btn-primary"
              disabled={state.loading || !!state.error}
              onClick={() => downloadBlob(blobRef.current, fileName)}
            >
              <Download size={15} /> Download {fileType === 'pdf' ? '.pdf' : 'Image'}
            </button>
          )}
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
