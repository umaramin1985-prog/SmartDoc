import React, { useEffect } from 'react';
import { X, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

export const formatRelativeTime = (value) => {
  if (!value) return '';
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return '';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
};

export const SlaBadge = ({ createdAt, expiryDate, status }) => {
  if (status === 'APPROVED' || status === 'REJECTED') {
    return null;
  }
  if (expiryDate) {
    const exp = new Date(expiryDate).getTime();
    if (!Number.isNaN(exp)) {
      const diffHours = Math.round((exp - Date.now()) / 3600000);
      if (diffHours < 0) {
        const overdueDays = Math.ceil(Math.abs(diffHours) / 24);
        return (
          <span className="sd-sla-badge is-overdue" title={`Deadline passed on ${formatDate(expiryDate, true)}`}>
            <AlertTriangle size={11} />
            {Math.abs(diffHours) < 24 ? `Overdue ${Math.abs(diffHours)}h` : `Overdue ${overdueDays}d`}
          </span>
        );
      }
      if (diffHours <= 48) {
        return (
          <span className="sd-sla-badge is-urgent" title={`Due ${formatDate(expiryDate, true)}`}>
            <Clock size={11} />
            {diffHours <= 1 ? 'Due <1h' : `${diffHours}h left`}
          </span>
        );
      }
      const daysLeft = Math.ceil(diffHours / 24);
      return (
        <span className="sd-sla-badge is-normal" title={`Due ${formatDate(expiryDate)}`}>
          <Clock size={11} />
          {daysLeft}d left
        </span>
      );
    }
  }
  if (createdAt) {
    const rel = formatRelativeTime(createdAt);
    if (!rel) return null;
    return (
      <span className="sd-sla-badge is-elapsed" title={`Submitted ${formatDate(createdAt, true)}`}>
        <Clock size={11} />
        {rel}
      </span>
    );
  }
  return null;
};

export const WorkflowMiniProgress = ({ workflow = [], currentStep = 1, status = 'IN_REVIEW' }) => {
  if (!Array.isArray(workflow) || workflow.length === 0) return null;
  const total = workflow.length;
  const activeIdx = Math.max(0, Math.min(total - 1, (currentStep || 1) - 1));
  const currentStage = workflow[activeIdx];
  const currentDept = typeof currentStage === 'string' ? currentStage : (currentStage?.department || '');

  const tooltipSummary = workflow
    .map((st, idx) => {
      const dept = typeof st === 'string' ? st : st?.department;
      const stStatus = typeof st === 'object' ? (st?.status || 'PENDING') : 'PENDING';
      const by = typeof st === 'object' && st?.actionByName ? ` (${st.actionByName})` : '';
      return `Stage ${idx + 1}: ${dept} — ${stStatus}${by}`;
    })
    .join('\n');

  return (
    <div className="sd-wf-mini" title={tooltipSummary}>
      <div className="sd-wf-mini-dots">
        {workflow.map((st, idx) => {
          const stStatus = typeof st === 'object' ? st?.status : null;
          let dotState = 'is-upcoming';
          if (status === 'APPROVED' || stStatus === 'APPROVED') dotState = 'is-done';
          else if (stStatus === 'OBJECTION' || (status === 'OBJECTION_RAISED' && idx === activeIdx)) dotState = 'is-warn';
          else if (stStatus === 'REJECTED' || (status === 'REJECTED' && idx === activeIdx)) dotState = 'is-bad';
          else if (idx < activeIdx) dotState = 'is-done';
          else if (idx === activeIdx && status === 'IN_REVIEW') dotState = 'is-current';

          return (
            <React.Fragment key={idx}>
              <span className={`sd-wf-mini-node ${dotState}`} />
              {idx < total - 1 && (
                <span className={`sd-wf-mini-bar ${idx < activeIdx || status === 'APPROVED' ? 'is-done' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <span className="sd-wf-mini-label">
        {status === 'APPROVED' ? (
          <>All {total} signed</>
        ) : (
          <>Stage {Math.min(currentStep || 1, total)}/{total}{currentDept ? ` · ${currentDept}` : ''}</>
        )}
      </span>
    </div>
  );
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
