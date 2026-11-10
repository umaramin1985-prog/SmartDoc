import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { ACCENT_COLORS } from './ColorThemePicker';
import { buildAppUrl, getPathForTab, tabLinkProps } from '../utils/router';
import {
  Search, LayoutGrid, Sparkles, FolderOpen, CheckCircle2, ClipboardCheck,
  MessageSquare, History, Settings, FileText, ArrowRight, Sun, Moon,
  UserCheck, Building2, Shield, Command, CornerDownLeft, X, BellRing, GitBranch
} from 'lucide-react';

const TAB_META = {
  dashboard: { section: 'Workspace', label: 'Executive Cockpit', icon: LayoutGrid },
  'dashboard-modern': { section: 'Workspace', label: 'Modern Kanban & Analytics', icon: Sparkles },
  forms: { section: 'Workspace', label: 'Forms & Templates Drive', icon: FolderOpen },
  approvals: { section: 'Workflows', label: 'Submissions & Approvals', icon: CheckCircle2 },
  workflows: { section: 'Workflows', label: 'Visual Workflow Graph Studio', icon: GitBranch },
  reviews: { section: 'Workflows', label: 'Pre-Publication Reviews', icon: ClipboardCheck },
  'dept-messaging': { section: 'Workflows', label: 'Team Messaging', icon: MessageSquare },
  activity: { section: 'Governance', label: 'Activity & Audit Ledger', icon: History },
  settings: { section: 'Governance', label: 'Users & Departments', icon: Settings }
};

export const TopWorkspaceBar = ({ onOpenCommandPalette }) => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    isSuperAdmin,
    myApprovalQueue,
    reviewsNeedingMe,
    theme,
    toggleTheme,
    accentColor,
    setAccentColor,
    openLoginBriefing
  } = useApp();

  const meta = TAB_META[activeTab] || TAB_META.dashboard;
  const ActiveIcon = meta.icon;
  const isLight = theme === 'light';
  const totalActionNeeded = (myApprovalQueue?.length || 0) + (reviewsNeedingMe?.length || 0);

  const roleBadgeText = isSuperAdmin
    ? 'Super Admin'
    : currentUser?.systemRole === 'admin'
      ? 'Dept Admin'
      : 'Member';

  return (
    <header className="sd-top-workspace-bar" role="banner" aria-label="Workspace context bar">
      <div className="sd-topbar-left">
        <a
          className="sd-topbar-root-link"
          {...tabLinkProps('/', () => setActiveTab('dashboard'))}
          title="Return to Executive Dashboard"
        >
          SmartDoc
        </a>
        <span className="sd-topbar-sep" aria-hidden="true">/</span>
        <span className="sd-topbar-section">{meta.section}</span>
        <span className="sd-topbar-sep" aria-hidden="true">/</span>
        <span className="sd-topbar-current">
          <ActiveIcon size={14} className="sd-topbar-current-icon" />
          <span>{meta.label}</span>
        </span>
      </div>

      <div className="sd-topbar-center">
        <button
          id="btn-open-command-palette"
          type="button"
          className="sd-spotlight-trigger"
          onClick={onOpenCommandPalette}
          title="Search forms, templates, submissions, or jump anywhere (Ctrl+K)"
        >
          <Search size={14} className="sd-spotlight-trigger-icon" />
          <span className="sd-spotlight-trigger-text">
            Search forms, serial numbers, or jump to…
          </span>
          <kbd className="sd-spotlight-kbd">Ctrl K</kbd>
        </button>
      </div>

      <div className="sd-topbar-right">
        <button
          id="btn-topbar-briefing"
          type="button"
          className={`sd-topbar-briefing-btn ${totalActionNeeded > 0 ? 'has-actions' : ''}`}
          onClick={openLoginBriefing}
          title="Open Central Session Briefing (Approvals, Submissions & Reviews summary)"
        >
          <BellRing size={12} />
          <span>Briefing</span>
          {totalActionNeeded > 0 && (
            <span className="sd-topbar-briefing-count">{totalActionNeeded}</span>
          )}
        </button>

        {totalActionNeeded > 0 && (
          <a
            id="btn-topbar-action-needed"
            className="sd-topbar-urgent-pill"
            {...tabLinkProps(
              myApprovalQueue.length > 0 ? getPathForTab('approvals') : getPathForTab('reviews'),
              () => setActiveTab(myApprovalQueue.length > 0 ? 'approvals' : 'reviews')
            )}
            title={`${myApprovalQueue.length} approval(s) and ${reviewsNeedingMe.length} review(s) waiting for your action`}
          >
            <BellRing size={12} />
            <span>{totalActionNeeded} Action Needed</span>
          </a>
        )}

        <div className="sd-topbar-context-pill" title={`Signed in as ${currentUser?.name} (${roleBadgeText})`}>
          <Building2 size={12} className="sd-text-accent" />
          <span className="sd-topbar-dept">{currentUser?.department || 'Global'}</span>
          <span className="sd-topbar-role-divider">·</span>
          <span className="sd-topbar-role">
            {isSuperAdmin && <Shield size={11} />}
            {roleBadgeText}
          </span>
        </div>

        <div className="sd-topbar-appearance" title="Quick theme & accent switcher">
          <button
            id="btn-topbar-theme-toggle"
            type="button"
            className="sd-topbar-theme-btn"
            onClick={toggleTheme}
            title={isLight ? 'Switch to Refined Slate Dark Mode' : 'Switch to Crisp Enterprise Light Mode'}
            aria-label="Toggle color theme"
          >
            {isLight ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <div className="sd-topbar-accent-dots">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`sd-topbar-dot ${accentColor === c.id ? 'active' : ''}`}
                style={{ backgroundColor: c.hex }}
                onClick={() => setAccentColor(c.id)}
                title={`${c.label} accent`}
                aria-label={`Select ${c.label} accent`}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};

