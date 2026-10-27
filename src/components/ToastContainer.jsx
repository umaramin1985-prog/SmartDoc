import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  CheckCircle2, AlertCircle, Info, AlertTriangle, X, ChevronDown,
  ChevronUp, ArrowRight, Sparkles, ExternalLink
} from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info
};

// ============================================================================
// Single Interactive Toast Card (with pause-on-hover, actions & details)
// ============================================================================
const ToastCard = ({ toast, onDismiss }) => {
  const {
    id,
    title,
    message,
    type = 'info',
    action,
    secondaryAction,
    details,
    duration = 5000
  } = toast;

  const [isPaused, setIsPaused] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const remainingTimeRef = useRef(duration);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef(null);

  const resolvedType = ICONS[type] ? type : 'info';
  const Icon = ICONS[resolvedType];
  const isInfinite = duration === Infinity || duration <= 0;

  // Cleanup timer helper
  const clearCurrentTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Start / Resume timer
  const startTimer = useCallback(() => {
    if (isInfinite) return;
    clearCurrentTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(id);
    }, remainingTimeRef.current);
  }, [id, isInfinite, onDismiss]);

  // Pause timer on hover
  const handleMouseEnter = () => {
    if (isInfinite) return;
    setIsPaused(true);
    clearCurrentTimer();
    const elapsed = Date.now() - startTimeRef.current;
    remainingTimeRef.current = Math.max(remainingTimeRef.current - elapsed, 800);
  };

  // Resume timer on mouse leave
  const handleMouseLeave = () => {
    if (isInfinite) return;
    setIsPaused(false);
    startTimer();
  };

  useEffect(() => {
    startTimer();
    return () => clearCurrentTimer();
  }, [startTimer]);

  const handleActionClick = (e, act) => {
    e.stopPropagation();
    try {
      act?.onClick?.();
    } finally {
      onDismiss(id);
    }
  };

  return (
    <div
      className={`toast-card toast-${resolvedType} ${isPaused ? 'is-paused' : ''}`}
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="toast-icon-wrap">
        <Icon size={18} />
      </div>

      <div className="toast-content">
        <div className="toast-header-row">
          <span className="toast-title">{title}</span>
        </div>

        {message && <p className="toast-msg">{message}</p>}

        {/* Expandable Details Accordion */}
        {details && (
          <div className="toast-details-wrap">
            <button
              type="button"
              className="toast-details-toggle"
              onClick={() => setShowDetails(prev => !prev)}
            >
              <span>{showDetails ? 'Hide details' : 'Show details'}</span>
              {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showDetails && (
              <div className="toast-details-content animate-fade-in">
                {Array.isArray(details) ? (
                  <ul className="toast-details-list">
                    {details.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="toast-details-text">{details}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Interactive Action Buttons */}
        {(action || secondaryAction) && (
          <div className="toast-actions">
            {action && (
              <button
                type="button"
                className="toast-btn toast-btn-primary"
                onClick={(e) => handleActionClick(e, action)}
              >
                <span>{action.label}</span>
                <ArrowRight size={12} />
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                className="toast-btn toast-btn-secondary"
                onClick={(e) => handleActionClick(e, secondaryAction)}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className="toast-close-btn"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>

      {/* Interactive Micro Progress Bar */}
      {!isInfinite && (
        <span
          className="toast-progress"
          style={{
            animationDuration: `${duration}ms`,
            animationPlayState: isPaused ? 'paused' : 'running'
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Main ToastContainer
// ============================================================================
export const ToastContainer = () => {
  const { toasts, removeToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="toast-fixed-container"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={removeToast}
        />
      ))}
    </div>
  );
};
