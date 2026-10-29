import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { UserAvatar, formatDate } from './ui';
import {
  Activity, History, ExternalLink, Download, RefreshCw, Search,
  ShieldCheck, Filter, FileText, CheckCircle2, AlertTriangle,
  XCircle, Folder, Lock, User, Check, Clock, Layers, Trash2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown
} from 'lucide-react';

const CATEGORIES = [
  { id: 'ALL', label: 'All Events' },
  { id: 'SUBMISSIONS', label: 'Submissions' },
  { id: 'APPROVALS', label: 'Approvals & Objections' },
  { id: 'TEMPLATES', label: 'Templates & Folders' },
  { id: 'REVIEWS', label: 'Pre-Publication Reviews' },
  { id: 'SECURITY', label: 'Identity & Access' },
  { id: 'COMMENTS', label: 'Comments' }
];

export const ActivityHub = ({ isStandalone = false }) => {
  const {
    currentUser, isAdmin, isSuperAdmin, departments,
    activityLogs, activityLogsLoading, activityLogsMeta, refreshActivityLogs, addToast
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedSha, setCopiedSha] = useState(null);

  // Debounce search typing by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Reset to first page when filtering or searching changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedCategory, departmentFilter]);

  // Load activity logs from database with active paging and filters
  const loadLogs = useCallback(async () => {
    try {
      const params = {
        page: currentPage,
        pageSize,
        category: selectedCategory,
        search: debouncedSearch
      };
      if (isSuperAdmin && departmentFilter !== 'ALL') {
        params.department = departmentFilter;
      }
      await refreshActivityLogs(params);
    } catch (err) {
      addToast('Error', err.message || 'Failed to load activity logs', 'error');
    }
  }, [currentPage, pageSize, selectedCategory, debouncedSearch, departmentFilter, isSuperAdmin, refreshActivityLogs, addToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Page navigation helpers
  const totalPages = activityLogsMeta?.totalPages || 1;
  const totalCount = activityLogsMeta?.totalCount || 0;
  const fromRecord = activityLogsMeta?.from || 0;
  const toRecord = activityLogsMeta?.to || 0;
  const hasPrev = !!activityLogsMeta?.hasPrevPage;
  const hasNext = !!activityLogsMeta?.hasNextPage;

  const goToPage = (p) => {
    const target = Math.max(1, Math.min(p, totalPages));
    if (target !== currentPage && !activityLogsLoading) {
      setCurrentPage(target);
    }
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Generate numbered pagination slots with ellipses
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [totalPages, currentPage]);

  // Export full filtered result set directly from database (up to 5,000 records)
  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const params = {
        category: selectedCategory,
        search: debouncedSearch,
        exportAll: true
      };
      if (isSuperAdmin && departmentFilter !== 'ALL') {
        params.department = departmentFilter;
      }
      const res = await apiService.getActivityLogs(params);
      const exportLogs = res?.logs || [];

      if (!exportLogs.length) {
        addToast('Notice', 'No activity records match the current filters', 'info');
        return;
      }

      const headers = ['Timestamp', 'Action Type', 'Actor Username', 'Actor Name', 'Role', 'Department', 'Resource', 'SHA-256 Hash', 'Verified'];
      const rows = exportLogs.map(l => [
        `"${new Date(l.timestamp).toISOString()}"`,
        `"${l.actionType || ''}"`,
        `"${l.actorUsername || ''}"`,
        `"${(l.actorName || '').replace(/"/g, '""')}"`,
        `"${l.actorRole || ''}"`,
        `"${(l.department || '').replace(/"/g, '""')}"`,
        `"${(l.resourceName || '').replace(/"/g, '""')}"`,
        `"${l.sha256 || ''}"`,
        l.verified ? 'YES' : 'NO'
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `SmartDoc_Activity_Log_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast('Success', `Exported ${exportLogs.length} activity records to CSV`, 'success');
    } catch (err) {
      console.error('[handleExportCsv]', err);
      addToast('Error', 'Failed to export activity logs', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Open in a new standalone popup window
  const handleOpenNewWindow = () => {
    const width = 1200;
    const height = 860;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    window.open(
      '/activity?popup=true',
      'SmartDocActivityConsole',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );
  };

  // Copy SHA-256 to clipboard
  const handleCopySha = (sha) => {
    if (!sha) return;
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2200);
  };

  // Action badge and tone helper
  const getActionBadge = (type) => {
    switch (type) {
      case 'FORM_SUBMITTED':
      case 'FORM_RESUBMITTED':
        return { label: type === 'FORM_RESUBMITTED' ? 'Resubmitted' : 'Submitted', tone: 'blue', icon: FileText };
      case 'FORM_APPROVE':
        return { label: 'Approved', tone: 'green', icon: CheckCircle2 };
      case 'FORM_OBJECT':
      case 'FORM_OBJECTION':
        return { label: 'Objection Raised', tone: 'amber', icon: AlertTriangle };
      case 'FORM_REJECT':
        return { label: 'Rejected', tone: 'red', icon: XCircle };
      case 'TEMPLATE_CREATED':
        return { label: 'Template Created', tone: 'cyan', icon: FileText };
      case 'TEMPLATE_DRAFT_CREATED':
        return { label: 'Draft Created', tone: 'cyan', icon: FileText };
      case 'TEMPLATE_EDITED':
        return { label: 'Template Edited', tone: 'cyan', icon: FileText };
      case 'TEMPLATE_DRAFT_SAVED':
        return { label: 'Draft Saved', tone: 'cyan', icon: FileText };
      case 'TEMPLATE_PUBLISHED':
        return { label: 'Template Published', tone: 'green', icon: CheckCircle2 };
      case 'TEMPLATE_PERMISSIONS_UPDATED':
        return { label: 'Permissions Changed', tone: 'purple', icon: ShieldCheck };
      case 'TEMPLATE_MOVED':
        return { label: 'Template Moved', tone: 'cyan', icon: Folder };
      case 'TEMPLATE_ARCHIVED':
        return { label: 'Template Archived', tone: 'gray', icon: Folder };
      case 'TEMPLATE_DELETED':
        return { label: 'Template Deleted', tone: 'red', icon: Trash2 };
      case 'BULK_TEMPLATE_DRAFTS_IMPORTED':
      case 'BULK_TEMPLATE_IMPORTED':
        return { label: 'Bulk Imported', tone: 'cyan', icon: Folder };
      case 'FOLDER_CREATED':
      case 'FOLDER_RENAMED':
        return { label: type === 'FOLDER_RENAMED' ? 'Folder Renamed' : 'Folder Created', tone: 'cyan', icon: Folder };
      case 'FOLDER_DELETED':
        return { label: 'Folder Deleted', tone: 'red', icon: Folder };
      case 'REVIEW_STARTED':
        return { label: 'Review Started', tone: 'purple', icon: Layers };
      case 'REVIEW_SUBMITTED':
        return { label: 'Review Feedback', tone: 'purple', icon: CheckCircle2 };
      case 'REVIEW_DECIDED':
        return { label: 'Review Finalized', tone: 'green', icon: CheckCircle2 };
      case 'REVIEW_CANCELLED':
        return { label: 'Review Cancelled', tone: 'gray', icon: XCircle };
      case 'SIGNATURE_SAVED':
        return { label: 'Signature Saved', tone: 'purple', icon: ShieldCheck };
      case 'SIGNATURE_CLEARED':
        return { label: 'Signature Cleared', tone: 'amber', icon: AlertTriangle };
      case 'PKI_CERTIFICATE_ISSUED':
        return { label: 'PKI Cert Issued', tone: 'purple', icon: ShieldCheck };
      case 'AVATAR_UPDATED':
        return { label: 'Photo Updated', tone: 'purple', icon: User };
      case 'AVATAR_CLEARED':
        return { label: 'Photo Removed', tone: 'amber', icon: User };
      case 'USER_LOGIN':
        return { label: 'Sign In', tone: 'gray', icon: Lock };
      case 'USER_CREATED':
        return { label: 'User Created', tone: 'cyan', icon: User };
      case 'USER_UPDATED':
        return { label: 'User Modified', tone: 'cyan', icon: User };
      case 'USER_ACTIVATED':
        return { label: 'User Activated', tone: 'green', icon: CheckCircle2 };
      case 'USER_SUSPENDED':
        return { label: 'User Suspended', tone: 'red', icon: AlertTriangle };
      case 'USER_DELETED':
        return { label: 'User Deleted', tone: 'red', icon: XCircle };
      case 'DEPARTMENT_CREATED':
        return { label: 'Dept Created', tone: 'cyan', icon: Folder };
      case 'DEPARTMENT_UPDATED':
        return { label: 'Dept Updated', tone: 'cyan', icon: Folder };
      case 'DEPARTMENT_DELETED':
        return { label: 'Dept Deleted', tone: 'red', icon: Trash2 };
      case 'SYSTEM_RESET_ALL':
      case 'SYSTEM_WIPED':
        return { label: 'System Wiped', tone: 'red', icon: AlertTriangle };
      case 'SYSTEM_RESET_FORMS':
      case 'FORMS_WIPED':
        return { label: 'Forms Reset', tone: 'amber', icon: AlertTriangle };
      case 'COMMENT_ADDED':
        return { label: 'Comment Added', tone: 'blue', icon: FileText };
      case 'COMMENT_RESOLVED':
      case 'COMMENT_ACCEPTED':
        return { label: 'Comment Resolved', tone: 'green', icon: CheckCircle2 };
      case 'COMMENT_REJECTED':
        return { label: 'Comment Rejected', tone: 'red', icon: XCircle };
      case 'COMMENT_OPEN':
        return { label: 'Comment Reopened', tone: 'amber', icon: FileText };
      case 'COMMENT_DELETED':
        return { label: 'Comment Deleted', tone: 'red', icon: Trash2 };
      default:
        return { label: type ? type.replace(/_/g, ' ') : 'Event', tone: 'gray', icon: Activity };
    }
  };

  const hasActiveFilters = Boolean(searchTerm.trim() || selectedCategory !== 'ALL' || departmentFilter !== 'ALL');

  return (
    <div className={`sd-page sd-activity-hub animate-fade-in ${isStandalone ? 'sd-activity-standalone' : ''}`}>
      {/* Header */}
      <header className="sd-page-header">
        <div className="sd-page-header-text">
          <h1 className="sd-page-title">Activity Log</h1>
          <p className="sd-page-sub">{totalCount.toLocaleString()} total event{totalCount === 1 ? '' : 's'}</p>
        </div>

        <div className="sd-page-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            disabled={isExporting || totalCount === 0}
            title="Download complete filtered activity log as CSV"
          >
            <Download size={15} className={isExporting ? 'animate-spin' : ''} />
            <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          {!isStandalone && (
            <button
              id="btn-popout-activity"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleOpenNewWindow}
              title="Open Activity Log in a dedicated separate window"
            >
              <ExternalLink size={15} />
              <span>Separate Window</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={loadLogs}
            disabled={activityLogsLoading}
            title="Refresh activity logs"
          >
            <RefreshCw size={15} className={activityLogsLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Search & Category Filter Toolbar */}
      <div className="sd-activity-toolbar glass-card">
        <div className="sd-activity-search-wrap">
          <Search size={16} className="sd-activity-search-icon" />
          <input
            id="input-activity-search"
            type="text"
            className="sd-activity-search-input"
            placeholder="Search by user, document, action, department or hash…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="sd-icon-btn sd-activity-clear-btn"
              onClick={() => {
                setSearchTerm('');
                setDebouncedSearch('');
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Department filter (Super Admin only) */}
        {isSuperAdmin && (
          <div className="sd-activity-dept-select-wrap">
            <Filter size={14} className="sd-text-muted" />
            <select
              id="select-activity-dept"
              className="sd-activity-dept-select"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="ALL">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Category Pills */}
      <div className="sd-activity-category-pills">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`sd-category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Activity Stream List */}
      <div className="sd-activity-stream-card glass-card">
        {activityLogsLoading && !activityLogs.length ? (
          <div className="sd-activity-loading">
            <RefreshCw size={24} className="animate-spin sd-text-primary" />
            <p>Loading activity audit records from database…</p>
          </div>
        ) : activityLogs.length === 0 ? (
          <div className="sd-activity-empty">
            <History size={42} className="sd-text-muted" />
            <h3>No matching activity records</h3>
            <p>
              {hasActiveFilters
                ? 'Try broadening your search or resetting the category filters.'
                : 'No actions have been recorded yet for your account or department.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearchTerm('');
                  setDebouncedSearch('');
                  setSelectedCategory('ALL');
                  setDepartmentFilter('ALL');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="sd-activity-table-wrap">
              <table className="sd-activity-table">
                <thead>
                  <tr>
                    <th style={{ width: '170px' }}>Timestamp</th>
                    <th style={{ width: '220px' }}>User &amp; Role</th>
                    <th style={{ width: '180px' }}>Action</th>
                    <th>Resource / Details</th>
                    <th style={{ width: '130px' }}>Department</th>
                    <th style={{ width: '110px', textAlign: 'right' }}>Security Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.map(item => {
                    const badge = getActionBadge(item.actionType);
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={item.id} className="sd-activity-row">
                        {/* Timestamp */}
                        <td className="sd-activity-time-cell">
                          <div className="sd-activity-time-wrap" title={new Date(item.timestamp).toLocaleString()}>
                            <Clock size={13} className="sd-text-muted" />
                            <span>{formatDate(item.timestamp, true)}</span>
                          </div>
                        </td>

                        {/* Actor */}
                        <td className="sd-activity-actor-cell">
                          <div className="sd-activity-actor-wrap">
                            <UserAvatar
                              name={item.actorName}
                              avatar={item.actorAvatar}
                              size="sm"
                              className="sd-activity-avatar"
                            />
                            <div className="sd-activity-actor-meta">
                              <span className="sd-activity-actor-name">{item.actorName}</span>
                              <span className="sd-activity-actor-sub">
                                @{item.actorUsername}
                                <span className={`sd-role-micro sd-role-${item.actorRole}`}>
                                  {item.actorRole === 'superadmin' ? 'Super Admin' : item.actorRole === 'admin' ? 'Dept Admin' : 'User'}
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="sd-activity-action-cell">
                          <span className={`sd-badge sd-badge-${badge.tone} sd-activity-action-badge`}>
                            <BadgeIcon size={12} />
                            <span>{badge.label}</span>
                          </span>
                        </td>

                        {/* Resource */}
                        <td className="sd-activity-resource-cell">
                          <div className="sd-activity-resource-name" title={item.resourceName}>
                            {item.resourceName}
                          </div>
                        </td>

                        {/* Department */}
                        <td className="sd-activity-dept-cell">
                          <span className="sd-chip sd-chip-sm" title={item.department}>
                            {item.department}
                          </span>
                        </td>

                        {/* SHA-256 Hash */}
                        <td className="sd-activity-hash-cell" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="sd-hash-pill"
                            onClick={() => handleCopySha(item.sha256)}
                            title={`Click to copy SHA-256 fingerprint:\n${item.sha256}`}
                          >
                            {copiedSha === item.sha256 ? (
                              <>
                                <Check size={11} className="sd-text-success" />
                                <span className="sd-text-success">Copied</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheck size={11} />
                                <span>{item.sha256 ? item.sha256.slice(0, 7) : 'verified'}</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Database Pagination Bar */}
            <div className="sd-activity-pagination-bar">
              {/* Left: Range and Totals Summary */}
              <div className="sd-pagination-summary">
                <span className="sd-pagination-summary-text">
                  Showing <span className="sd-pagination-number">{fromRecord}</span>–<span className="sd-pagination-number">{toRecord}</span> of <span className="sd-pagination-number">{totalCount.toLocaleString()}</span> records
                </span>
              </div>

              {/* Right: Decoupled Page Size & Navigation Controls */}
              <div className="sd-pagination-controls">
                <div className="sd-page-size-control">
                  <label htmlFor="sd-select-page-size" className="sd-page-size-label">
                    Rows per page:
                  </label>
                  <div className="sd-select-pill-wrap">
                    <select
                      id="sd-select-page-size"
                      className="sd-page-size-select"
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      disabled={activityLogsLoading}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <ChevronDown size={13} className="sd-select-pill-arrow" />
                  </div>
                </div>

                {totalPages > 1 && (
                  <>
                    <div className="sd-pagination-divider" aria-hidden="true" />

                    <div className="sd-pagination-nav">
                      <button
                        type="button"
                        className="sd-page-btn sd-page-nav-btn"
                        onClick={() => goToPage(1)}
                        disabled={!hasPrev || activityLogsLoading}
                        title="First Page"
                        aria-label="First page"
                      >
                        <ChevronsLeft size={15} />
                      </button>
                      <button
                        type="button"
                        className="sd-page-btn sd-page-nav-btn"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={!hasPrev || activityLogsLoading}
                        title="Previous Page"
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={15} />
                      </button>

                      <div className="sd-page-numbers-group">
                        {pageNumbers.map((p, idx) => (
                          p === '...' ? (
                            <span key={`ellipsis-${idx}`} className="sd-page-ellipsis">…</span>
                          ) : (
                            <button
                              key={`page-${p}`}
                              type="button"
                              className={`sd-page-btn sd-page-num-btn ${currentPage === p ? 'active' : ''}`}
                              onClick={() => goToPage(p)}
                              disabled={activityLogsLoading}
                            >
                              {p}
                            </button>
                          )
                        ))}
                      </div>

                      <button
                        type="button"
                        className="sd-page-btn sd-page-nav-btn"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={!hasNext || activityLogsLoading}
                        title="Next Page"
                        aria-label="Next page"
                      >
                        <ChevronRight size={15} />
                      </button>
                      <button
                        type="button"
                        className="sd-page-btn sd-page-nav-btn"
                        onClick={() => goToPage(totalPages)}
                        disabled={!hasNext || activityLogsLoading}
                        title="Last Page"
                        aria-label="Last page"
                      >
                        <ChevronsRight size={15} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
