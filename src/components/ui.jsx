import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const STATUS_META = {
  IN_REVIEW: { label: 'In review', tone: 'blue' },
  APPROVED: { label: 'Approved', tone: 'green' },
  OBJECTION_RAISED: { label: 'Objection raised', tone: 'amber' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  EXPIRED: { label: 'Expired', tone: 'gray' }
};

export const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status || 'Unknown', tone: 'gray' };
  return <span className={`sd-badge sd-badge-${meta.tone}`}>{meta.label}</span>;
};

export const formatDate = (value, withTime = false) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return withTime
    ? d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatSize = (bytes) => {
  const b = parseInt(bytes, 10);
  if (!b || b <= 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const initials = (name) =>
  (name || '?').trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase();

export const UserAvatar = ({ user, name, avatar, size = 'default', className = '', ...props }) => {
  const imgUrl = avatar || user?.avatar;
  const displayName = name || user?.name || '?';
  const sizeClass = size === 'xs' ? 'sd-avatar-xs' : size === 'sm' ? 'sd-avatar-sm' : size === 'md' ? 'sd-avatar-md' : size === 'lg' ? 'sd-avatar-lg' : size === 'xl' ? 'sd-avatar-xl' : '';

  return (
    <div className={`sd-avatar ${sizeClass} ${imgUrl ? 'sd-avatar-has-img' : ''} ${className}`} {...props}>
      {imgUrl ? (
        <img src={imgUrl} alt={displayName} className="sd-avatar-img" />
      ) : (
        initials(displayName)
      )}
    </div>
  );
};

export const roleLabel = (systemRole) =>
  systemRole === 'superadmin' ? 'Super Administrator' : systemRole === 'admin' ? 'Department Admin' : 'User';

export const Modal = ({ title, subtitle, onClose, children, footer, size = 'md', id }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`sd-modal-backdrop ${id ? `sd-modal-backdrop-${id}` : ''}`}>
      <div className={`sd-modal sd-modal-${size}`} role="dialog" aria-modal="true" id={id}>
        <header className="sd-modal-header">
          <div>
            <h2 className="sd-modal-title">{title}</h2>
            {subtitle && <p className="sd-modal-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="sd-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="sd-modal-body">{children}</div>
        {footer && <footer className="sd-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
};

export const EmptyState = ({ icon: Icon, title, text, action }) => (
  <div className="sd-empty">
    {Icon && <div className="sd-empty-icon"><Icon size={26} /></div>}
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    {action}
  </div>
);

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="sd-page-header">
    <div>
      <h1 className="sd-page-title">{title}</h1>
      {subtitle && <p className="sd-page-subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="sd-page-actions">{actions}</div>}
  </div>
);

// Horizontal approval chain: Submitter -> Dept 1 -> Dept 2 ...
export const WorkflowTrack = ({ workflow = [], submitterLabel = 'Submitter', compact = false }) => (
  <ol className={`sd-track ${compact ? 'sd-track-compact' : ''}`}>
    <li className="sd-track-step is-done">
      <span className="sd-track-dot" />
      <span className="sd-track-label">{submitterLabel}</span>
    </li>
    {workflow.map((st, i) => {
      const deptName = typeof st === 'string' ? st : (st?.department || '');
      const state = typeof st === 'object' && st
        ? (st.status === 'APPROVED' ? 'is-done'
          : st.status === 'PENDING' ? 'is-current'
            : st.status === 'OBJECTION' ? 'is-warn'
              : st.status === 'REJECTED' ? 'is-bad' : '')
        : '';
      return (
        <li key={`${deptName}-${i}`} className={`sd-track-step ${state}`}>
          <span className="sd-track-dot" />
          <span className="sd-track-label">{deptName}</span>
        </li>
      );
    })}
  </ol>
);

// Read a File as base64 (without the data: prefix)
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