export const CommandPalette = ({ isOpen, onClose }) => {
  const {
    setActiveTab,
    isSuperAdmin,
    formTemplates,
    formSubmissions,
    templateReviews,
    openProfileModal,
    openDocumentPreview,
    toggleTheme,
    theme
  } = useApp();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setCategory('ALL');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const navigateWithDeepLink = useCallback((tab, url) => {
    onClose();
    if (url) {
      window.history.pushState({ tab }, '', url);
    }
    setActiveTab(tab, { skipHistory: !!url });
  }, [onClose, setActiveTab]);

  const allItems = useMemo(() => {
    const items = [];

    // 1. Navigation & Workspace Commands
    const navCommands = [
      {
        id: 'nav-dashboard',
        group: 'NAVIGATION',
        title: 'Go to Executive Cockpit Dashboard',
        subtitle: 'Workspace · Priority action queue, KPIs & recent activity',
        icon: LayoutGrid,
        url: getPathForTab('dashboard'),
        action: () => { onClose(); setActiveTab('dashboard'); }
      },
      {
        id: 'nav-dashboard-modern',
        group: 'NAVIGATION',
        title: 'Go to Modern Kanban & Analytics Dashboard',
        subtitle: 'Workspace · 3-lane workflow Kanban board & velocity metrics',
        icon: Sparkles,
        url: getPathForTab('dashboard-modern'),
        action: () => { onClose(); setActiveTab('dashboard-modern'); }
      },
      {
        id: 'nav-forms',
        group: 'NAVIGATION',
        title: 'Browse Forms & Templates Drive',
        subtitle: 'Workspace · Department folders, Smart Word Studio & fillable templates',
        icon: FolderOpen,
        url: getPathForTab('forms'),
        action: () => { onClose(); setActiveTab('forms'); }
      },
      {
        id: 'nav-approvals',
        group: 'NAVIGATION',
        title: 'Open Submissions & Approvals',
        subtitle: 'Workflows · Multi-stage sign-offs, objections & PKI verification',
        icon: CheckCircle2,
        url: getPathForTab('approvals'),
        action: () => { onClose(); setActiveTab('approvals'); }
      },
      {
        id: 'nav-workflows',
        group: 'NAVIGATION',
        title: 'Open Visual Workflow Graph Studio',
        subtitle: 'Workflows · Node-based workflow graph builder, conditional rules & blueprints',
        icon: GitBranch,
        url: getPathForTab('workflows'),
        action: () => { onClose(); setActiveTab('workflows'); }
      },
      {
        id: 'nav-reviews',
        group: 'NAVIGATION',
        title: 'Open Pre-Publication Reviews',
        subtitle: 'Workflows · Collaborative redline diffs & template decisions',
        icon: ClipboardCheck,
        url: getPathForTab('reviews'),
        action: () => { onClose(); setActiveTab('reviews'); }
      },
      {
        id: 'nav-messaging',
        group: 'NAVIGATION',
        title: 'Open Team Messaging',
        subtitle: 'Workflows · Department channel with inline form references',
        icon: MessageSquare,
        url: getPathForTab('dept-messaging'),
        action: () => { onClose(); setActiveTab('dept-messaging'); }
      },
      {
        id: 'nav-activity',
        group: 'NAVIGATION',
        title: 'View Activity & Cryptographic Audit Ledger',
        subtitle: 'Governance · Tamper-evident SHA-256 event log & CSV export',
        icon: History,
        url: getPathForTab('activity'),
        action: () => { onClose(); setActiveTab('activity'); }
      },
      ...(isSuperAdmin ? [{
        id: 'nav-settings',
        group: 'NAVIGATION',
        title: 'Manage Users & Departments',
        subtitle: 'Governance · Role assignments, department drives & system controls',
        icon: Settings,
        url: getPathForTab('settings'),
        action: () => { onClose(); setActiveTab('settings'); }
      }] : []),
      {
        id: 'act-signature',
        group: 'NAVIGATION',
        title: 'Configure Profile & PKI Digital Signature',
        subtitle: 'Identity · Draw, type, or upload your cryptographic signature stamp',
        icon: UserCheck,
        url: null,
        action: () => { onClose(); openProfileModal(null, 'signature'); }
      },
      {
        id: 'act-theme',
        group: 'NAVIGATION',
        title: `Switch to ${theme === 'light' ? 'Refined Slate Dark' : 'Crisp Enterprise Light'} Mode`,
        subtitle: 'Appearance · Instant zero-flicker surface mode toggle',
        icon: theme === 'light' ? Moon : Sun,
        url: null,
        action: () => { toggleTheme(); onClose(); }
      }
    ];
    items.push(...navCommands);

    // 2. Published Templates (Real Backend Data Only)
    (formTemplates || []).forEach((t) => {
      const fillUrl = buildAppUrl('forms', {
        action: t.isEditable !== false ? 'fill' : 'view',
        id: t.id
      });
      items.push({
        id: `tmpl-${t.id}`,
        group: 'TEMPLATES',
        title: t.title,
        subtitle: `Template v${t.version || 1} · ${t.department} · ${t.isEditable === false ? 'Reference Document' : 'Fillable Form'}`,
        badge: `v${t.version || 1}`,
        badgeTone: 'blue',
        icon: FileText,
        url: fillUrl,
        action: () => navigateWithDeepLink('forms', fillUrl)
      });
    });

    // 3. Submissions (Real Backend Data Only)
    (formSubmissions || []).slice(0, 60).forEach((s) => {
      const subUrl = buildAppUrl('approvals', { submission: s.id });
      const tone =
        s.status === 'APPROVED' ? 'emerald' :
        s.status === 'OBJECTED' ? 'amber' :
        s.status === 'REJECTED' ? 'rose' : 'blue';
      items.push({
        id: `sub-${s.id}`,
        group: 'SUBMISSIONS',
        title: `${s.uniqueNumber} — ${s.title}`,
        subtitle: `Submitted by ${s.submittedBy} · ${s.department} · Stage ${s.currentWorkflowStep || 1}/${s.workflow?.length || 1}`,
        badge: s.status?.replace('_', ' ') || 'IN REVIEW',
        badgeTone: tone,
        icon: CheckCircle2,
        url: subUrl,
        action: () => navigateWithDeepLink('approvals', subUrl),
        secondaryAction: () => {
          onClose();
          openDocumentPreview({
            kind: 'submission',
            id: s.id,
            title: `${s.uniqueNumber} — ${s.title}`,
            fileName: `${s.uniqueNumber}_v${s.version || 1}.docx`
          });
        }
      });
    });

    // 4. Pre-Publication Reviews (Real Backend Data Only)
    (templateReviews || []).slice(0, 30).forEach((r) => {
      const revUrl = buildAppUrl('reviews', { review: r.id });
      items.push({
        id: `rev-${r.id}`,
        group: 'REVIEWS',
        title: r.title,
        subtitle: `Pre-Publication Review · Initiated by ${r.initiatorName} · ${r.department}`,
        badge: r.phase?.replace('_', ' ') || r.status,
        badgeTone: 'purple',
        icon: ClipboardCheck,
        url: revUrl,
        action: () => navigateWithDeepLink('reviews', revUrl)
      });
    });

    return items;
  }, [
    formTemplates,
    formSubmissions,
    templateReviews,
    isSuperAdmin,
    theme,
    onClose,
    setActiveTab,
    openProfileModal,
    openDocumentPreview,
    toggleTheme,
    navigateWithDeepLink
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((item) => {
      if (category !== 'ALL' && item.group !== category) return false;
      if (!q) return true;
      return (
        item.title?.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.badge?.toLowerCase().includes(q)
      );
    }).slice(0, 35);
  }, [allItems, query, category]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, category]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
      } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        filteredItems[selectedIndex].action();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector('.sd-cmd-item.is-selected');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen || typeof document === 'undefined') return null;

  const categories = [
    { id: 'ALL', label: 'All' },
    { id: 'NAVIGATION', label: 'Navigation & Actions' },
    { id: 'TEMPLATES', label: `Templates (${formTemplates?.length || 0})` },
    { id: 'SUBMISSIONS', label: `Submissions (${formSubmissions?.length || 0})` },
    { id: 'REVIEWS', label: `Reviews (${templateReviews?.length || 0})` }
  ];

  return createPortal(
    <div
      className="sd-cmd-backdrop animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="SmartDoc Command Palette"
    >
      <div className="sd-cmd-modal">
        <div className="sd-cmd-search-bar">
          <Search size={18} className="sd-cmd-search-icon" />
          <input
            ref={inputRef}
            id="input-command-palette"
            type="text"
            className="sd-cmd-input"
            placeholder="Search templates, serial numbers (e.g. SD-...), departments, or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="sd-icon-btn"
              onClick={() => setQuery('')}
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
          <kbd className="sd-cmd-esc-badge" onClick={onClose} title="Close (Esc)">Esc</kbd>
        </div>

        <div className="sd-cmd-filter-pills">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`sd-cmd-pill ${category === c.id ? 'active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="sd-cmd-results">
          {filteredItems.length === 0 ? (
            <div className="sd-cmd-empty">
              <Command size={26} className="sd-muted" />
              <strong>No matching results for &ldquo;{query}&rdquo;</strong>
              <span className="sd-muted sd-small">
                Try searching by form title, department name, submission serial number, or navigation tab.
              </span>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              const linkProps = item.url
                ? tabLinkProps(item.url, item.action)
                : {
                    href: '#cmd',
                    onClick: (e) => {
                      e.preventDefault();
                      item.action();
                    }
                  };

              return (
                <a
                  key={item.id}
                  className={`sd-cmd-item ${isSelected ? 'is-selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  {...linkProps}
                >
                  <div className="sd-cmd-item-icon">
                    <Icon size={16} />
                  </div>
                  <div className="sd-cmd-item-body">
                    <div className="sd-cmd-item-title">{item.title}</div>
                    <div className="sd-cmd-item-sub">{item.subtitle}</div>
                  </div>
                  {item.badge && (
                    <span className={`badge badge-${item.badgeTone || 'blue'} sd-cmd-item-badge`}>
                      {item.badge}
                    </span>
                  )}
                  <div className="sd-cmd-item-enter">
                    <CornerDownLeft size={13} />
                  </div>
                </a>
              );
            })
          )}
        </div>

        <footer className="sd-cmd-footer">
          <div className="sd-cmd-footer-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Open</span>
            <span><kbd>Ctrl</kbd>+<kbd>Click</kbd> New Tab</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
          <span className="sd-cmd-footer-brand">SmartDoc Spotlight</span>
        </footer>
      </div>
    </div>,
    document.body
  );
};
