import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-fixed-container" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map(t => {
        const type = ICONS[t.type] ? t.type : 'info';
        const Icon = ICONS[type];
        return (
          <div key={t.id} className={`toast-card toast-${type}`} role="status">
            <div className="toast-icon-wrap">
              <Icon size={18} />
            </div>
            <div className="toast-content">
              <span className="toast-title">{t.title}</span>
              {t.message && <p className="toast-msg">{t.message}</p>}
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
            <span className="toast-progress" />
          </div>
        );
      })}
    </div>
  );
};
