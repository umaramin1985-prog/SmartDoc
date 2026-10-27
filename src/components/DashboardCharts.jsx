import React, { useState, useMemo } from 'react';
import {
  TrendingUp, BarChart2, PieChart, Building2, FileText, CheckCircle2,
  Clock, AlertTriangle, ArrowRight, Check, ChevronRight, Layers, Calendar
} from 'lucide-react';
import { formatDate } from './ui';
import { buildAppUrl, tabLinkProps } from '../utils/router';

// ============================================================================
// 1. TrendChart — Interactive Velocity & Volume Timeline (Area/Line or Bars)
// ============================================================================
export const TrendChart = ({
  trendData,
  timeHorizon,
  chartMode = 'area',
  setChartMode,
  onSelectDate,
  activeFilterDate
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // SVG dimensions
  const width = 620;
  const height = 220;
  const padding = { top: 20, right: 24, bottom: 34, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const dataPoints = trendData || [];
  const count = dataPoints.length;

  const maxVal = useMemo(() => {
    if (!count) return 4;
    const peak = Math.max(...dataPoints.map(d => Math.max(d.submittedCount || 0, d.approvedCount || 0)));
    return Math.max(peak + 1, 4);
  }, [dataPoints, count]);

  // Coordinate mappers
  const getX = (index) => {
    if (count <= 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (count - 1)) * innerWidth;
  };

  const getY = (val) => {
    return padding.top + innerHeight - (val / maxVal) * innerHeight;
  };

  // Build SVG paths for submitted (line + area gradient) and approved
  const { linePath, areaPath, approvedPath } = useMemo(() => {
    if (!count) return { linePath: '', areaPath: '', approvedPath: '' };

    if (count === 1) {
      const x = getX(0);
      const ySub = getY(dataPoints[0].submittedCount || 0);
      const yApp = getY(dataPoints[0].approvedCount || 0);
      return {
        linePath: `M ${x - 20} ${ySub} L ${x + 20} ${ySub}`,
        areaPath: `M ${x - 20} ${padding.top + innerHeight} L ${x - 20} ${ySub} L ${x + 20} ${ySub} L ${x + 20} ${padding.top + innerHeight} Z`,
        approvedPath: `M ${x - 20} ${yApp} L ${x + 20} ${yApp}`
      };
    }

    // Build smooth cubic bezier for submissions
    const pts = dataPoints.map((d, i) => ({ x: getX(i), y: getY(d.submittedCount || 0) }));
    let dLine = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 3;
      const cpX2 = next.x - (next.x - curr.x) / 3;
      dLine += ` C ${cpX1} ${curr.y}, ${cpX2} ${next.y}, ${next.x} ${next.y}`;
    }

    const dArea = `${dLine} L ${pts[pts.length - 1].x} ${padding.top + innerHeight} L ${pts[0].x} ${padding.top + innerHeight} Z`;

    // Line for approved
    const appPts = dataPoints.map((d, i) => ({ x: getX(i), y: getY(d.approvedCount || 0) }));
    let dApp = `M ${appPts[0].x} ${appPts[0].y}`;
    for (let i = 0; i < appPts.length - 1; i++) {
      const curr = appPts[i];
      const next = appPts[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 3;
      const cpX2 = next.x - (next.x - curr.x) / 3;
      dApp += ` C ${cpX1} ${curr.y}, ${cpX2} ${next.y}, ${next.x} ${next.y}`;
    }

    return { linePath: dLine, areaPath: dArea, approvedPath: dApp };
  }, [dataPoints, count, maxVal]);

  // Y-axis grid ticks (4 steps)
  const yTicks = useMemo(() => {
    const ticks = [];
    const step = Math.ceil(maxVal / 4);
    for (let v = 0; v <= maxVal; v += step) {
      ticks.push({ val: v, y: getY(v) });
      if (ticks.length >= 5) break;
    }
    return ticks;
  }, [maxVal]);

  const activeItem = hoveredIndex !== null ? dataPoints[hoveredIndex] : null;

  return (
    <div className="sd-chart-card sd-card">
      <header className="sd-chart-header">
        <div className="sd-chart-title-wrap">
          <div className="sd-chart-icon-box sd-tone-violet">
            <TrendingUp size={16} />
          </div>
          <div>
            <h3 className="sd-chart-title">Submission &amp; Approval Velocity</h3>
            <p className="sd-chart-subtitle">
              Workflow throughput over {timeHorizon === '7d' ? 'the past 7 days' : timeHorizon === '30d' ? 'the past 30 days' : timeHorizon === '90d' ? 'the past quarter' : 'all recorded activity'}
            </p>
          </div>
        </div>

        <div className="sd-chart-header-actions">
          {/* Legend indicators */}
          <div className="sd-chart-legend">
            <span className="sd-legend-item">
              <span className="sd-legend-dot sd-legend-dot-primary" /> Submissions
            </span>
            <span className="sd-legend-item">
              <span className="sd-legend-dot sd-legend-dot-emerald" /> Approved
            </span>
          </div>

          {/* Area vs Bar mode toggle */}
          <div className="sd-pill-toggle sd-pill-toggle-sm">
            <button
              type="button"
              className={`sd-pill-btn ${chartMode === 'area' ? 'active' : ''}`}
              onClick={() => setChartMode?.('area')}
              title="Smooth Trend Line & Area"
            >
              <TrendingUp size={13} />
            </button>
            <button
              type="button"
              className={`sd-pill-btn ${chartMode === 'bar' ? 'active' : ''}`}
              onClick={() => setChartMode?.('bar')}
              title="Daily Volume Bars"
            >
              <BarChart2 size={13} />
            </button>
          </div>
        </div>
      </header>

      <div className="sd-chart-canvas-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="sd-chart-svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="sdAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-500)" stopOpacity="0.32" />
              <stop offset="85%" stopColor="var(--primary-500)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="var(--primary-500)" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="sdBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-400)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--primary-600)" stopOpacity="0.4" />
            </linearGradient>
            
            <linearGradient id="sdBarAppGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.4" />
            </linearGradient>

            <filter id="sdGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--primary-500)" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Grid lines */}
          {yTicks.map(({ val, y }) => (
            <g key={val} className="sd-grid-line-group">
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                className="sd-chart-grid-line"
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                className="sd-chart-tick-text"
                textAnchor="end"
              >
                {val}
              </text>
            </g>
          ))}

          {/* If chartMode is Area */}
          {chartMode === 'area' && count > 0 && (
            <>
              {/* Area fill */}
              <path d={areaPath} fill="url(#sdAreaGrad)" />

              {/* Submissions primary trend line */}
              <path
                d={linePath}
                fill="none"
                stroke="var(--primary-500)"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#sdGlow)"
              />

              {/* Approved secondary line */}
              <path
                d={approvedPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />

              {/* Data points */}
              {dataPoints.map((d, idx) => {
                const x = getX(idx);
                const y = getY(d.submittedCount || 0);
                const isHovered = hoveredIndex === idx;
                const isSelected = activeFilterDate === d.fullDate;

                return (
                  <g
                    key={d.fullDate || idx}
                    className="sd-chart-point-group"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => onSelectDate?.(d)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Invisible expanded hit target */}
                    <circle cx={x} cy={y} r="18" fill="transparent" />

                    {/* Selection ring if active */}
                    {(isSelected || isHovered) && (
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 10 : 8}
                        fill="none"
                        stroke="var(--primary-500)"
                        strokeWidth="2"
                        className="sd-pulse-ring"
                      />
                    )}

                    {/* Data point dot */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 5.5 : isSelected ? 5 : (d.submittedCount > 0 ? 3.5 : 2)}
                      fill={d.submittedCount > 0 ? 'var(--primary-contrast)' : 'var(--border-color)'}
                      stroke={d.submittedCount > 0 ? 'var(--primary-500)' : 'var(--text-dim)'}
                      strokeWidth="2"
                      className="sd-chart-dot"
                    />
                  </g>
                );
              })}
            </>
          )}

          {/* If chartMode is Bars */}
          {chartMode === 'bar' && count > 0 && (
            <g className="sd-chart-bars-layer">
              {dataPoints.map((d, idx) => {
                const groupX = getX(idx);
                const barWidth = Math.max(Math.min((innerWidth / count) * 0.32, 14), 4);
                const gap = 3;

                const subH = (d.submittedCount / maxVal) * innerHeight;
                const subY = padding.top + innerHeight - subH;

                const appH = (d.approvedCount / maxVal) * innerHeight;
                const appY = padding.top + innerHeight - appH;

                const isHovered = hoveredIndex === idx;
                const isSelected = activeFilterDate === d.fullDate;

                return (
                  <g
                    key={d.fullDate || idx}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => onSelectDate?.(d)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Background hover column */}
                    <rect
                      x={groupX - barWidth - gap - 4}
                      y={padding.top}
                      width={(barWidth + gap) * 2 + 8}
                      height={innerHeight}
                      fill={isHovered || isSelected ? 'rgba(255, 255, 255, 0.04)' : 'transparent'}
                      rx="4"
                    />

                    {/* Submitted Bar */}
                    {subH > 0 && (
                      <rect
                        x={groupX - barWidth - gap / 2}
                        y={subY}
                        width={barWidth}
                        height={subH}
                        rx="3"
                        fill="url(#sdBarGrad)"
                        stroke={isHovered ? 'var(--primary-400)' : 'none'}
                        strokeWidth="1"
                      />
                    )}

                    {/* Approved Bar */}
                    {appH > 0 && (
                      <rect
                        x={groupX + gap / 2}
                        y={appY}
                        width={barWidth}
                        height={appH}
                        rx="3"
                        fill="url(#sdBarAppGrad)"
                        stroke={isHovered ? '#34d399' : 'none'}
                        strokeWidth="1"
                      />
                    )}

                    {/* Baseline indicator for 0 values */}
                    {subH === 0 && appH === 0 && (
                      <rect
                        x={groupX - barWidth}
                        y={padding.top + innerHeight - 2}
                        width={barWidth * 2}
                        height="2"
                        rx="1"
                        fill="rgba(255, 255, 255, 0.1)"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* X-axis labels (render subset to avoid clutter) */}
          {dataPoints.map((d, idx) => {
            const stepRatio = count <= 7 ? 1 : count <= 14 ? 2 : count <= 31 ? 4 : 7;
            const isVisible = idx % stepRatio === 0 || idx === count - 1;
            if (!isVisible) return null;

            return (
              <text
                key={d.fullDate || idx}
                x={getX(idx)}
                y={height - 10}
                className="sd-chart-x-tick"
                textAnchor="middle"
              >
                {d.label}
              </text>
            );
          })}
        </svg>

        {/* Interactive Floating Tooltip */}
        {activeItem && hoveredIndex !== null && (
          <div
            className="sd-chart-tooltip"
            style={{
              left: `${(getX(hoveredIndex) / width) * 100}%`,
              top: `${Math.max(getY(activeItem.submittedCount || 0) - 20, 10)}px`
            }}
          >
            <div className="sd-tooltip-header">
              <Calendar size={11} /> {activeItem.fullDateFormatted || activeItem.fullDate}
            </div>
            <div className="sd-tooltip-body">
              <div className="sd-tooltip-row">
                <span className="sd-tooltip-dot sd-legend-dot-primary" />
                <span className="sd-tooltip-label">Submitted:</span>
                <strong>{activeItem.submittedCount || 0}</strong>
              </div>
              <div className="sd-tooltip-row">
                <span className="sd-tooltip-dot sd-legend-dot-emerald" />
                <span className="sd-tooltip-label">Approved:</span>
                <strong>{activeItem.approvedCount || 0}</strong>
              </div>
              {(activeItem.objectionCount > 0 || activeItem.inReviewCount > 0) && (
                <div className="sd-tooltip-row sd-muted sd-xs">
                  <span>In Review: {activeItem.inReviewCount || 0}</span>
                  {activeItem.objectionCount > 0 && <span>· Objections: {activeItem.objectionCount}</span>}
                </div>
              )}
            </div>
            <div className="sd-tooltip-hint">
              Click point to filter submissions below
            </div>
          </div>
        )}
      </div>

      {/* Footer Insight bar */}
      <footer className="sd-chart-footer">
        <div className="sd-chart-insight-item">
          <span className="sd-muted">Total in window:</span>
          <strong>{dataPoints.reduce((acc, d) => acc + (d.submittedCount || 0), 0)} submissions</strong>
        </div>
        <div className="sd-chart-insight-item">
          <span className="sd-muted">Approved in window:</span>
          <strong className="sd-text-good">{dataPoints.reduce((acc, d) => acc + (d.approvedCount || 0), 0)} approved</strong>
        </div>
        {activeFilterDate && (
          <div className="sd-chart-filter-tag">
            <span>Filtered: {activeFilterDate}</span>
            <button
              type="button"
              className="sd-filter-tag-clear"
              onClick={() => onSelectDate?.(null)}
              title="Clear date filter"
            >
              ×
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

// ============================================================================
// 2. StatusDonut — Interactive Radial Distribution Chart
// ============================================================================
export const StatusDonut = ({
  statusCounts,
  activeStatusFilter,
  onSelectStatus
}) => {
  const [hoveredKey, setHoveredKey] = useState(null);

  const {
    approved = 0,
    inReview = 0,
    objections = 0,
    rejected = 0,
    expired = 0,
    total = 0
  } = statusCounts || {};

  // Status segment definitions
  const segments = useMemo(() => [
    { key: 'APPROVED', label: 'Approved', count: approved, color: '#10b981', tone: 'green' },
    { key: 'IN_REVIEW', label: 'In Review', count: inReview, color: 'var(--primary-500)', tone: 'violet' },
    { key: 'OBJECTION_RAISED', label: 'Changes Req.', count: objections, color: '#f59e0b', tone: 'amber' },
    { key: 'REJECTED', label: 'Rejected', count: rejected, color: '#ef4444', tone: 'red' }
  ], [approved, inReview, objections, rejected]);

  // Donut geometry
  const radius = 64;
  const circumference = 2 * Math.PI * radius; // ~402.12

  // Compute dash arrays and offsets
  const arcs = useMemo(() => {
    if (total === 0) return [];
    let accumulated = 0;
    return segments.map(seg => {
      const fraction = seg.count / total;
      const strokeDash = fraction * circumference;
      const offset = accumulated * circumference;
      accumulated += fraction;
      return {
        ...seg,
        strokeDasharray: `${strokeDash} ${circumference - strokeDash}`,
        strokeDashoffset: -offset,
        percentage: (fraction * 100).toFixed(1)
      };
    });
  }, [segments, total, circumference]);

  // Active or hovered status detail
  const highlighted = useMemo(() => {
    const targetKey = hoveredKey || activeStatusFilter;
    if (!targetKey || targetKey === 'ALL') return null;
    return segments.find(s => s.key === targetKey) || null;
  }, [hoveredKey, activeStatusFilter, segments]);

  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="sd-chart-card sd-card sd-donut-card">
      <header className="sd-chart-header">
        <div className="sd-chart-title-wrap">
          <div className="sd-chart-icon-box sd-tone-green">
            <PieChart size={16} />
          </div>
          <div>
            <h3 className="sd-chart-title">Status Breakdown</h3>
            <p className="sd-chart-subtitle">Distribution of active and decided documents</p>
          </div>
        </div>
      </header>

      <div className="sd-donut-body">
        {/* SVG Donut */}
        <div className="sd-donut-svg-wrap">
          <svg viewBox="0 0 170 170" className="sd-donut-svg">
            <defs>
              <filter id="sdDonutGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--primary-500)" floodOpacity="0.45" />
              </filter>
            </defs>

            {/* Background track circle */}
            <circle
              cx="85"
              cy="85"
              r={radius}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="16"
            />

            {/* If zero submissions */}
            {total === 0 && (
              <circle
                cx="85"
                cy="85"
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth="16"
                strokeDasharray="6 6"
              />
            )}

            {/* Segment arcs */}
            {arcs.map(arc => {
              if (arc.count <= 0) return null;
              const isHovered = hoveredKey === arc.key;
              const isFiltered = activeStatusFilter === arc.key;

              return (
                <circle
                  key={arc.key}
                  cx="85"
                  cy="85"
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={isHovered || isFiltered ? 20 : 15}
                  strokeDasharray={arc.strokeDasharray}
                  strokeDashoffset={arc.strokeDashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 85 85)"
                  className="sd-donut-arc"
                  onMouseEnter={() => setHoveredKey(arc.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => onSelectStatus?.(activeStatusFilter === arc.key ? 'ALL' : arc.key)}
                  style={{
                    cursor: 'pointer',
                    transition: 'stroke-width 0.2s ease, filter 0.2s ease',
                    filter: isHovered || isFiltered ? 'url(#sdDonutGlow)' : 'none'
                  }}
                />
              );
            })}
          </svg>

          {/* Center Info Ring */}
          <div className="sd-donut-center-info">
            {highlighted ? (
              <>
                <div className="sd-donut-center-val" style={{ color: highlighted.color }}>
                  {highlighted.count}
                </div>
                <div className="sd-donut-center-label">{highlighted.label}</div>
                <div className="sd-donut-center-sub">
                  {total > 0 ? `${((highlighted.count / total) * 100).toFixed(0)}% of total` : '0%'}
                </div>
              </>
            ) : (
              <>
                <div className="sd-donut-center-val">{total}</div>
                <div className="sd-donut-center-label">Total Forms</div>
                <div className="sd-donut-center-sub sd-text-good">
                  {approvalRate}% approved
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status Legend Pills (Interactive) */}
        <div className="sd-donut-legend-grid">
          {segments.map(seg => {
            const isHovered = hoveredKey === seg.key;
            const isFiltered = activeStatusFilter === seg.key;
            const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;

            return (
              <button
                key={seg.key}
                type="button"
                className={`sd-donut-legend-pill ${isFiltered ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onSelectStatus?.(activeStatusFilter === seg.key ? 'ALL' : seg.key)}
              >
                <div className="sd-legend-pill-left">
                  <span className="sd-legend-color-dot" style={{ background: seg.color }} />
                  <span className="sd-legend-pill-name">{seg.label}</span>
                </div>
                <div className="sd-legend-pill-right">
                  <strong>{seg.count}</strong>
                  <span className="sd-muted sd-xs">({pct}%)</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. DepartmentWorkload — Comparative Horizontal Workload Bars
// ============================================================================
export const DepartmentWorkload = ({
  departmentMetrics,
  activeDeptFilter,
  onSelectDept
}) => {
  const depts = departmentMetrics || [];
  const maxVolume = useMemo(() => {
    return Math.max(...depts.map(d => d.totalSubmissions || 0), 1);
  }, [depts]);

  return (
    <div className="sd-chart-card sd-card">
      <header className="sd-chart-header">
        <div className="sd-chart-title-wrap">
          <div className="sd-chart-icon-box sd-tone-blue">
            <Building2 size={16} />
          </div>
          <div>
            <h3 className="sd-chart-title">Department Workload &amp; Pipeline</h3>
            <p className="sd-chart-subtitle">Throughput and pending decisions across corporate drives</p>
          </div>
        </div>
        {activeDeptFilter && (
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => onSelectDept?.(null)}
          >
            Clear Department ({activeDeptFilter})
          </button>
        )}
      </header>

      {depts.length === 0 ? (
        <div className="sd-empty sd-empty-sm">
          <p className="sd-muted">No department drives registered yet.</p>
        </div>
      ) : (
        <div className="sd-dept-workload-list">
          {depts.map(dept => {
            const isSelected = activeDeptFilter === dept.department;
            const approvedRatio = dept.totalSubmissions > 0
              ? (dept.approvedCount / dept.totalSubmissions) * 100
              : 0;
            const inReviewRatio = dept.totalSubmissions > 0
              ? (dept.inReviewCount / dept.totalSubmissions) * 100
              : 0;
            const barWidthPercent = (dept.totalSubmissions / maxVolume) * 100;

            return (
              <div
                key={dept.department}
                className={`sd-dept-workload-row ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelectDept?.(isSelected ? null : dept.department)}
                style={{ cursor: 'pointer' }}
              >
                <div className="sd-dept-workload-head">
                  <div className="sd-dept-name-wrap">
                    <span className="sd-dept-name">{dept.department}</span>
                    <span className="sd-dept-template-tag">
                      {dept.templateCount} template{dept.templateCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="sd-dept-counts-badge">
                    {dept.pendingApprovals > 0 ? (
                      <span className="sd-badge sd-badge-amber sd-badge-xs">
                        <Clock size={10} /> {dept.pendingApprovals} awaiting approval
                      </span>
                    ) : (
                      <span className="sd-badge sd-badge-gray sd-badge-xs">
                        {dept.totalSubmissions} submitted
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="sd-dept-track-outer">
                  <div
                    className="sd-dept-track-bar"
                    style={{ width: `${Math.max(barWidthPercent, 8)}%` }}
                  >
                    {/* Approved slice */}
                    {approvedRatio > 0 && (
                      <div
                        className="sd-dept-slice sd-dept-slice-approved"
                        style={{ width: `${approvedRatio}%` }}
                        title={`${dept.approvedCount} approved`}
                      />
                    )}
                    {/* In Review slice */}
                    {inReviewRatio > 0 && (
                      <div
                        className="sd-dept-slice sd-dept-slice-review"
                        style={{ width: `${inReviewRatio}%` }}
                        title={`${dept.inReviewCount} in review`}
                      />
                    )}
                  </div>
                </div>

                <div className="sd-dept-mini-stats">
                  <span className="sd-text-good sd-xs">✓ {dept.approvedCount} approved</span>
                  <span className="sd-muted sd-xs">·</span>
                  <span className="sd-muted sd-xs">{dept.inReviewCount} in review</span>
                  {dept.objectionCount > 0 && (
                    <>
                      <span className="sd-muted sd-xs">·</span>
                      <span className="sd-text-warn sd-xs">{dept.objectionCount} revisions</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. TemplateLeaderboard — Top Utilized Word Form Templates
// ============================================================================
export const TemplateLeaderboard = ({
  templateMetrics,
  onFillTemplate
}) => {
  const topTemplates = templateMetrics || [];

  return (
    <div className="sd-chart-card sd-card">
      <header className="sd-chart-header">
        <div className="sd-chart-title-wrap">
          <div className="sd-chart-icon-box sd-tone-violet">
            <FileText size={16} />
          </div>
          <div>
            <h3 className="sd-chart-title">Most Utilized Templates</h3>
            <p className="sd-chart-subtitle">High-frequency corporate forms &amp; completion rates</p>
          </div>
        </div>
      </header>

      {topTemplates.length === 0 ? (
        <div className="sd-empty sd-empty-sm">
          <p className="sd-muted">No form templates published yet.</p>
        </div>
      ) : (
        <div className="sd-leaderboard-list">
          {topTemplates.map((t, idx) => {
            const hasSubmissions = t.usageCount > 0;
            const passRate = hasSubmissions
              ? Math.round((t.approvedCount / t.usageCount) * 100)
              : 0;

            return (
              <div key={t.template?.id || idx} className="sd-leader-item">
                <div className="sd-leader-rank">#{idx + 1}</div>

                <div className="sd-leader-content">
                  <div className="sd-leader-title-row">
                    <span className="sd-leader-title">{t.template?.title || 'Untitled Form'}</span>
                    <span className="sd-badge sd-badge-gray sd-badge-xs">
                      {t.template?.department}
                    </span>
                  </div>

                  <div className="sd-leader-metrics-row">
                    <span className="sd-muted sd-xs">
                      {t.usageCount} submission{t.usageCount === 1 ? '' : 's'}
                    </span>
                    {hasSubmissions && (
                      <span className="sd-text-good sd-xs">
                        · {passRate}% pass rate
                      </span>
                    )}
                    <span className="sd-muted sd-xs">
                      · v{t.template?.version || '1.0'}
                    </span>
                  </div>
                </div>

                <div className="sd-leader-action">
                  <a
                    className="btn btn-secondary btn-xs"
                    {...tabLinkProps(buildAppUrl('forms', { action: 'fill', id: t.template?.id }), () => onFillTemplate?.(t.template?.id))}
                    title="Fill this form"
                  >
                    Fill <ArrowRight size={11} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
