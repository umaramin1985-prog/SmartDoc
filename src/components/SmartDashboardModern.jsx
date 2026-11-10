import React, { useMemo, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge, formatDate, EmptyState, UserAvatar, roleLabel } from './ui';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import { buildAppUrl, tabLinkProps, tabOpenProps } from '../utils/router';
import {
  Inbox, Clock, AlertTriangle, CheckCircle2, PenLine, FileText, ArrowRight,
  Building2, Eye, ShieldCheck, RefreshCw, Search, X, Zap,
  Calendar, Award, Activity, Sparkles, Layers, TrendingUp, BarChart2,
  GitMerge, Kanban, Table2, Check, Flame, Lock, ArrowUpRight, Filter
} from 'lucide-react';

// Mini SVG Sparkline for KPI Cards
const MiniSparkline = ({ values = [], color = 'var(--primary-500)', id = 'sp' }) => {
  const pts = values.length > 1 ? values : [0, 1, 0, 2, 1, 3, 2];
  const w = 88;
  const h = 28;
  const max = Math.max(...pts, 1);
  const coords = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * (w - 4) + 2,
    y: h - 3 - (v / max) * (h - 6)
  }));
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const c = coords[i];
    const n = coords[i + 1];
    const cx1 = c.x + (n.x - c.x) * 0.4;
    const cx2 = n.x - (n.x - c.x) * 0.4;
    d += ` C ${cx1} ${c.y}, ${cx2} ${n.y}, ${n.x} ${n.y}`;
  }
  const area = `${d} L ${coords[coords.length - 1].x} ${h} L ${coords[0].x} ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sdm-sparkline-svg" aria-hidden="true">
      <defs>
        <linearGradient id={`sdmSpark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sdmSpark-${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="2.5"
        fill={color}
      />
    </svg>
  );
};

