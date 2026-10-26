import React from 'react';
import { useApp } from '../context/AppContext';
import { initials, UserAvatar } from './ui';
import { NotificationBell } from './NotificationBell';
import { ACCENT_COLORS } from './ColorThemePicker';
import SmartDocLogoIcon from './SmartDocLogoIcon';
import { getPathForTab } from '../utils/router';
import {
  LayoutGrid, FolderOpen, FileText, CheckCircle2, MessageSquare, Settings,
  LogOut, PenLine, ClipboardCheck, Camera,
  PanelLeftClose, PanelLeftOpen, ChevronLeft, ChevronRight, History, UserCheck
} from 'lucide-react';

export const SmartSidebar = () => {
  const {
    activeTab, setActiveTab, currentUser, logout,
    isSuperAdmin, myApprovalQueue, reviewsNeedingMe, openSignatureModal, openProfileModal,
    sidebarCollapsed, toggleSidebar, accentColor, setAccentColor
  } = useApp();

  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'forms', label: 'Forms & Templates', icon: FolderOpen },
    { id: 'approvals', label: 'Submissions & Approvals', icon: CheckCircle2, badge: myApprovalQueue.length },
    { id: 'reviews', label: 'Reviews', icon: ClipboardCheck, badge: reviewsNeedingMe.length },
    { id: 'dept-messaging', label: 'Team Messaging', icon: MessageSquare },
    { id: 'activity', label: 'Activity Log', icon: History },
    ...(isSuperAdmin ? [{ id: 'settings', label: 'Users & Departments', icon: Settings }] : [])
  ];

  return (
    <aside className={`smart-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Main sidebar">
      <div className="smart-sidebar-brand-row">
        <a
          href="/"
          className="smart-sidebar-brand"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          title={sidebarCollapsed ? "SmartDoc - Forms & Approvals" : undefined}
        >
          <div className="smart-brand-icon-box">
            <SmartDocLogoIcon size={20} className="smart-brand-icon" />
          </div>
          <div className="smart-brand-titles">
            <span className="smart-brand-name">SmartDoc</span>
            <span className="smart-brand-sub">Forms &amp; Approvals</span>
          </div>
        </a>

        <div className="smart-sidebar-header-actions">
          <div className="smart-sidebar-bell-wrap">
            <NotificationBell />
          </div>
          <button
            id="btn-toggle-sidebar"
            type="button"
            className="sd-icon-btn smart-sidebar-toggle-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
      </div>

      <nav className="smart-sidebar-nav">
        {items.map(({ id, label, icon: Icon, badge }) => (
          <a
            key={id}
            id={`nav-${id}-btn`}
            href={getPathForTab(id)}
            className={`smart-nav-item ${activeTab === id ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(id);
            }}
            title={sidebarCollapsed ? `${label}${badge > 0 ? ` (${badge})` : ''}` : undefined}
          >
            <div className="smart-nav-icon-wrap">
              <Icon size={17} />
              {sidebarCollapsed && badge > 0 && (
                <span className="smart-nav-dot-badge" title={`${badge} pending`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className="smart-nav-text">{label}</span>
            {!sidebarCollapsed && badge > 0 && <span className="smart-nav-badge">{badge}</span>}
          </a>
        ))}
      </nav>

      <div className="smart-sidebar-footer">
        <button
          id="nav-profile-signature-btn"
          type="button"
          className="smart-nav-item"
          onClick={() => openProfileModal(null, 'signature')}
          title={sidebarCollapsed ? (currentUser?.hasSignature ? "Profile & Signature" : "Profile & Signature (Signature not set)") : undefined}
        >
          <div className="smart-nav-icon-wrap">
            <UserCheck size={17} />
            {sidebarCollapsed && !currentUser?.hasSignature && (
              <span className="smart-nav-dot-warn" title="Signature not set" />
            )}
          </div>
          <span className="smart-nav-text">Profile &amp; Signature</span>
          {!sidebarCollapsed && !currentUser?.hasSignature && (
            <span className="sd-dot-warn" title="Signature not set" />
          )}
        </button>


        <button
          id="btn-sidebar-collapse-footer"
          type="button"
          className="smart-nav-item smart-nav-collapse-footer-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
        >
          {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span className="smart-nav-text">Collapse sidebar</span>
        </button>

        {!sidebarCollapsed && (
          <div className="smart-sidebar-color-bar" title="App Theme Color">
            <span className="smart-sidebar-color-bar-label">Theme:</span>
            <div className="smart-sidebar-color-dots">
              {ACCENT_COLORS.map(c => (
                <button
                  key={c.id}
                  id={`btn-sidebar-dot-${c.id}`}
                  type="button"
                  className={`smart-color-dot ${accentColor === c.id ? 'active' : ''}`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => setAccentColor(c.id)}
                  title={`${c.label}${c.id === 'green' ? ' (Default)' : ''}`}
                  aria-label={`Select ${c.label}`}
                />
              ))}
            </div>
          </div>
        )}

        <div
          id="btn-sidebar-profile"
          className="sd-user-card sd-user-card-clickable"
          onClick={() => openProfileModal()}
          title={sidebarCollapsed ? `${currentUser?.name} (${currentUser?.department}) · Click for profile` : "Click to view profile or change photo"}
        >
          <div className="sd-sidebar-avatar-wrap">
            <UserAvatar user={currentUser} className="sd-sidebar-avatar" />
            <span className="sd-sidebar-avatar-badge" title="Change photo">
              <Camera size={10} />
            </span>
          </div>
          <div className="sd-user-meta">
            <span className="sd-user-name">{currentUser?.name}</span>
            <span className="sd-user-sub" title={currentUser?.department}>
              {currentUser?.systemRole === 'superadmin' ? 'Super Admin' : currentUser?.systemRole === 'admin' ? 'Dept Admin' : 'User'} · {currentUser?.department}
            </span>
          </div>
          <button
            id="btn-sidebar-logout"
            type="button"
            className="sd-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              logout();
            }}
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

