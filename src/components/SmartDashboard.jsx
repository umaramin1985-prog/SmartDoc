import React, { useMemo, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader, StatusBadge, formatDate, EmptyState, UserAvatar } from './ui';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import { TrendChart, StatusDonut, DepartmentWorkload, TemplateLeaderboard } from './DashboardCharts';
import { buildAppUrl, tabLinkProps, tabOpenProps } from '../utils/router';
import {
  Inbox, Clock, AlertTriangle, CheckCircle2, PenLine, FileText, ArrowRight,
  Building2, Eye, ShieldCheck, RefreshCw, Search, X, Filter, Zap,
  Calendar, Award, Activity, Sparkles, UserCheck, ChevronRight
} from 'lucide-react';

export const SmartDashboard = () => {
  const {
    currentUser, isAdmin, isSuperAdmin, myApprovalQueue, mySubmissions,
    departmentSubmissions, formSubmissions, formTemplates, departments,
    templateReviews, reviewsNeedingMe, setActiveTab, openSignatureModal,
    openProfileModal, refreshAll
  } = useApp();

  // --------------------------------------------------------------------------
  // Interactive Dashboard Controls
  // --------------------------------------------------------------------------
  const [scope, setScope] = useState(() => (isAdmin ? 'dept' : 'mine')); // 'mine' | 'dept' | 'enterprise'
  const [timeHorizon, setTimeHorizon] = useState('30d'); // '7d' | '30d' | '90d' | 'all'
  const [chartMode, setChartMode] = useState('area'); // 'area' | 'bar'
  const [priorityTab, setPriorityTab] = useState('decisions'); // 'decisions' | 'objections' | 'urgent' | 'reviews'

  // Interactive Drill-down filters
  const [activeFilterDate, setActiveFilterDate] = useState(null); // 'YYYY-MM-DD'
  const [activeStatusFilter, setActiveStatusFilter] = useState('ALL'); // 'ALL' | 'APPROVED' | 'IN_REVIEW' | 'OBJECTION_RAISED' | 'REJECTED'
  const [activeDeptFilter, setActiveDeptFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal inspection
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);

  // Manual refresh handler with spin animation
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshAll?.();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refreshAll]);

  // --------------------------------------------------------------------------
  // 1. Scoped Submissions Dataset
  // --------------------------------------------------------------------------
  const deptList = useMemo(
    () => departmentSubmissions || formSubmissions.filter(s => s.department === currentUser?.department || s.workflow?.some(st => st.department === currentUser?.department)),
    [departmentSubmissions, formSubmissions, currentUser?.department]
  );

  const scopedSubmissions = useMemo(() => {
    if (scope === 'mine') return mySubmissions;
    if (scope === 'dept') return deptList;
    return formSubmissions;
  }, [scope, mySubmissions, deptList, formSubmissions]);

  // --------------------------------------------------------------------------
  // 2. Time Horizon Cutoff Filtering
  // --------------------------------------------------------------------------
  const timeFilteredSubmissions = useMemo(() => {
    if (timeHorizon === 'all') return scopedSubmissions;
    const now = Date.now();
    const days = timeHorizon === '7d' ? 7 : timeHorizon === '30d' ? 30 : 90;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return scopedSubmissions.filter(s => {
      const created = new Date(s.createdAt).getTime();
      return !Number.isNaN(created) && created >= cutoff;
    });
  }, [scopedSubmissions, timeHorizon]);

  // --------------------------------------------------------------------------
  // 3. Smart Stats Calculations (Real data, zero mock numbers)
  // --------------------------------------------------------------------------
  const smartStats = useMemo(() => {
    const total = timeFilteredSubmissions.length;
    const approved = timeFilteredSubmissions.filter(s => s.status === 'APPROVED');
    const inReview = timeFilteredSubmissions.filter(s => s.status === 'IN_REVIEW');
    const objections = timeFilteredSubmissions.filter(s => s.status === 'OBJECTION_RAISED');
    const rejected = timeFilteredSubmissions.filter(s => s.status === 'REJECTED');

    // Turnaround time: average duration for decided forms (Approved / Rejected)
    const decided = timeFilteredSubmissions.filter(s => s.status === 'APPROVED' || s.status === 'REJECTED');
    let avgTurnaroundHours = 0;
    let onTimeCount = 0;

    decided.forEach(s => {
      const start = new Date(s.createdAt).getTime();
      const end = new Date(s.updatedAt || s.createdAt).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        avgTurnaroundHours += (end - start) / (1000 * 60 * 60);
      }
      if (s.expiryDate) {
        const deadline = new Date(s.expiryDate).getTime();
        if (end <= deadline) onTimeCount++;
      } else {
        onTimeCount++;
      }
    });

    if (decided.length > 0) {
      avgTurnaroundHours = avgTurnaroundHours / decided.length;
    }

    const slaOnTimeRate = decided.length > 0
      ? Math.round((onTimeCount / decided.length) * 100)
      : (total > 0 ? 100 : 0);

    // Pass rate: Approved / Decided (or including objections)
    const decidedTotal = approved.length + objections.length + rejected.length;
    const passRate = decidedTotal > 0 ? Math.round((approved.length / decidedTotal) * 100) : (approved.length > 0 ? 100 : 0);

    // Urgent items (within 48 hours of deadline or overdue)
    const now = Date.now();
    const urgentItems = inReview.filter(s => {
      if (!s.expiryDate) return false;
      const exp = new Date(s.expiryDate).getTime();
      return !Number.isNaN(exp) && (exp - now < 48 * 3600 * 1000);
    });

    // PKI Cryptographic Coverage: forms having PKI signatures
    const pkiCount = timeFilteredSubmissions.filter(s => s.pkiSignature || (s.signatures && s.signatures.length > 0)).length;
    const pkiCoverage = total > 0 ? Math.round((pkiCount / total) * 100) : 0;

    // Active Catalog throughput: templates with at least 1 submission
    const activeTemplateIds = new Set(scopedSubmissions.map(s => s.templateId).filter(Boolean));

    return {
      total,
      approvedCount: approved.length,
      inReviewCount: inReview.length,
      objectionsCount: objections.length,
      rejectedCount: rejected.length,
      urgentCount: urgentItems.length,
      avgTurnaroundHours,
      slaOnTimeRate,
      passRate,
      pkiCoverage,
      activeTemplatesCount: activeTemplateIds.size,
      totalTemplatesCount: formTemplates.length
    };
  }, [timeFilteredSubmissions, scopedSubmissions, formTemplates.length]);

  // Format turnaround label
  const turnaroundLabel = useMemo(() => {
    if (smartStats.avgTurnaroundHours === 0 && smartStats.approvedCount === 0) return '—';
    if (smartStats.avgTurnaroundHours < 24) {
      return `${Math.max(smartStats.avgTurnaroundHours.toFixed(1), 0.5)} hrs avg`;
    }
    const days = (smartStats.avgTurnaroundHours / 24).toFixed(1);
    return `${days} days avg`;
  }, [smartStats.avgTurnaroundHours, smartStats.approvedCount]);

  // --------------------------------------------------------------------------
  // 4. Timeline Trend Data Series (Daily buckets)
  // --------------------------------------------------------------------------
  const trendSeries = useMemo(() => {
    const days = timeHorizon === '7d' ? 7 : timeHorizon === '30d' ? 30 : timeHorizon === '90d' ? 90 : 30;
    const buckets = [];
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const fullDateFormatted = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

      buckets.push({
        fullDate: isoDate,
        label,
        fullDateFormatted,
        submittedCount: 0,
        approvedCount: 0,
        objectionCount: 0,
        inReviewCount: 0
      });
    }

    const bucketMap = new Map(buckets.map(b => [b.fullDate, b]));

    timeFilteredSubmissions.forEach(s => {
      if (!s.createdAt) return;
      const iso = s.createdAt.slice(0, 10);
      const b = bucketMap.get(iso);
      if (b) {
        b.submittedCount++;
        if (s.status === 'APPROVED') b.approvedCount++;
        else if (s.status === 'OBJECTION_RAISED') b.objectionCount++;
        else if (s.status === 'IN_REVIEW') b.inReviewCount++;
      }
    });

    return buckets;
  }, [timeHorizon, timeFilteredSubmissions]);

  // --------------------------------------------------------------------------
  // 5. Status Breakdown Donut Counts
  // --------------------------------------------------------------------------
  const donutCounts = useMemo(() => ({
    approved: smartStats.approvedCount,
    inReview: smartStats.inReviewCount,
    objections: smartStats.objectionsCount,
    rejected: smartStats.rejectedCount,
    total: smartStats.total
  }), [smartStats]);

  // --------------------------------------------------------------------------
  // 6. Department Workload Data
  // --------------------------------------------------------------------------
  const departmentMetrics = useMemo(() => {
    const deptMap = new Map();

    // Seed all corporate departments
    (departments || []).forEach(d => {
      deptMap.set(d.name, {
        department: d.name,
        totalSubmissions: 0,
        pendingApprovals: 0,
        approvedCount: 0,
        inReviewCount: 0,
        objectionCount: 0,
        templateCount: 0
      });
    });

    // Tally templates per department
    formTemplates.forEach(t => {
      const entry = deptMap.get(t.department);
      if (entry) entry.templateCount++;
    });

    // Tally submissions
    formSubmissions.forEach(s => {
      const entry = deptMap.get(s.department);
      if (entry) {
        entry.totalSubmissions++;
        if (s.status === 'APPROVED') entry.approvedCount++;
        else if (s.status === 'IN_REVIEW') entry.inReviewCount++;
        else if (s.status === 'OBJECTION_RAISED') entry.objectionCount++;
      }

      // Check where pending approval is currently waiting
      if (s.status === 'IN_REVIEW') {
        const step = s.workflow?.[(s.currentWorkflowStep || 1) - 1];
        if (step?.department) {
          const stepEntry = deptMap.get(step.department);
          if (stepEntry) stepEntry.pendingApprovals++;
        }
      }
    });

    return Array.from(deptMap.values()).sort((a, b) => b.totalSubmissions - a.totalSubmissions || b.pendingApprovals - a.pendingApprovals);
  }, [departments, formTemplates, formSubmissions]);

  // --------------------------------------------------------------------------
  // 7. Template Leaderboard Data
  // --------------------------------------------------------------------------
  const templateMetrics = useMemo(() => {
    const counts = new Map();

    formSubmissions.forEach(s => {
      const key = s.templateId || s.title;
      const curr = counts.get(key) || { count: 0, approved: 0, inReview: 0 };
      curr.count++;
      if (s.status === 'APPROVED') curr.approved++;
      else if (s.status === 'IN_REVIEW') curr.inReview++;
      counts.set(key, curr);
    });

    return formTemplates.map(t => {
      const usage = counts.get(t.id) || counts.get(t.title) || { count: 0, approved: 0, inReview: 0 };
      return {
        template: t,
        usageCount: usage.count,
        approvedCount: usage.approved,
        inReviewCount: usage.inReview
      };
    })
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);
  }, [formTemplates, formSubmissions]);

  // --------------------------------------------------------------------------
  // 8. Priority Radar Items
  // --------------------------------------------------------------------------
  const priorityItems = useMemo(() => {
    const now = Date.now();

    // Tab 1: Decisions needed from me or my dept
    const decisions = myApprovalQueue.map(s => ({
      s,
      reason: `Waiting for your department approval (${s.workflow?.[(s.currentWorkflowStep || 1) - 1]?.department})`,
      actionRequired: true,
      due: s.expiryDate
    }));

    // Tab 2: Objections on my submissions that require revision
    const objections = mySubmissions
      .filter(s => s.status === 'OBJECTION_RAISED')
      .map(s => ({
        s,
        reason: `Objection raised: "${s.objectionNotes || 'Reviewer requested changes'}"`,
        isObjection: true,
        due: s.expiryDate
      }));

    // Tab 3: Urgent (<48h or overdue)
    const urgent = scopedSubmissions
      .filter(s => {
        if (s.status !== 'IN_REVIEW' || !s.expiryDate) return false;
        const exp = new Date(s.expiryDate).getTime();
        return !Number.isNaN(exp) && (exp - now < 48 * 3600 * 1000);
      })
      .map(s => {
        const exp = new Date(s.expiryDate).getTime();
        const diffHours = Math.round((exp - now) / (3600 * 1000));
        return {
          s,
          reason: diffHours <= 0 ? `Overdue by ${Math.abs(diffHours)} hrs` : `Deadline in ${diffHours} hrs`,
          isUrgent: true,
          due: s.expiryDate
        };
      });

    // Tab 4: Pre-Publication Reviews
    const reviews = (reviewsNeedingMe || []).map(r => ({
      r,
      isReview: true,
      reason: r.initiatorId === currentUser?.id ? 'All reviewers submitted — accept/reject changes' : 'You are invited to review this template',
      due: null
    }));

    return { decisions, objections, urgent, reviews };
  }, [myApprovalQueue, mySubmissions, scopedSubmissions, reviewsNeedingMe, currentUser?.id]);

  const activePriorityList = useMemo(() => {
    if (priorityTab === 'decisions') return priorityItems.decisions;
    if (priorityTab === 'objections') return priorityItems.objections;
    if (priorityTab === 'urgent') return priorityItems.urgent;
    return priorityItems.reviews;
  }, [priorityTab, priorityItems]);

  // --------------------------------------------------------------------------
  // 9. Interactive Recent Submissions Feed (Filtered by Date, Status, Dept, Search)
  // --------------------------------------------------------------------------
  const filteredSubmissionsFeed = useMemo(() => {
    return scopedSubmissions.filter(s => {
      // Date filter from timeline click
      if (activeFilterDate && s.createdAt && !s.createdAt.startsWith(activeFilterDate)) {
        return false;
      }
      // Status filter from donut click or chips
      if (activeStatusFilter !== 'ALL' && s.status !== activeStatusFilter) {
        return false;
      }
      // Department filter from workload bar click
      if (activeDeptFilter && s.department !== activeDeptFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (s.title || '').toLowerCase().includes(q);
        const matchNum = (s.uniqueNumber || '').toLowerCase().includes(q);
        const matchName = (s.submittedByName || '').toLowerCase().includes(q);
        const matchDept = (s.department || '').toLowerCase().includes(q);
        if (!matchTitle && !matchNum && !matchName && !matchDept) return false;
      }
      return true;
    });
  }, [scopedSubmissions, activeFilterDate, activeStatusFilter, activeDeptFilter, searchQuery]);

  const hasActiveFilters = activeFilterDate || activeStatusFilter !== 'ALL' || activeDeptFilter || searchQuery.trim();

  const handleResetFilters = () => {
    setActiveFilterDate(null);
    setActiveStatusFilter('ALL');
    setActiveDeptFilter(null);
    setSearchQuery('');
  };

  // --------------------------------------------------------------------------
  // Render Smart Dashboard
  // --------------------------------------------------------------------------
  return (
    <div className="sd-page sd-dashboard-page animate-fade-in">
      {/* Top Header & Interactive Scope Bar */}
      <PageHeader
        title={
          <div className="sd-dashboard-title-row">
            <span>Welcome back, {currentUser.name}</span>
            <span className="sd-badge sd-badge-primary sd-badge-sm">
              <Sparkles size={11} /> Smart Cockpit
            </span>
          </div>
        }
        subtitle={`${currentUser.department} · ${formTemplates.length} form template${formTemplates.length === 1 ? '' : 's'} · ${formSubmissions.length} enterprise submission${formSubmissions.length === 1 ? '' : 's'}`}
        actions={
          <div className="sd-btn-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              title="Refresh all metrics"
            >
              <RefreshCw size={14} className={isRefreshing ? 'sd-spin' : ''} />
              <span>Sync</span>
            </button>
            <a
              className="btn btn-secondary btn-sm"
              {...tabLinkProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
            >
              <CheckCircle2 size={14} /> Submissions ({formSubmissions.length})
            </a>
            <a
              className="btn btn-primary btn-sm"
              {...tabLinkProps(buildAppUrl('forms'), () => setActiveTab('forms'))}
            >
              <Zap size={14} /> Fill a form
            </a>
          </div>
        }
      />

      {/* Interactive Scope & Time Horizon Filter Bar */}
      <div className="sd-dashboard-controls-bar sd-card">
        {/* Workspace Scope Switcher */}
        <div className="sd-control-group">
          <span className="sd-control-label">Scope:</span>
          <div className="sd-pill-toggle">
            <button
              type="button"
              className={`sd-pill-btn ${scope === 'mine' ? 'active' : ''}`}
              onClick={() => setScope('mine')}
            >
              My Workspace ({mySubmissions.length})
            </button>
            <button
              type="button"
              className={`sd-pill-btn ${scope === 'dept' ? 'active' : ''}`}
              onClick={() => setScope('dept')}
            >
              {currentUser.department} ({deptList.length})
            </button>
            <button
              type="button"
              className={`sd-pill-btn ${scope === 'enterprise' ? 'active' : ''}`}
              onClick={() => setScope('enterprise')}
            >
              Enterprise ({formSubmissions.length})
            </button>
          </div>
        </div>

        {/* Time Horizon Filter & Quick Shortcuts */}
        <div className="sd-control-group">
          <span className="sd-control-label">Time Window:</span>
          <div className="sd-pill-toggle">
            <button
              type="button"
              className={`sd-pill-btn ${timeHorizon === '7d' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('7d')}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`sd-pill-btn ${timeHorizon === '30d' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('30d')}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`sd-pill-btn ${timeHorizon === '90d' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('90d')}
            >
              90 Days
            </button>
            <button
              type="button"
              className={`sd-pill-btn ${timeHorizon === 'all' ? 'active' : ''}`}
              onClick={() => setTimeHorizon('all')}
            >
              All Time
            </button>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={openSignatureModal}
            title="Manage Digital Signature & PKI"
          >
            <PenLine size={12} /> Signature &amp; PKI
          </button>
          <a
            className="btn btn-secondary btn-xs"
            {...tabLinkProps(buildAppUrl('activity'), () => setActiveTab('activity'))}
            title="View Cryptographic Audit Ledger"
          >
            <Activity size={12} /> Activity Trail
          </a>
        </div>
      </div>

      {/* Signature & Digital Trust Reminder Banner */}
      {!currentUser.hasSignature && (
        <div className="sd-alert sd-alert-info sd-alert-action sd-glow-subtle">
          <PenLine size={18} />
          <div style={{ flex: 1 }}>
            <strong>Digital Signature Required</strong> — Setup your saved signature to sign forms and approve departmental workflows with authentic cryptographic stamping.
          </div>
          <button
            id="btn-dashboard-signature"
            className="btn btn-primary btn-sm"
            onClick={openSignatureModal}
          >
            Draw signature
          </button>
        </div>
      )}

      {/* =====================================================================
          1. Expanded Smart Stats Grid (6 High-Insight Interactive Cards)
          ===================================================================== */}
      <div className="sd-stat-grid sd-stat-grid-6">
        {/* Card 1: Awaiting Decision */}
        <div
          className="sd-card sd-stat sd-smart-stat"
          {...tabOpenProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
          style={{ cursor: 'pointer' }}
        >
          <div className="sd-stat-icon sd-tone-violet">
            <Inbox size={18} />
          </div>
          <div className="sd-stat-content">
            <div className="sd-stat-value">
              {isAdmin ? myApprovalQueue.length : smartStats.inReviewCount}
            </div>
            <div className="sd-stat-label">
              {isAdmin ? 'Awaiting My Action' : 'In Review Progress'}
            </div>
            <div className="sd-stat-micro">
              {smartStats.urgentCount > 0 ? (
                <span className="sd-badge sd-badge-amber sd-badge-xs">
                  ⚡ {smartStats.urgentCount} urgent (&lt;48h)
                </span>
              ) : (
                <span className="sd-muted sd-xs">All workflows on schedule</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Approval Velocity & SLA */}
        <div
          className="sd-card sd-stat sd-smart-stat"
          {...tabOpenProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
          style={{ cursor: 'pointer' }}
        >
          <div className="sd-stat-icon sd-tone-green">
            <Clock size={18} />
          </div>
          <div className="sd-stat-content">
            <div className="sd-stat-value sd-text-good">
              {turnaroundLabel}
            </div>
            <div className="sd-stat-label">Approval Turnaround</div>
            <div className="sd-stat-micro">
              <span className="sd-text-good sd-xs">
                ✓ {smartStats.slaOnTimeRate}% on-time SLA
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Approval Pass Rate */}
        <div
          className="sd-card sd-stat sd-smart-stat"
          onClick={() => setActiveStatusFilter('APPROVED')}
          style={{ cursor: 'pointer' }}
        >
          <div className="sd-stat-icon sd-tone-blue">
            <Award size={18} />
          </div>
          <div className="sd-stat-content">
            <div className="sd-stat-value">
              {smartStats.passRate}%
            </div>
            <div className="sd-stat-label">Approval Pass Rate</div>
            <div className="sd-stat-micro">
              <span className="sd-muted sd-xs">
                {smartStats.approvedCount} approved · {smartStats.objectionsCount} revisions
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Objections / Action Required */}
        <div
          className="sd-card sd-stat sd-smart-stat"
          onClick={() => setActiveStatusFilter('OBJECTION_RAISED')}
          style={{ cursor: 'pointer' }}
        >
          <div className="sd-stat-icon sd-tone-amber">
            <AlertTriangle size={18} />
          </div>
          <div className="sd-stat-content">
            <div className="sd-stat-value sd-text-warn">
              {smartStats.objectionsCount}
            </div>
            <div className="sd-stat-label">Revisions Requested</div>
            <div className="sd-stat-micro">
              <span className="sd-muted sd-xs">
                {smartStats.objectionsCount > 0 ? 'Requires revision to resume' : 'Zero objection backlog'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 5: Cryptographic PKI Trust Index */}
        <div
          className="sd-card sd-stat sd-smart-stat"
          onClick={() => openProfileModal(currentUser, 'pki')}
          style={{ cursor: 'pointer' }}
        >
          <div className="sd-stat-icon sd-tone-violet">
            <ShieldCheck size={18} />
          </div>
          <div className="sd-stat-content">
            <div className="sd-stat-value">
              {smartStats.pkiCoverage}%
            </div>
            <div className="sd-stat-label">Digital PKI Coverage</div>
            <div className="sd-stat-micro">
              <span className="sd-muted sd-xs">RSA-2048 Non-repudiation</span>
            </div>
          </div>
        </div>

        {/* Card 6: Active Catalog Throughput */}
        <div
          className="sd-card sd-stat sd-smart-stat"
          {...tabOpenProps(buildAppUrl('forms'), () => setActiveTab('forms'))}
          style={{ cursor: 'pointer' }}
        >
          <div className="sd-stat-icon sd-tone-blue">
            <FileText size={18} />
          </div>
          <div className="sd-stat-content">
            <div className="sd-stat-value">
              {smartStats.activeTemplatesCount} <span className="sd-stat-total">/ {smartStats.totalTemplatesCount}</span>
            </div>
            <div className="sd-stat-label">Active Templates Used</div>
            <div className="sd-stat-micro">
              <span className="sd-muted sd-xs">
                {smartStats.total} submissions in window
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. Zero-Scroll 2×3 Smart Cockpit Bento Grid
          ===================================================================== */}
      <div className="sd-cockpit-bento-grid">
        {/* Cell 1 (Row 1, Col 1): Trend Area / Bar Chart */}
        <TrendChart
          trendData={trendSeries}
          timeHorizon={timeHorizon}
          chartMode={chartMode}
          setChartMode={setChartMode}
          onSelectDate={(d) => {
            setActiveFilterDate(activeFilterDate === d.fullDate ? null : d.fullDate);
          }}
          activeFilterDate={activeFilterDate}
        />

        {/* Cell 2 (Row 1, Col 2): Radial Status Distribution Donut */}
        <StatusDonut
          statusCounts={donutCounts}
          activeStatusFilter={activeStatusFilter}
          onSelectStatus={(status) => setActiveStatusFilter(status)}
        />

        {/* Cell 3 (Row 1, Col 3): Priority Action Radar */}
        <section className="sd-card sd-panel sd-bento-panel">
          <header className="sd-panel-header">
            <div className="sd-panel-title-group">
              <h2>Priority Action Radar</h2>
              <span className="sd-badge sd-badge-gray sd-badge-xs">
                {priorityItems.decisions.length + priorityItems.objections.length} active
              </span>
            </div>

            {/* Priority Tabs */}
            <div className="sd-pill-toggle sd-pill-toggle-sm">
              <button
                type="button"
                className={`sd-pill-btn ${priorityTab === 'decisions' ? 'active' : ''}`}
                onClick={() => setPriorityTab('decisions')}
                title="Awaiting My Approval"
              >
                Approvals ({priorityItems.decisions.length})
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${priorityTab === 'objections' ? 'active' : ''}`}
                onClick={() => setPriorityTab('objections')}
                title="Objections Needing Revision"
              >
                Objections ({priorityItems.objections.length})
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${priorityTab === 'urgent' ? 'active' : ''}`}
                onClick={() => setPriorityTab('urgent')}
                title="Expiring Soon (<48h)"
              >
                Urgent ({priorityItems.urgent.length})
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${priorityTab === 'reviews' ? 'active' : ''}`}
                onClick={() => setPriorityTab('reviews')}
                title="Pre-Publication Reviews"
              >
                Reviews ({priorityItems.reviews.length})
              </button>
            </div>
          </header>

          {activePriorityList.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="You're all caught up!"
              text={
                priorityTab === 'decisions'
                  ? 'No submissions currently awaiting your departmental approval.'
                  : priorityTab === 'objections'
                  ? 'No objections raised on your submissions. Everything is flowing smoothly.'
                  : priorityTab === 'urgent'
                  ? 'No documents currently approaching deadline urgency (<48h).'
                  : 'No pre-publication template reviews requiring your feedback.'
              }
            />
          ) : (
            <ul className="sd-list sd-priority-list">
              {activePriorityList.slice(0, 6).map((item, idx) => {
                if (item.isReview) {
                  const r = item.r;
                  return (
                    <li
                      key={r.id || idx}
                      className="sd-list-item"
                      {...tabOpenProps(buildAppUrl('reviews', { review: r.id }), () => setActiveTab('reviews'))}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="sd-list-title">
                          {r.title} <span className="sd-badge sd-badge-violet sd-badge-xs">Template Review</span>
                        </div>
                        <div className="sd-muted sd-xs">{item.reason} · {r.department}</div>
                      </div>
                      <div className="sd-flex-gap-xs">
                        <a
                          className="btn btn-secondary btn-xs"
                          {...tabLinkProps(buildAppUrl('reviews', { review: r.id }), () => setActiveTab('reviews'))}
                        >
                          Open Review
                        </a>
                      </div>
                    </li>
                  );
                }

                const s = item.s;
                return (
                  <li
                    key={s.id || idx}
                    className={`sd-list-item ${item.isObjection ? 'sd-list-item-warn' : item.isUrgent ? 'sd-list-item-urgent' : ''}`}
                    {...tabOpenProps(buildAppUrl('approvals', { submission: s.id }), () => setSelectedSubmissionId(s.id))}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="sd-list-title">
                        {s.title} <span className="sd-muted sd-mono">{s.uniqueNumber}</span>
                      </div>
                      <div className="sd-muted sd-xs">
                        {item.reason} {item.due && `· due ${formatDate(item.due)}`}
                      </div>
                    </div>
                    <div className="sd-flex-gap-xs">
                      <StatusBadge status={s.status} />
                      <a
                        className="btn btn-secondary btn-xs"
                        title="Open details"
                        {...tabLinkProps(buildAppUrl('approvals', { submission: s.id }), (e) => {
                          e.stopPropagation();
                          setSelectedSubmissionId(s.id);
                        })}
                      >
                        <Eye size={12} />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Cell 4 (Row 2, Col 1): Live Filterable Submissions Feed */}
        <section className="sd-card sd-panel sd-bento-panel">
          <header className="sd-panel-header">
            <div className="sd-panel-title-group">
              <h2>Recent Submissions</h2>
              <span className="sd-badge sd-badge-gray sd-badge-xs">
                {filteredSubmissionsFeed.length} of {scopedSubmissions.length}
              </span>
            </div>

            <a
              className="sd-link"
              {...tabLinkProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
            >
              All Submissions <ArrowRight size={13} />
            </a>
          </header>

          {/* Interactive Search & Status Chips Filter */}
          <div className="sd-feed-filter-bar">
            <div className="sd-feed-search-wrap">
              <Search size={14} className="sd-search-icon" />
              <input
                type="text"
                placeholder="Search by title, number, submitter or dept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sd-feed-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="sd-search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="sd-feed-status-chips">
              {['ALL', 'IN_REVIEW', 'APPROVED', 'OBJECTION_RAISED', 'REJECTED'].map(st => {
                const isSelected = activeStatusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    className={`sd-status-chip-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => setActiveStatusFilter(st)}
                  >
                    {st === 'ALL' ? 'All' : st === 'IN_REVIEW' ? 'Review' : st === 'APPROVED' ? 'Approved' : st === 'OBJECTION_RAISED' ? 'Revisions' : 'Rejected'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Filter Indicators */}
          {hasActiveFilters && (
            <div className="sd-active-filter-banner">
              <div className="sd-active-filter-tags">
                <span className="sd-muted sd-xs">Active filters:</span>
                {activeFilterDate && (
                  <span className="sd-filter-pill">
                    Date: {activeFilterDate}
                    <button type="button" onClick={() => setActiveFilterDate(null)}>×</button>
                  </span>
                )}
                {activeStatusFilter !== 'ALL' && (
                  <span className="sd-filter-pill">
                    Status: {activeStatusFilter}
                    <button type="button" onClick={() => setActiveStatusFilter('ALL')}>×</button>
                  </span>
                )}
                {activeDeptFilter && (
                  <span className="sd-filter-pill">
                    Dept: {activeDeptFilter}
                    <button type="button" onClick={() => setActiveDeptFilter(null)}>×</button>
                  </span>
                )}
                {searchQuery && (
                  <span className="sd-filter-pill">
                    Query: "{searchQuery}"
                    <button type="button" onClick={() => setSearchQuery('')}>×</button>
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={handleResetFilters}
              >
                Reset All
              </button>
            </div>
          )}

          {filteredSubmissionsFeed.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No matching submissions"
              text={
                hasActiveFilters
                  ? "No documents match the active search or chart filter criteria. Try resetting filters."
                  : scope === 'mine'
                  ? "You haven't submitted any forms yet. Pick a template from Forms & Templates to get started."
                  : "No documents submitted in this scope."
              }
              action={
                hasActiveFilters ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
                    Clear Filters
                  </button>
                ) : (
                  <a
                    className="btn btn-primary btn-sm"
                    {...tabLinkProps(buildAppUrl('forms'), () => setActiveTab('forms'))}
                  >
                    Explore Templates
                  </a>
                )
              }
            />
          ) : (
            <ul className="sd-list">
              {filteredSubmissionsFeed.slice(0, 7).map(s => (
                <li
                  key={s.id}
                  className="sd-list-item"
                  {...tabOpenProps(buildAppUrl('approvals', { submission: s.id }), () => setSelectedSubmissionId(s.id))}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sd-list-title sd-truncate">
                      {s.title} <span className="sd-muted sd-mono">{s.uniqueNumber}</span>
                    </div>
                    <div className="sd-muted sd-xs">
                      v{s.version} · By {s.submittedByName} ({s.department}) · {formatDate(s.createdAt)}
                    </div>
                  </div>
                  <div className="sd-flex-gap-xs" style={{ flexShrink: 0 }}>
                    <StatusBadge status={s.status} />
                    <a
                      className="btn btn-secondary btn-xs"
                      title="Open details"
                      {...tabLinkProps(buildAppUrl('approvals', { submission: s.id }), (e) => {
                        e.stopPropagation();
                        setSelectedSubmissionId(s.id);
                      })}
                    >
                      <Eye size={12} />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Cell 5 (Row 2, Col 2): Department Workload & Bottlenecks */}
        <DepartmentWorkload
          departmentMetrics={departmentMetrics}
          activeDeptFilter={activeDeptFilter}
          onSelectDept={(dept) => setActiveDeptFilter(dept)}
        />

        {/* Cell 6 (Row 2, Col 3): Most Utilized Word Templates */}
        <TemplateLeaderboard
          templateMetrics={templateMetrics}
          onFillTemplate={(templateId) => {
            setActiveTab('forms');
          }}
        />
      </div>

      {/* Submission Detail Modal */}
      {selectedSubmissionId && (
        <SubmissionDetailModal
          submissionId={selectedSubmissionId}
          initialViewAs={scope === 'mine' ? 'submitter' : 'auto'}
          onClose={() => setSelectedSubmissionId(null)}
        />
      )}
    </div>
  );
};