export const SmartDashboardModern = () => {
  const {
    currentUser, isAdmin, myApprovalQueue, mySubmissions,
    departmentSubmissions, formSubmissions, formTemplates, departments,
    reviewsNeedingMe, setActiveTab, openSignatureModal,
    openProfileModal, refreshAll
  } = useApp();

  // Controls state
  const [scope, setScope] = useState(() => (isAdmin ? 'dept' : 'mine')); // 'mine' | 'dept' | 'enterprise'
  const [timeHorizon, setTimeHorizon] = useState('30d'); // '7d' | '30d' | '90d' | 'all'
  const [analyticsTab, setAnalyticsTab] = useState('area'); // 'area' | 'bar' | 'funnel'
  const [insightTab, setInsightTab] = useState('departments'); // 'departments' | 'status' | 'templates'
  const [boardMode, setBoardMode] = useState('kanban'); // 'kanban' | 'table'

  // Interactive drill-down filters
  const [activeFilterDate, setActiveFilterDate] = useState(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState('ALL');
  const [activeDeptFilter, setActiveDeptFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredChartIdx, setHoveredChartIdx] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshAll?.();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [refreshAll]);

  const greetingPrefix = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // 1. Scoped Submissions
  const deptList = useMemo(
    () => departmentSubmissions || formSubmissions.filter(
      s => s.department === currentUser?.department || s.workflow?.some(st => st.department === currentUser?.department)
    ),
    [departmentSubmissions, formSubmissions, currentUser?.department]
  );

  const scopedSubmissions = useMemo(() => {
    if (scope === 'mine') return mySubmissions;
    if (scope === 'dept') return deptList;
    return formSubmissions;
  }, [scope, mySubmissions, deptList, formSubmissions]);

  // 2. Time-Window Filtered Submissions
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

  // 3. Comprehensive Metrics & Operational Health Score
  const stats = useMemo(() => {
    const total = timeFilteredSubmissions.length;
    const approved = timeFilteredSubmissions.filter(s => s.status === 'APPROVED');
    const inReview = timeFilteredSubmissions.filter(s => s.status === 'IN_REVIEW');
    const objections = timeFilteredSubmissions.filter(s => s.status === 'OBJECTION_RAISED');
    const rejected = timeFilteredSubmissions.filter(s => s.status === 'REJECTED');

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

    if (decided.length > 0) avgTurnaroundHours /= decided.length;

    const slaOnTimeRate = decided.length > 0
      ? Math.round((onTimeCount / decided.length) * 100)
      : 100;

    const decidedTotal = approved.length + objections.length + rejected.length;
    const passRate = decidedTotal > 0
      ? Math.round((approved.length / decidedTotal) * 100)
      : (approved.length > 0 ? 100 : 100);

    const now = Date.now();
    const urgentItems = inReview.filter(s => {
      if (!s.expiryDate) return false;
      const exp = new Date(s.expiryDate).getTime();
      return !Number.isNaN(exp) && (exp - now < 48 * 3600 * 1000);
    });

    const pkiCount = timeFilteredSubmissions.filter(
      s => s.pkiSignature || (s.signatures && s.signatures.length > 0)
    ).length;
    const pkiCoverage = total > 0 ? Math.round((pkiCount / total) * 100) : (currentUser?.hasSignature ? 100 : 0);

    const activeTemplateIds = new Set(scopedSubmissions.map(s => s.templateId).filter(Boolean));
    const catalogUtilization = formTemplates.length > 0
      ? Math.round((activeTemplateIds.size / formTemplates.length) * 100)
      : 0;

    // Composite Workspace Health Index (0-100)
    const healthScore = Math.round(
      slaOnTimeRate * 0.4 + passRate * 0.35 + pkiCoverage * 0.25
    );

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
      pkiCount,
      pkiCoverage,
      activeTemplatesCount: activeTemplateIds.size,
      totalTemplatesCount: formTemplates.length,
      catalogUtilization,
      healthScore
    };
  }, [timeFilteredSubmissions, scopedSubmissions, formTemplates.length, currentUser?.hasSignature]);

  const turnaroundLabel = useMemo(() => {
    if (stats.avgTurnaroundHours === 0 && stats.approvedCount === 0) return '—';
    if (stats.avgTurnaroundHours < 24) {
      return `${Math.max(stats.avgTurnaroundHours.toFixed(1), 0.5)}h`;
    }
    return `${(stats.avgTurnaroundHours / 24).toFixed(1)}d`;
  }, [stats.avgTurnaroundHours, stats.approvedCount]);

  // 4. Daily Trend Buckets
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

  const recent7Submitted = useMemo(() => trendSeries.slice(-7).map(d => d.submittedCount), [trendSeries]);
  const recent7Approved = useMemo(() => trendSeries.slice(-7).map(d => d.approvedCount), [trendSeries]);

  // 5. Department Matrix Data
  const departmentMetrics = useMemo(() => {
    const deptMap = new Map();
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

    formTemplates.forEach(t => {
      const entry = deptMap.get(t.department);
      if (entry) entry.templateCount++;
    });

    formSubmissions.forEach(s => {
      const entry = deptMap.get(s.department);
      if (entry) {
        entry.totalSubmissions++;
        if (s.status === 'APPROVED') entry.approvedCount++;
        else if (s.status === 'IN_REVIEW') entry.inReviewCount++;
        else if (s.status === 'OBJECTION_RAISED') entry.objectionCount++;
      }
      if (s.status === 'IN_REVIEW') {
        const step = s.workflow?.[(s.currentWorkflowStep || 1) - 1];
        if (step?.department) {
          const stepEntry = deptMap.get(step.department);
          if (stepEntry) stepEntry.pendingApprovals++;
        }
      }
    });

    return Array.from(deptMap.values()).sort(
      (a, b) => b.totalSubmissions - a.totalSubmissions || b.pendingApprovals - a.pendingApprovals
    );
  }, [departments, formTemplates, formSubmissions]);

  // 6. Template Leaderboard
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

    return formTemplates
      .map(t => {
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

  // 7. Filtered Submissions for Pipeline Board & Table
  const filteredSubmissions = useMemo(() => {
    return scopedSubmissions.filter(s => {
      if (activeFilterDate && s.createdAt && !s.createdAt.startsWith(activeFilterDate)) return false;
      if (activeStatusFilter !== 'ALL' && s.status !== activeStatusFilter) return false;
      if (activeDeptFilter && s.department !== activeDeptFilter) return false;
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

  // 8. Kanban Columns
  const kanbanColumns = useMemo(() => {
    const myQueueIds = new Set(myApprovalQueue.map(s => s.id));
    const actionable = filteredSubmissions.filter(s => myQueueIds.has(s.id));
    const inReview = filteredSubmissions.filter(s => s.status === 'IN_REVIEW' && !myQueueIds.has(s.id));
    const revisions = filteredSubmissions.filter(s => s.status === 'OBJECTION_RAISED' || s.status === 'REJECTED');
    const approved = filteredSubmissions.filter(s => s.status === 'APPROVED');

    return [
      {
        id: 'actionable',
        title: 'Needs My Decision',
        tone: 'violet',
        count: actionable.length + (reviewsNeedingMe?.length || 0),
        items: actionable,
        reviews: reviewsNeedingMe || []
      },
      {
        id: 'in_review',
        title: 'In Department Review',
        tone: 'blue',
        count: inReview.length,
        items: inReview,
        reviews: []
      },
      {
        id: 'revisions',
        title: 'Revisions & Exceptions',
        tone: 'amber',
        count: revisions.length,
        items: revisions,
        reviews: []
      },
      {
        id: 'approved',
        title: 'Approved & Sealed',
        tone: 'emerald',
        count: approved.length,
        items: approved,
        reviews: []
      }
    ];
  }, [filteredSubmissions, myApprovalQueue, reviewsNeedingMe]);

  const hasActiveFilters = activeFilterDate || activeStatusFilter !== 'ALL' || activeDeptFilter || searchQuery.trim();

  const handleResetFilters = () => {
    setActiveFilterDate(null);
    setActiveStatusFilter('ALL');
    setActiveDeptFilter(null);
    setSearchQuery('');
  };

  // Chart geometry for Zone 1
  const chartW = 640;
  const chartH = 185;
  const pad = { top: 16, right: 18, bottom: 26, left: 30 };
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;
  const maxChartVal = useMemo(() => {
    if (!trendSeries.length) return 4;
    return Math.max(...trendSeries.map(d => Math.max(d.submittedCount, d.approvedCount)), 3) + 1;
  }, [trendSeries]);

  const getX = (i) => (trendSeries.length <= 1 ? pad.left + innerW / 2 : pad.left + (i / (trendSeries.length - 1)) * innerW);
  const getY = (v) => pad.top + innerH - (v / maxChartVal) * innerH;

  const { subLine, subArea, appLine, appArea } = useMemo(() => {
    if (!trendSeries.length) return { subLine: '', subArea: '', appLine: '', appArea: '' };
    const base = pad.top + innerH;
    const smooth = (pts) => {
      if (pts.length === 1) return `M ${pts[0].x - 20} ${pts[0].y} L ${pts[0].x + 20} ${pts[0].y}`;
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const c = pts[i];
        const n = pts[i + 1];
        const cx1 = c.x + (n.x - c.x) * 0.36;
        const cx2 = n.x - (n.x - c.x) * 0.36;
        d += ` C ${cx1} ${c.y}, ${cx2} ${n.y}, ${n.x} ${n.y}`;
      }
      return d;
    };
    const sPts = trendSeries.map((d, i) => ({ x: getX(i), y: getY(d.submittedCount) }));
    const aPts = trendSeries.map((d, i) => ({ x: getX(i), y: getY(d.approvedCount) }));
    const sL = smooth(sPts);
    const aL = smooth(aPts);
    return {
      subLine: sL,
      subArea: `${sL} L ${sPts[sPts.length - 1].x} ${base} L ${sPts[0].x} ${base} Z`,
      appLine: aL,
      appArea: `${aL} L ${aPts[aPts.length - 1].x} ${base} L ${aPts[0].x} ${base} Z`
    };
  }, [trendSeries, maxChartVal]);

  const hoveredPoint = hoveredChartIdx !== null ? trendSeries[hoveredChartIdx] : null;

  // Health gauge ring
  const gaugeR = 21;
  const gaugeCirc = 2 * Math.PI * gaugeR;
  const gaugeDash = (stats.healthScore / 100) * gaugeCirc;

  return (
    <div className="sd-page sdm-page animate-fade-in">
      {/* =====================================================================
          1. Modern Executive Command Header
          ===================================================================== */}
      <header className="sdm-hero-bar sd-card">
        <div className="sdm-hero-left">
          {/* Radial Operational Health Score */}
          <div className="sdm-health-ring-wrap" title={`Workspace Health Index: ${stats.healthScore}/100 (SLA + Pass Rate + PKI)`}>
            <svg viewBox="0 0 52 52" className="sdm-health-ring-svg">
              <circle cx="26" cy="26" r={gaugeR} fill="none" stroke="var(--bg-card-subtle)" strokeWidth="4.5" />
              <circle
                cx="26"
                cy="26"
                r={gaugeR}
                fill="none"
                stroke="var(--primary-500)"
                strokeWidth="4.5"
                strokeDasharray={`${gaugeDash} ${gaugeCirc}`}
                strokeLinecap="round"
                transform="rotate(-90 26 26)"
              />
            </svg>
            <div className="sdm-health-ring-val">{stats.healthScore}</div>
          </div>

          <div className="sdm-hero-titles">
            <div className="sdm-hero-title-row">
              <h1 className="sdm-title">{greetingPrefix}, {currentUser.name}</h1>
              <span className="sdm-pill-badge sdm-pill-primary">
                <Sparkles size={11} /> Modern Pulse
              </span>
              <span className="sdm-pill-badge sdm-pill-neutral">
                <Building2 size={11} /> {currentUser.department}
              </span>
              <button
                type="button"
                className={`sdm-pill-badge ${currentUser.hasSignature ? 'sdm-pill-emerald' : 'sdm-pill-amber'}`}
                onClick={openSignatureModal}
                style={{ cursor: 'pointer' }}
                title="Manage Digital Signature & PKI Certificate"
              >
                <ShieldCheck size={11} />
                {currentUser.hasSignature ? 'PKI Sealed' : 'Setup Signature'}
              </button>
            </div>
            <p className="sdm-subtitle">
              {roleLabel(currentUser.systemRole)} · <strong>{myApprovalQueue.length}</strong> awaiting decision · <strong>{stats.slaOnTimeRate}%</strong> SLA compliance · <strong>{formTemplates.length}</strong> active templates
            </p>
          </div>
        </div>

        <div className="sdm-hero-right">
          {/* Scope Segmented Bar */}
          <div className="sd-pill-toggle">
            {[
              { id: 'mine', label: 'My Workspace', count: mySubmissions.length },
              { id: 'dept', label: currentUser.department, count: deptList.length },
              { id: 'enterprise', label: 'Enterprise', count: formSubmissions.length }
            ].map(sc => (
              <button
                key={sc.id}
                type="button"
                className={`sd-pill-btn ${scope === sc.id ? 'active' : ''}`}
                onClick={() => setScope(sc.id)}
              >
                <span>{sc.label}</span>
                <span className="sdm-seg-count">{sc.count}</span>
              </button>
            ))}
          </div>

          {/* Time Window Segmented Bar */}
          <div className="sd-pill-toggle">
            {[
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: '90d', label: '90D' },
              { id: 'all', label: 'All' }
            ].map(tw => (
              <button
                key={tw.id}
                type="button"
                className={`sd-pill-btn ${timeHorizon === tw.id ? 'active' : ''}`}
                onClick={() => setTimeHorizon(tw.id)}
              >
                {tw.label}
              </button>
            ))}
          </div>

          <div className="sd-btn-row">
            <div className="sd-pill-toggle sd-pill-toggle-sm" role="group" aria-label="Dashboard mode">
              <a
                className="sd-pill-btn"
                {...tabLinkProps(buildAppUrl('dashboard'), () => setActiveTab('dashboard'))}
                title="Switch to Executive Cockpit View"
              >
                <span>Cockpit</span>
              </a>
              <a
                className="sd-pill-btn active"
                {...tabLinkProps(buildAppUrl('dashboard-modern'), () => setActiveTab('dashboard-modern'))}
                title="Kanban & Analytics Board"
              >
                <Sparkles size={12} />
                <span>Kanban &amp; Analytics</span>
              </a>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              title="Sync live workspace metrics"
            >
              <RefreshCw size={13} className={isRefreshing ? 'sd-spin' : ''} />
            </button>
            <a
              className="btn btn-primary btn-sm"
              {...tabLinkProps(buildAppUrl('forms'), () => setActiveTab('forms'))}
            >
              <Zap size={13} />
              <span>New Submission</span>
            </a>
          </div>
        </div>
      </header>

      {/* =====================================================================
          2. 4-Column Sparkline Telemetry Strip
          ===================================================================== */}
      <section className="sdm-kpi-grid">
        {/* Card 1: Actionable Queue & Volume */}
        <div
          className={`sd-card sdm-kpi-card ${activeStatusFilter === 'IN_REVIEW' ? 'is-active' : ''}`}
          onClick={() => setActiveStatusFilter(activeStatusFilter === 'IN_REVIEW' ? 'ALL' : 'IN_REVIEW')}
        >
          <div className="sdm-kpi-head">
            <span className="sdm-kpi-label">{isAdmin ? 'Awaiting My Decision' : 'Active Review Queue'}</span>
            <span className="sdm-kpi-icon sdm-tone-violet"><Inbox size={15} /></span>
          </div>
          <div className="sdm-kpi-body">
            <div>
              <div className="sdm-kpi-val">{isAdmin ? myApprovalQueue.length : stats.inReviewCount}</div>
              <div className="sdm-kpi-sub">
                {stats.urgentCount > 0 ? (
                  <span className="sd-text-warn"><Flame size={11} /> {stats.urgentCount} due &lt;48h</span>
                ) : (
                  <span>{stats.inReviewCount} in pipeline · {stats.total} total</span>
                )}
              </div>
            </div>
            <MiniSparkline values={recent7Submitted} color="var(--primary-500)" id="vol" />
          </div>
        </div>

        {/* Card 2: Approval Turnaround & SLA */}
        <div
          className="sd-card sdm-kpi-card"
          {...tabOpenProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
        >
          <div className="sdm-kpi-head">
            <span className="sdm-kpi-label">Turnaround &amp; SLA Compliance</span>
            <span className="sdm-kpi-icon sdm-tone-emerald"><Clock size={15} /></span>
          </div>
          <div className="sdm-kpi-body">
            <div>
              <div className="sdm-kpi-val">{turnaroundLabel}</div>
              <div className="sdm-kpi-sub">
                <span className="sd-text-good">✓ {stats.slaOnTimeRate}% on-time SLA</span>
              </div>
            </div>
            <MiniSparkline values={recent7Approved} color="#10b981" id="sla" />
          </div>
        </div>

        {/* Card 3: Conversion & Quality */}
        <div
          className={`sd-card sdm-kpi-card ${activeStatusFilter === 'APPROVED' ? 'is-active' : ''}`}
          onClick={() => setActiveStatusFilter(activeStatusFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
        >
          <div className="sdm-kpi-head">
            <span className="sdm-kpi-label">Approval Conversion Rate</span>
            <span className="sdm-kpi-icon sdm-tone-blue"><Award size={15} /></span>
          </div>
          <div className="sdm-kpi-body">
            <div style={{ flex: 1 }}>
              <div className="sdm-kpi-val">{stats.passRate}%</div>
              <div className="sdm-kpi-sub">
                {stats.approvedCount} approved · {stats.objectionsCount} revisions
              </div>
              <div className="sdm-mini-multi-bar">
                <div className="sdm-multi-seg emerald" style={{ width: `${stats.total ? (stats.approvedCount / stats.total) * 100 : 50}%` }} />
                <div className="sdm-multi-seg violet" style={{ width: `${stats.total ? (stats.inReviewCount / stats.total) * 100 : 30}%` }} />
                <div className="sdm-multi-seg amber" style={{ width: `${stats.total ? (stats.objectionsCount / stats.total) * 100 : 20}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Cryptographic Trust & Catalog */}
        <div
          className="sd-card sdm-kpi-card"
          onClick={() => openProfileModal(currentUser, 'pki')}
        >
          <div className="sdm-kpi-head">
            <span className="sdm-kpi-label">PKI Trust &amp; Catalog Reach</span>
            <span className="sdm-kpi-icon sdm-tone-violet"><Lock size={15} /></span>
          </div>
          <div className="sdm-kpi-body">
            <div style={{ flex: 1 }}>
              <div className="sdm-kpi-val">
                {stats.pkiCoverage}% <span className="sdm-kpi-unit">RSA-2048</span>
              </div>
              <div className="sdm-kpi-sub">
                {stats.activeTemplatesCount}/{stats.totalTemplatesCount} templates active ({stats.catalogUtilization}%)
              </div>
              <div className="sdm-mini-multi-bar">
                <div className="sdm-multi-seg violet" style={{ width: `${stats.pkiCoverage}%` }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. Modern 2-Row Workspace Grid (Analytics + Insights + Kanban/Table)
          ===================================================================== */}
      <div className="sdm-workspace-grid">
        {/* Top-Left: Multi-Mode Velocity Canvas & Workflow Stage Funnel */}
        <section className="sd-card sdm-panel sdm-analytics-panel">
          <header className="sdm-panel-header">
            <div className="sdm-panel-title-group">
              <div className="sdm-panel-icon sdm-tone-violet"><TrendingUp size={15} /></div>
              <div>
                <h2 className="sdm-panel-title">Workflow Velocity &amp; Conversion</h2>
                <p className="sdm-panel-subtitle">
                  {analyticsTab === 'funnel'
                    ? 'End-to-end stage progression from submission to cryptographic seal'
                    : `Daily submission & approval cadence (${stats.total} documents in window)`}
                </p>
              </div>
            </div>

            <div className="sd-pill-toggle sd-pill-toggle-sm">
              <button
                type="button"
                className={`sd-pill-btn ${analyticsTab === 'area' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('area')}
              >
                <TrendingUp size={12} /> Curve
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${analyticsTab === 'bar' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('bar')}
              >
                <BarChart2 size={12} /> Bars
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${analyticsTab === 'funnel' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('funnel')}
              >
                <GitMerge size={12} /> Funnel
              </button>
            </div>
          </header>

          {analyticsTab === 'funnel' ? (
            <div className="sdm-funnel-container">
              {[
                {
                  stage: '1. Submitted in Window',
                  count: stats.total,
                  pct: 100,
                  desc: 'Initiated by submitters across active templates',
                  color: 'var(--primary-500)'
                },
                {
                  stage: '2. Cryptographically Signed (PKI)',
                  count: stats.pkiCount,
                  pct: stats.total > 0 ? Math.round((stats.pkiCount / stats.total) * 100) : 0,
                  desc: 'Sealed with RSA-2048 non-repudiation signature',
                  color: '#6366f1'
                },
                {
                  stage: '3. Active Departmental Review',
                  count: stats.inReviewCount + stats.approvedCount,
                  pct: stats.total > 0 ? Math.round(((stats.inReviewCount + stats.approvedCount) / stats.total) * 100) : 0,
                  desc: 'Routed through multi-step department approval chains',
                  color: '#3b82f6'
                },
                {
                  stage: '4. Final Approved & Archived',
                  count: stats.approvedCount,
                  pct: stats.total > 0 ? Math.round((stats.approvedCount / stats.total) * 100) : 0,
                  desc: 'Completed all workflow steps without pending objections',
                  color: '#10b981'
                }
              ].map((st, i) => (
                <div key={st.stage} className="sdm-funnel-step">
                  <div className="sdm-funnel-meta">
                    <span className="sdm-funnel-name">{st.stage}</span>
                    <span className="sdm-funnel-stats">
                      <strong>{st.count}</strong> <span className="sd-muted">({st.pct}%)</span>
                    </span>
                  </div>
                  <div className="sdm-funnel-track">
                    <div
                      className="sdm-funnel-fill"
                      style={{ width: `${Math.max(st.pct, 6)}%`, background: st.color }}
                    />
                  </div>
                  <div className="sdm-funnel-desc">{st.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sdm-chart-wrap">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="sdm-chart-svg" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sdmSubArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-500)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--primary-500)" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="sdmAppArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0, 0.5, 1].map((ratio, idx) => {
                  const val = Math.round(maxChartVal * ratio);
                  const y = getY(val);
                  return (
                    <g key={idx}>
                      <line x1={pad.left} y1={y} x2={chartW - pad.right} y2={y} className="sdm-grid-line" />
                      <text x={pad.left - 6} y={y + 3} className="sdm-axis-text" textAnchor="end">{val}</text>
                    </g>
                  );
                })}

                {hoveredChartIdx !== null && trendSeries[hoveredChartIdx] && (
                  <line
                    x1={getX(hoveredChartIdx)}
                    y1={pad.top}
                    x2={getX(hoveredChartIdx)}
                    y2={pad.top + innerH}
                    className="sdm-crosshair"
                  />
                )}

                {analyticsTab === 'area' ? (
                  <>
                    <path d={subArea} fill="url(#sdmSubArea)" />
                    <path d={appArea} fill="url(#sdmAppArea)" />
                    <path d={appLine} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 4" />
                    <path d={subLine} fill="none" stroke="var(--primary-500)" strokeWidth="2.5" strokeLinecap="round" />
                    {trendSeries.map((d, idx) => {
                      const x = getX(idx);
                      const y = getY(d.submittedCount);
                      const isSel = activeFilterDate === d.fullDate;
                      const isHov = hoveredChartIdx === idx;
                      return (
                        <g
                          key={d.fullDate}
                          onMouseEnter={() => setHoveredChartIdx(idx)}
                          onMouseLeave={() => setHoveredChartIdx(null)}
                          onClick={() => setActiveFilterDate(isSel ? null : d.fullDate)}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle cx={x} cy={y} r="14" fill="transparent" />
                          <circle
                            cx={x}
                            cy={y}
                            r={isHov || isSel ? 5 : (d.submittedCount > 0 ? 3 : 1.8)}
                            fill={isHov || isSel ? 'var(--primary-500)' : 'var(--bg-card)'}
                            stroke={d.submittedCount > 0 || isHov || isSel ? 'var(--primary-500)' : 'var(--border-color)'}
                            strokeWidth="2"
                          />
                        </g>
                      );
                    })}
                  </>
                ) : (
                  trendSeries.map((d, idx) => {
                    const gx = getX(idx);
                    const bw = Math.max(Math.min((innerW / trendSeries.length) * 0.34, 12), 4);
                    const sh = (d.submittedCount / maxChartVal) * innerH;
                    const ah = (d.approvedCount / maxChartVal) * innerH;
                    return (
                      <g
                        key={d.fullDate}
                        onMouseEnter={() => setHoveredChartIdx(idx)}
                        onMouseLeave={() => setHoveredChartIdx(null)}
                        onClick={() => setActiveFilterDate(activeFilterDate === d.fullDate ? null : d.fullDate)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          x={gx - bw - 4}
                          y={pad.top}
                          width={bw * 2 + 8}
                          height={innerH}
                          fill={hoveredChartIdx === idx ? 'color-mix(in srgb, var(--primary-500) 8%, transparent)' : 'transparent'}
                          rx="4"
                        />
                        {sh > 0 && <rect x={gx - bw - 1} y={pad.top + innerH - sh} width={bw} height={sh} rx="2.5" fill="var(--primary-500)" />}
                        {ah > 0 && <rect x={gx + 1} y={pad.top + innerH - ah} width={bw} height={ah} rx="2.5" fill="#10b981" />}
                      </g>
                    );
                  })
                )}

                {trendSeries.map((d, idx) => {
                  const step = trendSeries.length <= 7 ? 1 : trendSeries.length <= 14 ? 2 : 5;
                  if (idx % step !== 0 && idx !== trendSeries.length - 1) return null;
                  return (
                    <text key={d.fullDate} x={getX(idx)} y={chartH - 6} className="sdm-axis-text" textAnchor="middle">
                      {d.label}
                    </text>
                  );
                })}
              </svg>

              {hoveredPoint && hoveredChartIdx !== null && (
                <div
                  className="sdm-chart-tooltip"
                  style={{
                    left: `${Math.min(Math.max((getX(hoveredChartIdx) / chartW) * 100, 12), 86)}%`,
                    top: '10px'
                  }}
                >
                  <strong>{hoveredPoint.fullDateFormatted}</strong>
                  <span>Submitted: <b>{hoveredPoint.submittedCount}</b></span>
                  <span className="sd-text-good">Approved: <b>{hoveredPoint.approvedCount}</b></span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Top-Right: Multi-View Operational Matrix (Departments / Templates / Status) */}
        <section className="sd-card sdm-panel sdm-matrix-panel">
          <header className="sdm-panel-header">
            <div className="sdm-panel-title-group">
              <div className="sdm-panel-icon sdm-tone-blue"><Layers size={15} /></div>
              <div>
                <h2 className="sdm-panel-title">Operational Matrix</h2>
                <p className="sdm-panel-subtitle">Click any row to filter the pipeline board</p>
              </div>
            </div>

            <div className="sd-pill-toggle sd-pill-toggle-sm">
              <button
                type="button"
                className={`sd-pill-btn ${insightTab === 'departments' ? 'active' : ''}`}
                onClick={() => setInsightTab('departments')}
              >
                Depts
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${insightTab === 'templates' ? 'active' : ''}`}
                onClick={() => setInsightTab('templates')}
              >
                Templates
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${insightTab === 'status' ? 'active' : ''}`}
                onClick={() => setInsightTab('status')}
              >
                Status
              </button>
            </div>
          </header>

          <div className="sdm-matrix-body">
            {insightTab === 'departments' && (
              <div className="sdm-dept-list">
                {departmentMetrics.map(d => {
                  const isSel = activeDeptFilter === d.department;
                  const maxVol = Math.max(...departmentMetrics.map(x => x.totalSubmissions || 0), 1);
                  const pct = d.totalSubmissions > 0 ? Math.max((d.totalSubmissions / maxVol) * 100, 10) : 0;
                  return (
                    <div
                      key={d.department}
                      className={`sdm-matrix-row ${isSel ? 'is-selected' : ''}`}
                      onClick={() => setActiveDeptFilter(isSel ? null : d.department)}
                    >
                      <div className="sdm-matrix-row-top">
                        <span className="sdm-matrix-name">{d.department}</span>
                        <div className="sd-flex-gap-xs">
                          {d.pendingApprovals > 0 && (
                            <span className="sd-badge sd-badge-amber sd-badge-xs">{d.pendingApprovals} pending</span>
                          )}
                          <span className="sd-muted sd-xs">{d.totalSubmissions} forms</span>
                        </div>
                      </div>
                      <div className="sdm-matrix-bar-track">
                        <div className="sdm-matrix-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {insightTab === 'templates' && (
              <div className="sdm-dept-list">
                {templateMetrics.map((t, i) => (
                  <div key={t.template?.id || i} className="sdm-matrix-row">
                    <div className="sdm-matrix-row-top">
                      <span className="sdm-matrix-name sd-truncate">
                        <b className="sd-text-accent">#{i + 1}</b> {t.template?.title}
                      </span>
                      <a
                        className="btn btn-secondary btn-xs"
                        {...tabLinkProps(buildAppUrl('forms', { action: 'fill', id: t.template?.id }), () => setActiveTab('forms'))}
                      >
                        Fill <ArrowUpRight size={11} />
                      </a>
                    </div>
                    <div className="sd-muted sd-xs">
                      {t.template?.department} · {t.usageCount} submissions · {t.approvedCount} approved
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insightTab === 'status' && (
              <div className="sdm-dept-list">
                {[
                  { key: 'APPROVED', label: 'Approved & Completed', count: stats.approvedCount, color: '#10b981' },
                  { key: 'IN_REVIEW', label: 'In Departmental Review', count: stats.inReviewCount, color: 'var(--primary-500)' },
                  { key: 'OBJECTION_RAISED', label: 'Revisions Requested', count: stats.objectionsCount, color: '#f59e0b' },
                  { key: 'REJECTED', label: 'Rejected', count: stats.rejectedCount, color: '#ef4444' }
                ].map(st => {
                  const pct = stats.total > 0 ? Math.round((st.count / stats.total) * 100) : 0;
                  const isSel = activeStatusFilter === st.key;
                  return (
                    <div
                      key={st.key}
                      className={`sdm-matrix-row ${isSel ? 'is-selected' : ''}`}
                      onClick={() => setActiveStatusFilter(isSel ? 'ALL' : st.key)}
                    >
                      <div className="sdm-matrix-row-top">
                        <span className="sdm-matrix-name">
                          <span className="sdm-dot" style={{ background: st.color }} /> {st.label}
                        </span>
                        <strong>{st.count} <span className="sd-muted sd-xs">({pct}%)</span></strong>
                      </div>
                      <div className="sdm-matrix-bar-track">
                        <div className="sdm-matrix-bar-fill" style={{ width: `${pct}%`, background: st.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Bottom Full-Width: Live Workflow Pipeline Board (Kanban Swimlanes / Smart Table) */}
        <section className="sd-card sdm-panel sdm-pipeline-panel">
          <header className="sdm-panel-header">
            <div className="sdm-panel-title-group">
              <div className="sdm-panel-icon sdm-tone-emerald"><Kanban size={15} /></div>
              <div>
                <h2 className="sdm-panel-title">Live Workflow Pipeline</h2>
                <p className="sdm-panel-subtitle">
                  Showing {filteredSubmissions.length} of {scopedSubmissions.length} documents
                </p>
              </div>
            </div>

            <div className="sdm-pipeline-controls">
              {/* Search Box */}
              <div className="sdm-search-box">
                <Search size={13} className="sdm-search-icon" />
                <input
                  type="text"
                  placeholder="Search title, #ID, submitter, department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" className="sdm-search-clear" onClick={() => setSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {hasActiveFilters && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={handleResetFilters}>
                  <Filter size={11} /> Reset Filters
                </button>
              )}

              {/* Kanban vs Table Switcher */}
              <div className="sd-pill-toggle sd-pill-toggle-sm">
                <button
                  type="button"
                  className={`sd-pill-btn ${boardMode === 'kanban' ? 'active' : ''}`}
                  onClick={() => setBoardMode('kanban')}
                >
                  <Kanban size={12} /> Swimlanes
                </button>
                <button
                  type="button"
                  className={`sd-pill-btn ${boardMode === 'table' ? 'active' : ''}`}
                  onClick={() => setBoardMode('table')}
                >
                  <Table2 size={12} /> Table
                </button>
              </div>
            </div>
          </header>

          {boardMode === 'kanban' ? (
            <div className="sdm-kanban-grid">
              {kanbanColumns.map(col => (
                <div key={col.id} className="sdm-kanban-col">
                  <div className={`sdm-kanban-col-head tone-${col.tone}`}>
                    <span className="sdm-kanban-col-title">{col.title}</span>
                    <span className="sdm-kanban-col-count">{col.count}</span>
                  </div>

                  <div className="sdm-kanban-cards">
                    {col.reviews?.slice(0, 2).map(r => (
                      <div
                        key={r.id}
                        className="sdm-kanban-card is-review"
                        {...tabOpenProps(buildAppUrl('reviews', { review: r.id }), () => setActiveTab('reviews'))}
                      >
                        <div className="sdm-kcard-top">
                          <span className="sd-badge sd-badge-violet sd-badge-xs">Template Review</span>
                          <span className="sd-muted sd-xs">{r.department}</span>
                        </div>
                        <div className="sdm-kcard-title sd-truncate">{r.title}</div>
                        <div className="sdm-kcard-foot">
                          <span className="sd-muted sd-xs">Pre-publication review</span>
                          <span className="sd-link sd-xs">Review →</span>
                        </div>
                      </div>
                    ))}

                    {col.items.length === 0 && (!col.reviews || col.reviews.length === 0) ? (
                      <div className="sdm-kanban-empty">No documents in stage</div>
                    ) : (
                      col.items.slice(0, 6).map(s => {
                        const totalSteps = s.workflow?.length || 1;
                        const currStep = Math.min(s.currentWorkflowStep || 1, totalSteps);
                        const stepDept = s.workflow?.[currStep - 1]?.department || s.department;
                        return (
                          <div
                            key={s.id}
                            className="sdm-kanban-card"
                            {...tabOpenProps(buildAppUrl('approvals', { submission: s.id }), () => setSelectedSubmissionId(s.id))}
                          >
                            <div className="sdm-kcard-top">
                              <span className="sdm-mono-tag">{s.uniqueNumber}</span>
                              <span className="sd-muted sd-xs">v{s.version} · {s.department}</span>
                            </div>
                            <div className="sdm-kcard-title sd-truncate">{s.title}</div>
                            {s.status === 'IN_REVIEW' && (
                              <div className="sdm-kcard-step">
                                <div className="sdm-kcard-step-bar">
                                  <div
                                    className="sdm-kcard-step-fill"
                                    style={{ width: `${Math.round((currStep / totalSteps) * 100)}%` }}
                                  />
                                </div>
                                <span>Step {currStep}/{totalSteps} · {stepDept}</span>
                              </div>
                            )}
                            <div className="sdm-kcard-foot">
                              <div className="sdm-kcard-user">
                                <UserAvatar name={s.submittedByName} size="xs" />
                                <span className="sd-truncate">{s.submittedByName}</span>
                              </div>
                              <span className="sd-muted sd-xs">{formatDate(s.createdAt)}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sdm-table-wrap">
              <table className="sd-table sdm-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Submitter &amp; Dept</th>
                    <th>Workflow Stage</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.slice(0, 12).map(s => {
                    const totalSteps = s.workflow?.length || 1;
                    const currStep = Math.min(s.currentWorkflowStep || 1, totalSteps);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedSubmissionId(s.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="sd-list-title">
                            {s.title} <span className="sdm-mono-tag">{s.uniqueNumber}</span>
                          </div>
                        </td>
                        <td>
                          <div className="sd-flex-gap-xs">
                            <UserAvatar name={s.submittedByName} size="xs" />
                            <span>{s.submittedByName} <span className="sd-muted">({s.department})</span></span>
                          </div>
                        </td>
                        <td>
                          <span className="sd-muted sd-xs">
                            Step {currStep} of {totalSteps}
                          </span>
                        </td>
                        <td className="sd-muted sd-xs">{formatDate(s.createdAt)}</td>
                        <td><StatusBadge status={s.status} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSubmissionId(s.id);
                            }}
                          >
                            <Eye size={12} /> Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

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
