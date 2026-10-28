import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Modal } from './ui';
import {
  PenLine, Camera, Eraser, Save, Trash2, Check, PenTool, Type, Upload,
  RefreshCw, CheckCircle2, ZoomIn, ZoomOut, Palette, ShieldCheck, Download, Copy, FileText, Lock,
  Sun, Moon
} from 'lucide-react';
import { ACCENT_COLORS } from './ColorThemePicker';

const W = 504;
const H = 180;

const INK_COLORS = [
  { id: 'navy', label: 'Navy Blue', hex: '#0f1f4b' },
  { id: 'black', label: 'Classic Black', hex: '#111827' }
];

const CURSIVE_FONTS = [
  { id: 'great-vibes', label: 'Executive Script', family: "'Great Vibes', cursive", size: 46 },
  { id: 'dancing-script', label: 'Modern Calligraphy', family: "'Dancing Script', cursive", size: 40 },
  { id: 'caveat', label: 'Natural Pen', family: "'Caveat', cursive", size: 44 },
  { id: 'sacramento', label: 'Classic Monoline', family: "'Sacramento', cursive", size: 44 }
];

/**
 * Filter paper background to pure transparency and darken ink
 */
function processPaperBackground(img, threshold = 185, inkColorId = 'navy') {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const isNavy = inkColorId === 'navy';

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

    if (brightness > threshold) {
      data[i + 3] = 0; // Pure transparent paper
    } else {
      const alpha = Math.min(255, Math.max(0, ((threshold - brightness) / (threshold * 0.35)) * 255));
      data[i + 3] = Math.round(alpha);

      if (isNavy) {
        data[i] = 15;
        data[i + 1] = 31;
        data[i + 2] = 75;
      } else {
        data[i] = 17;
        data[i + 1] = 24;
        data[i + 2] = 39;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Render typed cursive text to a clean 504x180 transparent PNG Data URL
 */
function renderTypedSignature(name, fontObj, inkHex, width = W, height = H) {
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(2, 2);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = inkHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let adjustedSize = fontObj.size;
  if (name.length > 24) adjustedSize = Math.round(fontObj.size * 0.7);
  else if (name.length > 16) adjustedSize = Math.round(fontObj.size * 0.85);

  ctx.font = `${adjustedSize}px ${fontObj.family}, cursive`;
  ctx.fillText(name, width / 2, height / 2 - 4);

  return canvas.toDataURL('image/png');
}

/**
 * Fit and scale an uploaded image onto a 504x180 transparent canvas
 */
function fitUploadedSignature(processedCanvas, width = W, height = H) {
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(2, 2);

  ctx.clearRect(0, 0, width, height);

  const pad = 16;
  const maxW = width - pad * 2;
  const maxH = height - pad * 2;

  const scale = Math.min(maxW / processedCanvas.width, maxH / processedCanvas.height, 1);
  const drawW = processedCanvas.width * scale;
  const drawH = processedCanvas.height * scale;
  const drawX = (width - drawW) / 2;
  const drawY = (height - drawH) / 2;

  ctx.drawImage(processedCanvas, drawX, drawY, drawW, drawH);
  return canvas.toDataURL('image/png');
}

/**
 * Helper to center-crop, scale, and encode an image to a clean 1:1 square Data URL.
 */
function processImageToSquare(imgElement, zoom = 1, offsetX = 0, offsetY = 0, targetSize = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const naturalWidth = imgElement.naturalWidth || imgElement.width;
  const naturalHeight = imgElement.naturalHeight || imgElement.height;

  const minDim = Math.min(naturalWidth, naturalHeight);
  const cropSize = minDim / zoom;

  const centerX = naturalWidth / 2 + offsetX;
  const centerY = naturalHeight / 2 + offsetY;

  const sx = Math.max(0, Math.min(naturalWidth - cropSize, centerX - cropSize / 2));
  const sy = Math.max(0, Math.min(naturalHeight - cropSize, centerY - cropSize / 2));

  ctx.drawImage(imgElement, sx, sy, cropSize, cropSize, 0, 0, targetSize, targetSize);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export const ProfileAndSignatureModal = () => {
  const {
    isProfileModalOpen,
    isSignatureModalOpen,
    closeProfileModal,
    closeSignatureModal,
    profileModalTargetUser,
    profileModalInitialTab,
    currentUser,
    saveSignature,
    saveAvatar,
    accentColor,
    setAccentColor,
    theme = 'dark',
    setTheme,
    getPkiCertificate,
    generatePkiCertificate,
    addToast
  } = useApp();

  const isOpen = isProfileModalOpen || isSignatureModalOpen;
  const targetUser = profileModalTargetUser;
  const user = targetUser || currentUser;
  const isSelf = !targetUser || targetUser.id === currentUser?.id;

  // Active top-level tab ('signature' | 'pki' | 'photo' | 'color')
  const [activeTab, setActiveTab] = useState('signature');

  // --- PKI Certificate State ---
  const [pkiData, setPkiData] = useState(null);
  const [loadingPki, setLoadingPki] = useState(false);
  const [renewingPki, setRenewingPki] = useState(false);
  const [showPem, setShowPem] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  useEffect(() => {
    if (isOpen && user?.id) {
      setLoadingPki(true);
      getPkiCertificate(user.id)
        .then(data => setPkiData(data))
        .catch(err => console.error('[PKI]', err))
        .finally(() => setLoadingPki(false));
    }
  }, [isOpen, user?.id, getPkiCertificate]);

  const handleRenewPki = async () => {
    setRenewingPki(true);
    try {
      const res = await generatePkiCertificate(user.id);
      if (res) {
        setPkiData(prev => ({ ...prev, ...res, hasCertificate: true }));
      }
    } finally {
      setRenewingPki(false);
    }
  };

  const handleCopyFingerprint = () => {
    if (pkiData?.fingerprint) {
      navigator.clipboard.writeText(pkiData.fingerprint);
      setCopiedFingerprint(true);
      setTimeout(() => setCopiedFingerprint(false), 2000);
      addToast('Fingerprint Copied', 'SHA-256 certificate fingerprint copied to clipboard', 'info');
    }
  };

  // --- Signature State ---
  const [sigMode, setSigMode] = useState('draw'); // 'draw' | 'type' | 'upload'
  const [selectedColor, setSelectedColor] = useState('navy');
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const [isEmptyDraw, setIsEmptyDraw] = useState(true);

  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(CURSIVE_FONTS[0].id);

  const uploadInputRef = useRef(null);
  const [rawUploadImg, setRawUploadImg] = useState(null);
  const [processedUploadUrl, setProcessedUploadUrl] = useState(null);
  const [threshold, setThreshold] = useState(190);
  const [isSigDragging, setIsSigDragging] = useState(false);
  const [savingSig, setSavingSig] = useState(false);

  // --- Photo State ---
  const photoInputRef = useRef(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const [rawPhotoImage, setRawPhotoImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  // Synchronize initial tab and data on modal open
  useEffect(() => {
    if (isOpen) {
      if (!isSelf) {
        // If editing another user, only photo tab is available
        setActiveTab('photo');
      } else if (profileModalInitialTab) {
        setActiveTab(['photo', 'signature', 'pki', 'color'].includes(profileModalInitialTab) ? profileModalInitialTab : 'signature');
      } else if (isSignatureModalOpen && !isProfileModalOpen) {
        setActiveTab('signature');
      }

      // Initialize signature states
      setSigMode('draw');
      setSelectedColor('navy');
      setTypedName(currentUser?.name || '');
      setSelectedFont(CURSIVE_FONTS[0].id);
      setRawUploadImg(null);
      setProcessedUploadUrl(null);
      setThreshold(190);

      setTimeout(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, W, H);
          setIsEmptyDraw(true);
        }
      }, 60);

      // Initialize photo states
      if (user) {
        setPreviewPhotoUrl(user.avatar || null);
        setRawPhotoImage(null);
        setZoom(1);
        setPhotoChanged(false);
        setPhotoRemoved(false);
      }
    }
  }, [isOpen, isSelf, profileModalInitialTab, isSignatureModalOpen, isProfileModalOpen, user?.id]);

  // Update processed signature upload
  useEffect(() => {
    if (rawUploadImg) {
      const processedCanvas = processPaperBackground(rawUploadImg, threshold, selectedColor);
      const fittedUrl = fitUploadedSignature(processedCanvas, W, H);
      setProcessedUploadUrl(fittedUrl);
    }
  }, [rawUploadImg, threshold, selectedColor]);

  if (!isOpen || !user) return null;

  const handleClose = () => {
    closeProfileModal?.();
    closeSignatureModal?.();
  };

  const activeColorObj = INK_COLORS.find(c => c.id === selectedColor) || INK_COLORS[0];
  const activeFontObj = CURSIVE_FONTS.find(f => f.id === selectedFont) || CURSIVE_FONTS[0];

  // ==================== Freehand Draw Handlers ====================
  const getCanvasPoint = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const rw = rect.width || W;
    const rh = rect.height || H;
    return {
      x: (e.clientX - rect.left) * (W / rw),
      y: (e.clientY - rect.top) * (H / rh)
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    try {
      canvasRef.current?.setPointerCapture?.(e.pointerId);
    } catch (_) {}
    drawing.current = true;
    const p = getCanvasPoint(e);
    lastPoint.current = p;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = activeColorObj.hex;
    ctx.fillStyle = activeColorObj.hex;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    setIsEmptyDraw(false);
  };

  const moveDraw = (e) => {
    if (!drawing.current) return;
    const p = getCanvasPoint(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = activeColorObj.hex;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    setIsEmptyDraw(false);
  };

  const endDraw = (e) => {
    if (drawing.current) {
      drawing.current = false;
      try {
        if (e?.pointerId) canvasRef.current?.releasePointerCapture?.(e.pointerId);
      } catch (_) {}
    }
  };

  const clearDraw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, W, H);
    setIsEmptyDraw(true);
  };

  // ==================== Signature Save / Remove ====================
  const canSaveSig = () => {
    if (sigMode === 'draw') return !isEmptyDraw;
    if (sigMode === 'type') return typedName.trim().length > 0;
    if (sigMode === 'upload') return !!processedUploadUrl;
    return false;
  };

  const handleSaveSignature = async () => {
    if (!canSaveSig()) return;
    setSavingSig(true);
    let pngDataUrl = null;

    try {
      if (sigMode === 'draw') {
        pngDataUrl = canvasRef.current?.toDataURL('image/png');
      } else if (sigMode === 'type') {
        pngDataUrl = renderTypedSignature(typedName.trim(), activeFontObj, activeColorObj.hex, W, H);
      } else if (sigMode === 'upload') {
        pngDataUrl = processedUploadUrl;
      }

      if (pngDataUrl) {
        const ok = await saveSignature(pngDataUrl);
        if (ok) handleClose();
      }
    } finally {
      setSavingSig(false);
    }
  };

  const handleRemoveSignature = async () => {
    setSavingSig(true);
    try {
      const ok = await saveSignature(null);
      if (ok) {
        clearDraw();
        setRawUploadImg(null);
        setProcessedUploadUrl(null);
      }
    } finally {
      setSavingSig(false);
    }
  };

  // ==================== Signature Upload & Photo Handlers ====================
  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Invalid File', 'Please select a valid image file (PNG, JPEG, WebP).', 'warning');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      addToast('File Too Large', 'Please choose a signature image smaller than 8MB.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setRawUploadImg(img);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoSelect = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Invalid File', 'Please select a valid image file (JPEG, PNG, WebP).', 'warning');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      addToast('File Too Large', 'The selected image is larger than 8MB. Please choose a smaller photo.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        setRawPhotoImage(img);
        setZoom(1);
        const processed = processImageToSquare(img, 1, 0, 0, 256);
        setPreviewPhotoUrl(processed || dataUrl);
        setPhotoChanged(true);
        setPhotoRemoved(false);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleZoomChange = (newZoom) => {
    setZoom(newZoom);
    if (rawPhotoImage) {
      const processed = processImageToSquare(rawPhotoImage, newZoom, 0, 0, 256);
      if (processed) {
        setPreviewPhotoUrl(processed);
        setPhotoChanged(true);
      }
    }
  };

  const handleRemovePhoto = () => {
    setPreviewPhotoUrl(null);
    setRawPhotoImage(null);
    setPhotoChanged(true);
    setPhotoRemoved(true);
  };

  const handleResetPhoto = () => {
    setPreviewPhotoUrl(user.avatar || null);
    setRawPhotoImage(null);
    setZoom(1);
    setPhotoChanged(false);
    setPhotoRemoved(false);
  };

  const handleSavePhoto = async () => {
    setSavingPhoto(true);
    try {
      const avatarPayload = photoRemoved ? null : previewPhotoUrl;
      await saveAvatar(avatarPayload, user.id);
      handleClose();
    } finally {
      setSavingPhoto(false);
    }
  };

  const initialsStr = (user.name || '?')
    .trim()
    .split(/\s+/)
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const modalTitle = !isSelf ? `Profile Picture — ${user.name}` : 'Profile & Signature';
  const modalSubtitle = !isSelf
    ? 'Update employee profile photo displayed across workflows and directory.'
    : activeTab === 'signature'
    ? 'Create your official digital signature. It is stamped automatically when you submit or approve forms.'
    : activeTab === 'pki'
    ? 'Cryptographic Public Key Infrastructure (PKI) X.509 Certificate and RSA 2048-bit key pair for legal, tamper-evident document sealing.'
    : activeTab === 'photo'
    ? 'Personalize your avatar displayed on comments, messages, approvals, and reviews.'
    : 'Choose your app accent color: current green (default), red, orange, purple, or blue.';

  return (
    <Modal
      id="profile-signature-modal"
      title={modalTitle}
      subtitle={modalSubtitle}
      onClose={handleClose}
      size="lg"
      footer={
        activeTab === 'signature' ? (
          <>
            {currentUser?.signatureImage && (
              <button
                type="button"
                className="btn btn-secondary sd-mr-auto"
                onClick={handleRemoveSignature}
                disabled={savingSig}
              >
                <Trash2 size={15} /> Remove saved
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={savingSig}
            >
              Cancel
            </button>
            {sigMode === 'draw' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearDraw}
                disabled={savingSig || isEmptyDraw}
              >
                <Eraser size={15} /> Clear
              </button>
            )}
            <button
              id="btn-save-signature"
              type="button"
              className="btn btn-primary"
              onClick={handleSaveSignature}
              disabled={savingSig || !canSaveSig()}
            >
              <Save size={15} /> {savingSig ? 'Saving…' : 'Save signature'}
            </button>
          </>
        ) : activeTab === 'photo' ? (
          <div className="sd-profile-modal-footer">
            <div className="sd-profile-modal-footer-left">
              {photoChanged && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleResetPhoto}
                  disabled={savingPhoto}
                >
                  <RefreshCw size={14} /> Reset
                </button>
              )}
            </div>
            <div className="sd-profile-modal-footer-right">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={savingPhoto}
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-save-avatar"
                className="btn btn-primary"
                onClick={handleSavePhoto}
                disabled={savingPhoto || !photoChanged}
              >
                {savingPhoto ? (
                  <>Saving…</>
                ) : (
                  <>
                    <Check size={16} /> Save Photo
                  </>
                )}
              </button>
            </div>
          </div>
        ) : activeTab === 'pki' ? (
          <div className="sd-profile-modal-footer" style={{ width: '100%' }}>
            <div className="sd-profile-modal-footer-left">
              <a
                href={`/api/users/${user.id}/pki-certificate/download`}
                download={`${user.username}_smartdoc.crt`}
                className="btn btn-secondary"
                id="btn-download-cert-footer"
              >
                <Download size={14} /> Download .crt
              </a>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRenewPki}
                disabled={renewingPki}
                id="btn-renew-cert-footer"
              >
                <RefreshCw size={14} className={renewingPki ? 'spin' : ''} /> {renewingPki ? 'Generating…' : 'Renew Certificate'}
              </button>
            </div>
            <div className="sd-profile-modal-footer-right">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleClose}
              >
                <Check size={16} /> Done
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleClose}
          >
            <Check size={16} /> Done
          </button>
        )
      }
    >
      {/* Top Primary Tabs (Only visible when managing own profile) */}
      {isSelf && (
        <div className="sd-sig-tabs" style={{ marginBottom: '18px' }} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'signature'}
            className={`sd-sig-tab ${activeTab === 'signature' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('signature')}
          >
            <PenLine size={15} />
            <span>Digital Signature</span>
            {!currentUser?.hasSignature && (
              <span className="sd-badge sd-badge-amber sd-badge-xs" style={{ marginLeft: '4px' }}>Not set</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pki'}
            className={`sd-sig-tab ${activeTab === 'pki' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('pki')}
          >
            <ShieldCheck size={15} />
            <span>PKI Certificate</span>
            <span
              className="sd-badge sd-badge-xs"
              style={{
                marginLeft: '4px',
                background: 'color-mix(in srgb, var(--primary-500) 18%, transparent)',
                color: 'var(--primary-500)',
                border: '1px solid color-mix(in srgb, var(--primary-500) 35%, transparent)'
              }}
            >
              X.509
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'photo'}
            className={`sd-sig-tab ${activeTab === 'photo' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('photo')}
          >
            <Camera size={15} />
            <span>Profile Photo</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'color'}
            className={`sd-sig-tab ${activeTab === 'color' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('color')}
          >
            <Palette size={15} />
            <span>Theme Color</span>
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 1: DIGITAL SIGNATURE                                  */}
      {/* ============================================================== */}
      {activeTab === 'signature' && (
        <div className="animate-fade-in">
          {/* Currently Saved Signature Alert */}
          {currentUser?.signatureImage && (
            <div className="sd-sig-current-banner">
              <div className="sd-sig-current-info">
                <span className="sd-sig-current-label">Currently Saved Signature</span>
                <div className="sd-sig-current-thumb">
                  <img src={currentUser.signatureImage} alt="Saved signature" />
                </div>
              </div>
              <span className="sd-badge sd-badge-green">
                <CheckCircle2 size={12} /> Active in workflows
              </span>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="sd-sig-tabs-bar">
            <div className="sd-sig-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={sigMode === 'draw'}
                className={`sd-sig-tab ${sigMode === 'draw' ? 'is-active' : ''}`}
                onClick={() => setSigMode('draw')}
              >
                <PenTool size={15} /> Draw Freehand
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sigMode === 'type'}
                className={`sd-sig-tab ${sigMode === 'type' ? 'is-active' : ''}`}
                onClick={() => setSigMode('type')}
              >
                <Type size={15} /> Type to Sign
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sigMode === 'upload'}
                className={`sd-sig-tab ${sigMode === 'upload' ? 'is-active' : ''}`}
                onClick={() => setSigMode('upload')}
              >
                <Upload size={15} /> Upload Scan
              </button>
            </div>

            {/* Ink Color Selector */}
            <div className="sd-sig-color-toggle" title="Ink Color">
              <span className="sd-sig-color-label">Ink:</span>
              {INK_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`sd-sig-color-dot ${selectedColor === c.id ? 'is-active' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setSelectedColor(c.id)}
                  title={`${c.label} Ink`}
                />
              ))}
            </div>
          </div>

          {/* Draw Mode */}
          {sigMode === 'draw' && (
            <div className="sd-sig-section animate-fade-in">
              <div className="sd-sig-canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  width={W}
                  height={H}
                  className="sd-signature-canvas"
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                />
                <div className="sd-sig-baseline" />
                <span className="sd-sig-sign-indicator">Sign above the line</span>
              </div>
              <div className="sd-sig-hint-row">
                <span className="sd-hint">Use mouse, touchpad, pen stylus, or touch screen.</span>
                {!isEmptyDraw && (
                  <span className="sd-text-good sd-small">✓ Signature captured</span>
                )}
              </div>
            </div>
          )}

          {/* Type Mode */}
          {sigMode === 'type' && (
            <div className="sd-sig-section animate-fade-in">
              <div className="sd-field sd-mb-sm">
                <label htmlFor="input-sig-typed-name" className="sd-label">Full Name or Initials</label>
                <input
                  id="input-sig-typed-name"
                  type="text"
                  className="sd-input"
                  placeholder="e.g. John Doe"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  maxLength={40}
                  autoFocus
                />
              </div>

              <div className="sd-sig-font-grid">
                {CURSIVE_FONTS.map(f => (
                  <div
                    key={f.id}
                    className={`sd-sig-font-card ${selectedFont === f.id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedFont(f.id)}
                  >
                    <div className="sd-sig-font-meta">
                      <span className="sd-sig-font-name">{f.label}</span>
                      {selectedFont === f.id && <Check size={14} className="sd-text-primary" />}
                    </div>
                    <div
                      className="sd-sig-font-preview"
                      style={{
                        fontFamily: f.family,
                        fontSize: `${Math.round(f.size * 0.72)}px`,
                        color: activeColorObj.hex
                      }}
                    >
                      {typedName.trim() || 'Your Signature'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Mode */}
          {sigMode === 'upload' && (
            <div className="sd-sig-section animate-fade-in">
              <div
                className={`sd-sig-dropzone ${isSigDragging ? 'is-dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsSigDragging(true); }}
                onDragLeave={() => setIsSigDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsSigDragging(false);
                  if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                }}
                onClick={() => uploadInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={uploadInputRef}
                  style={{ display: 'none' }}
                  accept="image/png, image/jpeg, image/jpg, image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                  }}
                />
                <div className="sd-sig-dropzone-icon">
                  <Upload size={22} />
                </div>
                <div className="sd-sig-dropzone-text">
                  <strong>Click to upload</strong> or drag and drop a signature photo
                </div>
                <div className="sd-sig-dropzone-hint">
                  Photo of your pen signature on white paper. Paper is automatically converted to clean transparency.
                </div>
              </div>

              {processedUploadUrl && (
                <div className="sd-sig-processed-preview-wrap">
                  <div className="sd-sig-processed-preview">
                    <img src={processedUploadUrl} alt="Processed signature" />
                    <div className="sd-sig-baseline" />
                  </div>
                  <div className="sd-sig-threshold-slider-wrap">
                    <label htmlFor="sig-threshold-slider">Clean paper threshold:</label>
                    <input
                      id="sig-threshold-slider"
                      type="range"
                      min="120"
                      max="240"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="sd-range-slider"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 2: PROFILE PHOTO                                      */}
      {/* ============================================================== */}
      {activeTab === 'photo' && (
        <div className="sd-profile-dialog animate-fade-in">
          {/* User Card Header */}
          <div className="sd-profile-hero">
            <div className="sd-profile-avatar-wrap">
              <div className={`sd-profile-large-avatar ${previewPhotoUrl ? 'has-image' : ''}`}>
                {previewPhotoUrl ? (
                  <img src={previewPhotoUrl} alt={user.name} className="sd-profile-large-img" />
                ) : (
                  <span className="sd-profile-large-initials">{initialsStr}</span>
                )}
              </div>
              <button
                type="button"
                className="sd-profile-avatar-camera-btn"
                onClick={() => photoInputRef.current?.click()}
                title="Upload new photo"
              >
                <Camera size={16} />
              </button>
            </div>

            <div className="sd-profile-hero-meta">
              <h3 className="sd-profile-name">{user.name}</h3>
              <div className="sd-profile-sub">
                <span className="sd-profile-username">@{user.username}</span>
                <span className="sd-profile-dot">·</span>
                <span className="sd-profile-dept">{user.department}</span>
              </div>
              <div className="sd-profile-badges">
                <span className="sd-badge sd-badge-accent">
                  {user.systemRole === 'superadmin'
                    ? 'Super Administrator'
                    : user.systemRole === 'admin'
                    ? 'Department Admin'
                    : 'User'}
                </span>
                {previewPhotoUrl ? (
                  <span className="sd-badge sd-badge-green">Custom Photo</span>
                ) : (
                  <span className="sd-badge sd-badge-gray">Initials Placeholder</span>
                )}
              </div>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            className={`sd-profile-dropzone ${isPhotoDragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsPhotoDragging(true);
            }}
            onDragLeave={() => setIsPhotoDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsPhotoDragging(false);
              if (e.dataTransfer.files?.[0]) {
                handlePhotoSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => photoInputRef.current?.click()}
          >
            <input
              type="file"
              ref={photoInputRef}
              style={{ display: 'none' }}
              accept="image/png, image/jpeg, image/jpg, image/webp"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handlePhotoSelect(e.target.files[0]);
                }
              }}
            />
            <div className="sd-profile-dropzone-icon">
              <Upload size={22} />
            </div>
            <div className="sd-profile-dropzone-text">
              <strong>Click to upload</strong> or drag and drop your photo
            </div>
            <div className="sd-profile-dropzone-hint">
              PNG, JPG, or WebP · High-resolution square recommended
            </div>
          </div>

          {/* Zoom adjustment when an image is staged */}
          {rawPhotoImage && (
            <div className="sd-profile-zoom-bar">
              <ZoomOut size={16} className="sd-muted" />
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.05"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="sd-profile-zoom-slider"
                title="Adjust crop zoom"
              />
              <ZoomIn size={16} className="sd-muted" />
              <span className="sd-profile-zoom-val">{Math.round(zoom * 100)}%</span>
            </div>
          )}

          {/* Quick action buttons */}
          <div className="sd-profile-actions-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => photoInputRef.current?.click()}
            >
              <Upload size={14} /> Choose Different Image
            </button>
            {previewPhotoUrl && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={handleRemovePhoto}
                title="Remove photo and revert to initials"
              >
                <Trash2 size={14} /> Remove Photo
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 3: APP THEME COLOR                                    */}
      {/* ============================================================== */}
      {activeTab === 'color' && (
        <div className="animate-fade-in" style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
              Appearance Mode
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Switch between Pure Black Dark Mode and Crisp Light Mode.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { id: 'dark', label: 'Dark Mode', desc: 'Pure Black OLED Workspace', icon: Moon },
                { id: 'light', label: 'Light Mode', desc: 'Crisp Daylight Paper Workspace', icon: Sun }
              ].map((m) => {
                const isSelected = theme === m.id;
                const ModeIcon = m.icon;
                return (
                  <button
                    key={m.id}
                    id={`btn-modal-mode-${m.id}`}
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-lg)',
                      border: `1px solid ${isSelected ? 'var(--primary-500)' : 'var(--border-color)'}`,
                      background: isSelected ? 'color-mix(in srgb, var(--primary-500) 12%, transparent)' : 'var(--bg-card-subtle)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--text-main)',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => setTheme(m.id)}
                  >
                    <span
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: m.id === 'dark' ? '#0a0a0a' : '#f8fafc',
                        color: m.id === 'dark' ? '#f4f4f5' : '#0f172a',
                        border: '1px solid var(--border-color)',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0
                      }}
                    >
                      <ModeIcon size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.label}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.desc}</span>
                    </div>
                    {isSelected && <Check size={18} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
              Choose App Accent Color
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Select your personalized accent color. Current green is active by default.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {ACCENT_COLORS.map(c => {
              const isSelected = accentColor === c.id;
              return (
                <button
                  key={c.id}
                  id={`btn-modal-color-${c.id}`}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${isSelected ? 'var(--primary-500)' : 'var(--border-color)'}`,
                    background: isSelected ? 'color-mix(in srgb, var(--primary-500) 12%, transparent)' : 'var(--bg-card-subtle)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--text-main)',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => setAccentColor(c.id)}
                >
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)'
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {c.label}
                      {c.id === 'green' && (
                        <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', background: 'var(--border-color)', color: 'var(--text-dim)' }}>
                          Default
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.desc}</span>
                  </div>
                  {isSelected && <Check size={18} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 4: PKI DIGITAL CERTIFICATE                            */}
      {/* ============================================================== */}
      {activeTab === 'pki' && (
        <div className="animate-fade-in" style={{ padding: '4px 0' }}>
          {loadingPki ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px auto', display: 'block', color: 'var(--primary-500)' }} />
              <p style={{ fontSize: '0.88rem' }}>Loading X.509 Certificate details…</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Certificate Status Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'color-mix(in srgb, var(--primary-500) 8%, var(--bg-card-subtle))',
                  border: '1px solid color-mix(in srgb, var(--primary-500) 25%, var(--border-color))',
                  borderRadius: 'var(--radius-lg)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: 'color-mix(in srgb, var(--primary-500) 18%, transparent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary-500)',
                      flexShrink: 0
                    }}
                  >
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                        Enterprise X.509 v3 Digital Certificate
                      </span>
                      <span className="sd-badge sd-badge-green" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                        <CheckCircle2 size={10} /> Active & Valid
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Cryptographic RSA 2048-bit identity bound to your account for tamper-proof digital seals.
                    </p>
                  </div>
                </div>

                <a
                  href={`/api/users/${user?.id}/pki-certificate/download`}
                  download={`${user?.username || 'user'}_smartdoc.crt`}
                  className="btn btn-secondary btn-sm"
                  title="Download public X.509 certificate file (.crt)"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={13} />
                  <span>Download .crt</span>
                </a>
              </div>

              {/* Certificate Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '10px',
                  background: 'var(--bg-card-subtle)',
                  padding: '14px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Subject Common Name (CN)
                  </span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {pkiData?.parsed?.subject?.CN || pkiData?.subject?.commonName || pkiData?.name || user?.name || user?.fullName || 'SmartDoc Signer'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Department / Organization
                  </span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {pkiData?.parsed?.subject?.OU || pkiData?.subject?.organizationalUnitName || pkiData?.department || user?.department || 'Enterprise'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Key Algorithm & Spec
                  </span>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {pkiData?.keyAlgorithm || 'RSA 2048-bit (SHA-256)'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Serial Number
                  </span>
                  <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--primary-400)', marginTop: '2px' }}>
                    {pkiData?.serialNumber ? `#${pkiData.serialNumber.slice(0, 16)}…` : 'Generated on-demand'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Valid From
                  </span>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginTop: '2px' }}>
                    {pkiData?.issuedAt ? new Date(pkiData.issuedAt).toLocaleString() : 'Active'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Expires
                  </span>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginTop: '2px' }}>
                    {pkiData?.expiresAt ? new Date(pkiData.expiresAt).toLocaleDateString() : '2 Years from issue'}
                  </div>
                </div>
              </div>

              {/* SHA-256 Fingerprint */}
              <div
                style={{
                  background: 'var(--bg-card-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)',
                  padding: '12px 14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Lock size={13} style={{ color: 'var(--primary-500)' }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                      SHA-256 Certificate Fingerprint
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleCopyFingerprint(pkiData?.fingerprint)}
                    disabled={!pkiData?.fingerprint}
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  >
                    {copiedFingerprint ? (
                      <>
                        <Check size={11} style={{ color: 'var(--primary-500)' }} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={11} /> Copy Hash
                      </>
                    )}
                  </button>
                </div>

                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.76rem',
                    letterSpacing: '0.5px',
                    wordBreak: 'break-all',
                    color: 'var(--primary-300)',
                    background: 'rgba(0, 0, 0, 0.45)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  {pkiData?.fingerprint || 'Computing SHA-256 fingerprint…'}
                </div>
              </div>

              {/* PEM Toggle & Collapsible Block */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPem(!showPem)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-500)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 0'
                  }}
                >
                  <FileText size={13} />
                  <span>{showPem ? 'Hide Raw Certificate PEM' : 'View Raw Certificate PEM (X.509 Base64)'}</span>
                </button>

                {showPem && (
                  <div style={{ marginTop: '8px' }}>
                    <textarea
                      readOnly
                      rows={6}
                      value={pkiData?.certificatePem || ''}
                      style={{
                        width: '100%',
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        lineHeight: 1.4,
                        background: 'var(--bg-card-subtle)',
                        color: 'var(--text-dim)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Non-Repudiation Security Explainer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card-subtle)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.76rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.45
                }}
              >
                <ShieldCheck size={16} style={{ color: 'var(--primary-500)', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Cryptographic Non-Repudiation:</strong> Whenever you submit a form or approve a workflow in SmartDoc, your signature is cryptographically bound to the document content using this certificate and your private RSA key. Any subsequent modification invalidates the seal.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
