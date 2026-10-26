import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { formatDate } from './ui';
import {
  Bell, CheckCircle2, AlertTriangle, XCircle, PenTool,
  FileText, MessageSquare, Check, ExternalLink, Clock
} from 'lucide-react';

export const NotificationBell = ({ onOpenSubmission, onOpenTemplate, onOpenReview }) => {
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    setActiveTab
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [coords, setCoords] = useState({ top: 16, left: 260 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 360;
    const popoverMaxHeight = 480;
    const padding = 12;

    // Desktop default: float to the right of the sidebar button
    let left = rect.right + 12;
    let top = Math.max(padding, rect.top - 6);

    // If it would overflow right viewport boundary (narrow window / mobile)
    if (left + popoverWidth > window.innerWidth - padding) {
      left = Math.max(padding, Math.min(rect.left, window.innerWidth - popoverWidth - padding));
      top = rect.bottom + 8;
    }

    // Ensure it doesn't overflow bottom of viewport
    if (top + popoverMaxHeight > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - popoverMaxHeight - padding);
    }

    setCoords({ top, left });
  }, []);

  // Handle position calculation, window resize/scroll, and outside click
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClickOutside = (e) => {
      if (buttonRef.current && buttonRef.current.contains(e.target)) {
        return;
      }
      if (popoverRef.current && popoverRef.current.contains(e.target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  const getIcon = (type) => {
    switch (type) {
      case 'FORM_APPROVAL_REQUEST':
        return <CheckCircle2 size={16} className="sd-text-primary" />;
      case 'SIGNATURE_REQUEST':
        return <PenTool size={16} className="sd-text-accent" />;
      case 'FORM_APPROVED':
        return <CheckCircle2 size={16} className="sd-text-success" />;
      case 'FORM_OBJECTION':
        return <AlertTriangle size={16} className="sd-text-warn" />;
      case 'FORM_REJECTED':
        return <XCircle size={16} className="sd-text-danger" />;
      case 'REVIEW_REQUEST':
      case 'REVIEW_SUBMITTED':
        return <FileText size={16} className="sd-text-info" />;
      case 'COMMENT_ADDED':
        return <MessageSquare size={16} className="sd-text-secondary" />;
      default:
        return <Bell size={16} className="sd-text-muted" />;
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      await markNotificationRead(notif.id);
    }
    setIsOpen(false);

    if (notif.linkType === 'submission') {
      if (onOpenSubmission) {
        onOpenSubmission(notif.linkId);
      } else {
        setActiveTab('approvals');
      }
    } else if (notif.linkType === 'review') {
      if (onOpenReview) {
        onOpenReview(notif.linkId);
      } else {
        setActiveTab('reviews');
      }
    } else if (notif.linkType === 'template') {
      if (onOpenTemplate) {
        onOpenTemplate(notif.linkId);
      } else {
        setActiveTab('forms');
      }
    }
  };

  const popoverContent = isOpen && typeof document !== 'undefined' ? (
    <div
      ref={popoverRef}
      className="sd-notif-popover animate-fade-in"
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      role="dialog"
      aria-label="Notifications drawer"
    >
      <header className="sd-notif-header">
        <div className="sd-notif-header-title">
          <strong>Notifications</strong>
          {unreadNotificationsCount > 0 && (
            <span className="sd-badge sd-badge-accent sd-badge-xs">
              {unreadNotificationsCount} new
            </span>
          )}
        </div>
        {unreadNotificationsCount > 0 && (
          <button
            type="button"
            className="sd-link sd-small sd-notif-mark-read"
            onClick={markAllNotificationsRead}
          >
            <Check size={13} /> Mark all read
          </button>
        )}
      </header>

      <div className="sd-notif-list">
        {notifications.length === 0 ? (
          <div className="sd-notif-empty">
            <Bell size={28} className="sd-muted sd-mb-xs" />
            <p>No notifications yet</p>
            <span className="sd-muted sd-small">You will be alerted here when forms require approval or signatures.</span>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`sd-notif-item ${!n.isRead ? 'is-unread' : ''}`}
              onClick={() => handleNotificationClick(n)}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNotificationClick(n); }}
            >
              <div className="sd-notif-icon-box">
                {getIcon(n.type)}
              </div>
              <div className="sd-notif-content">
                <div className="sd-notif-title-row">
                  <span className="sd-notif-title">{n.title}</span>
                  <span className="sd-notif-time" title={n.createdAt}>
                    <Clock size={11} /> {formatDate(n.createdAt)}
                  </span>
                </div>
                <p className="sd-notif-msg">{n.message}</p>
                {n.linkId && (
                  <span className="sd-notif-action-hint">
                    Click to view <ExternalLink size={10} />
                  </span>
                )}
              </div>
              {!n.isRead && (
                <div
                  className="sd-notif-unread-dot"
                  title="Mark as read"
                  onClick={(e) => {
                    e.stopPropagation();
                    markNotificationRead(n.id);
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="sd-notif-bell-container">
      <button
        ref={buttonRef}
        id="btn-notifications-bell"
        type="button"
        className={`sd-icon-btn sd-notif-bell-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        title={unreadNotificationsCount > 0 ? `${unreadNotificationsCount} unread notification${unreadNotificationsCount === 1 ? '' : 's'}` : 'Notifications'}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadNotificationsCount > 0 && (
          <span className="sd-notif-badge animate-pulse">
            {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
          </span>
        )}
      </button>

      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
};
