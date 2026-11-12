import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  PageHeader, EmptyState, StatusBadge, formatDate,
  WorkflowMiniProgress, WorkflowTrack, SlaBadge, UserAvatar
} from './ui';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import { SubmissionKanbanBoard } from './SubmissionKanbanBoard';
import { buildAppUrl, tabLinkProps, tabOpenProps } from '../utils/router';
import { useDeepLink } from '../utils/useDeepLink';
import {
  Inbox, Send, Building2, CheckCircle2, Search, FileText,
  AlertTriangle, Eye, X, LayoutGrid, List, Columns3
} from 'lucide-react';

const STATUS_OPTIONS = [
  { id: 'ALL', label: 'All' },
  { id: 'IN_REVIEW', label: 'In Review', tone: 'blue' },
  { id: 'OBJECTION_RAISED', label: 'Changes Requested', tone: 'amber' },
  { id: 'APPROVED', label: 'Approved', tone: 'green' },
  { id: 'REJECTED', label: 'Rejected', tone: 'red' }
];

const SubmissionTable = ({ rows, onOpen, onPreviewDoc, currentUserId }) => (
  <div className="sd-table-wrap sd-card">
    <table className="sd-table sd-table-click">
      <thead>
        <tr>
          <th>Document</th>
          <th>Submitted By</th>
          <th>Approval Pipeline</th>
          <th>Status &amp; SLA</th>
          <th style={{ textAlign: 'right' }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(s => {
          const isOriginator = s.submittedById === currentUserId;
          const hasObjection = s.status === 'OBJECTION_RAISED' && isOriginator;
          const detailUrl = buildAppUrl('approvals', { submission: s.id });

          return (
            <tr
              key={s.id}
              {...tabOpenProps(detailUrl, () => onOpen(s.id))}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(s.id); }}
              className={hasObjection ? 'sd-tr-highlight-warn' : ''}
            >
              <td>
                <div className="sd-table-title-cell">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong>{s.title}</strong>
                    <span className="sd-badge sd-badge-gray sd-badge-xs sd-mono">{s.uniqueNumber}</span>
                    <span className="sd-muted sd-xs">v{s.version || 1}</span>
                  </div>
                  {hasObjection && (
                    <span className="sd-badge sd-badge-amber sd-badge-xs sd-mt-xs">
                      <AlertTriangle size={10} /> Action required: Changes requested
                    </span>
                  )}
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserAvatar name={s.submittedByName} size="xs" />
                  <div>
                    <div className={isOriginator ? 'sd-font-medium sd-text-accent' : 'sd-font-medium'} style={{ fontSize: '0.82rem' }}>
                      {s.submittedByName} {isOriginator && '(You)'}
                    </div>
                    <div className="sd-muted sd-xs">{s.department}</div>
                  </div>
                </div>
              </td>
              <td>
                <WorkflowMiniProgress
                  workflow={s.workflow}
                  currentStep={s.currentWorkflowStep}
                  status={s.status}
                />
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <StatusBadge status={s.status} />
                  <SlaBadge createdAt={s.createdAt} expiryDate={s.expiryDate} status={s.status} />
                </div>
              </td>
              <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                <div className="sd-btn-row sd-justify-end">
                  {onPreviewDoc && (
                    <button
                      type="button"
                      className="sd-icon-btn"
                      onClick={() => onPreviewDoc(s)}
                      title="Quick preview Word document"
                    >
                      <FileText size={14} />
                    </button>
                  )}
                  <a
                    id={`btn-view-submission-${s.id}`}
                    className="btn btn-secondary btn-xs"
                    {...tabLinkProps(detailUrl, () => onOpen(s.id))}
                    title="View submission details"
                  >
                    <Eye size={13} /> View
                  </a>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const SubmissionPipelineCards = ({ rows, onOpen, onPreviewDoc, currentUserId }) => (
  <div className="sd-pipeline-cards-grid">
    {rows.map(s => {
      const isOriginator = s.submittedById === currentUserId;
      const hasObjection = s.status === 'OBJECTION_RAISED';
      const detailUrl = buildAppUrl('approvals', { submission: s.id });

      return (
        <article
          key={s.id}
          className={`sd-card sd-pipeline-card ${hasObjection ? 'is-objected' : ''}`}
          {...tabOpenProps(detailUrl, () => onOpen(s.id))}
        >
          <div className="sd-pipeline-card-top">
            <div className="sd-pipeline-card-id">
              <span className="sd-mono sd-font-medium">{s.uniqueNumber}</span>
              <span className="sd-muted sd-xs">· {s.department} · v{s.version || 1}</span>
            </div>
            <div className="sd-pipeline-card-status">
              <SlaBadge createdAt={s.createdAt} expiryDate={s.expiryDate} status={s.status} />
              <StatusBadge status={s.status} />
            </div>
          </div>

          <h3 className="sd-pipeline-card-title">{s.title}</h3>

          {hasObjection && s.objectionNotes && (
            <div className="sd-pipeline-objection-callout">
              <AlertTriangle size={13} />
              <span><strong>Revision Note:</strong> {s.objectionNotes}</span>
            </div>
          )}

          <div className="sd-pipeline-track-box">
            <WorkflowTrack
              workflow={s.workflow || []}
              submitterLabel={isOriginator ? 'You' : (s.submittedByName || 'Submitter')}
              compact={true}
            />
          </div>

          <div className="sd-pipeline-card-footer">
            <div className="sd-pipeline-submitter">
              <UserAvatar name={s.submittedByName} size="xs" />
              <span>
                {s.submittedByName} {isOriginator && '(You)'} · {formatDate(s.createdAt)}
              </span>
            </div>
            <div className="sd-btn-row" onClick={e => e.stopPropagation()}>
              {onPreviewDoc && (
                <button
                  type="button"
                  className="sd-icon-btn"
                  onClick={() => onPreviewDoc(s)}
                  title="Preview document"
                >
                  <FileText size={14} />
                </button>
              )}
              <a
                id={`btn-view-submission-${s.id}`}
                className="btn btn-primary btn-xs"
                {...tabLinkProps(detailUrl, () => onOpen(s.id))}
              >
                <Eye size={12} /> Open
              </a>
            </div>
          </div>
        </article>
      );
    })}
  </div>
);

export const FormApprovals = () => {
  const {
    isAdmin, formSubmissions, myApprovalQueue, mySubmissions,
    departmentSubmissions, currentUser, openDocumentPreview, addToast
  } = useApp();
  const [tab, setTab] = useState(isAdmin && myApprovalQueue.length > 0 ? 'queue' : 'mine');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('smartdoc_approvals_view') || 'board'
  ); // 'board' | 'table' | 'cards'
  const [openId, setOpenId] = useState(null);

  const handleChangeViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('smartdoc_approvals_view', mode); } catch {}
  };

  // Deep link: /approvals?submission=<id> opens that submission's detail modal
  useDeepLink(({ submission }, { timedOut }) => {
    if (!submission) return true;
    const s = formSubmissions.find(x => String(x.id) === String(submission));
    if (s) {
      setOpenId(s.id);
      return true;
    }
    if (formSubmissions.length === 0 && !timedOut) return false;
    addToast('Submission Not Found', 'The requested submission does not exist or you do not have access to it.', 'warn');
    return true;
  }, [formSubmissions]);

  const deptForms = useMemo(
    () => departmentSubmissions || formSubmissions.filter(s => s.department === currentUser?.department),
    [departmentSubmissions, formSubmissions, currentUser?.department]
  );

  const tabs = [
    ...(isAdmin ? [{ id: 'queue', label: 'Needs My Decision', icon: Inbox, count: myApprovalQueue.length }] : []),
    { id: 'mine', label: 'My Submissions', icon: Send, count: mySubmissions.length },
    { id: 'dept', label: `${currentUser?.department || 'Department'}`, icon: Building2, count: deptForms.length },
    { id: 'all', label: 'All Forms', icon: FileText, count: formSubmissions.length }
  ];

  const baseRows = useMemo(() => {
    if (tab === 'queue') return myApprovalQueue;
    if (tab === 'mine') return mySubmissions;
    if (tab === 'dept') return deptForms;
    return formSubmissions;
  }, [tab, myApprovalQueue, mySubmissions, deptForms, formSubmissions]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: baseRows.length };
    for (const s of baseRows) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return counts;
  }, [baseRows]);

  const filteredRows = useMemo(() => {
    let list = baseRows;
    if (statusFilter !== 'ALL') {
      list = list.filter(s => s.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        [s.uniqueNumber, s.title, s.submittedByName, s.department, s.status].some(v =>
          String(v || '').toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [baseRows, statusFilter, search]);

  const boardFilteredRows = useMemo(() => {
    let list = baseRows;
    if (tab === 'queue' && currentUser?.id) {
      const queueIds = new Set(myApprovalQueue.map(s => String(s.id)));
      const decidedByMe = formSubmissions.filter(
        s =>
          !queueIds.has(String(s.id)) &&
          s.status !== 'IN_REVIEW' &&
          Array.isArray(s.workflow) &&
          s.workflow.some(st => st && String(st.actedById) === String(currentUser.id))
      );
      list = [...myApprovalQueue, ...decidedByMe];
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        [s.uniqueNumber, s.title, s.submittedByName, s.department, s.status].some(v =>
          String(v || '').toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [tab, baseRows, myApprovalQueue, formSubmissions, currentUser?.id, search]);

  const handleQuickPreview = (s) => {
    openDocumentPreview({
      kind: 'submission',
      id: s.id,
      title: `${s.uniqueNumber} — ${s.title}`,
      fileName: `${s.uniqueNumber}_v${s.version || 1}.docx`
    });
  };

  return (
    <div className={`sd-page animate-fade-in sd-approvals-page ${viewMode === 'board' ? 'is-board-mode' : ''}`}>
      <PageHeader
        title="Submissions &amp; Approvals"
        subtitle="Review pending approvals, track submissions, and inspect workflow stages."
      />

      {/* Unified Command Bar: Tabs + Search + View Mode Switcher */}
      <div className="sd-approvals-command-bar">
        <div className="sd-tabs sd-tabs-inline" role="tablist">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              className={`sd-tab ${tab === id ? 'active' : ''}`}
              onClick={() => { setTab(id); setStatusFilter('ALL'); }}
            >
              <Icon size={15} /> {label} <span className="sd-tab-count">{count}</span>
            </button>
          ))}
        </div>

        <div className="sd-approvals-right-controls">
          <div className="sd-approvals-search">
            <Search size={14} className="sd-text-muted" />
            <input
              type="text"
              placeholder="Search form #, title, submitter…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="sd-approvals-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="sd-explorer-view-toggle" role="group" aria-label="Layout mode">
            <button
              type="button"
              className={`sd-icon-btn ${viewMode === 'board' ? 'is-active' : ''}`}
              title="Kanban Board View"
              onClick={() => handleChangeViewMode('board')}
            >
              <Columns3 size={15} />
            </button>
            <button
              type="button"
              className={`sd-icon-btn ${viewMode === 'table' ? 'is-active' : ''}`}
              title="Table View"
              onClick={() => handleChangeViewMode('table')}
            >
              <List size={15} />
            </button>
            <button
              type="button"
              className={`sd-icon-btn ${viewMode === 'cards' ? 'is-active' : ''}`}
              title="Cards View"
              onClick={() => handleChangeViewMode('cards')}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Status Filter Chips (Table & Cards views only) */}
      {viewMode !== 'board' && (
        <div className="sd-approvals-toolbar">
          <div className="sd-status-chips-wrap" role="group" aria-label="Filter by submission status">
            {STATUS_OPTIONS.map(opt => {
              const count = statusCounts[opt.id] || 0;
              const isActive = statusFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`sd-status-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setStatusFilter(opt.id)}
                >
                  {opt.tone && <span className={`sd-status-chip-dot ${opt.tone}`} />}
                  <span>{opt.label}</span>
                  <span className="sd-status-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'board' ? (
        search && boardFilteredRows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No matching submissions found"
            text="Try clearing your search query."
            action={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch('')}
              >
                Clear search
              </button>
            }
          />
        ) : (
          <SubmissionKanbanBoard
            rows={boardFilteredRows}
            onOpen={id => setOpenId(id)}
          />
        )
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={tab === 'queue' ? CheckCircle2 : FileText}
          title={
            search || statusFilter !== 'ALL'
              ? 'No matching submissions found'
              : tab === 'queue'
              ? 'Nothing waiting for you'
              : tab === 'mine'
              ? 'You have not submitted any forms yet'
              : 'No documents submitted in this section'
          }
          text={
            statusFilter !== 'ALL' || search
              ? 'Try changing your status filter or clearing your search query.'
              : tab === 'mine' && !search
              ? 'Go to Forms & Templates to fill and submit a form.'
              : undefined
          }
          action={
            (search || statusFilter !== 'ALL') ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : viewMode === 'cards' ? (
        <SubmissionPipelineCards
          rows={filteredRows}
          onOpen={id => setOpenId(id)}
          onPreviewDoc={handleQuickPreview}
          currentUserId={currentUser?.id}
        />
      ) : (
        <SubmissionTable
          rows={filteredRows}
          onOpen={id => setOpenId(id)}
          onPreviewDoc={handleQuickPreview}
          currentUserId={currentUser?.id}
        />
      )}

      {openId && (
        <SubmissionDetailModal
          submissionId={openId}
          initialViewAs={tab === 'mine' ? 'submitter' : 'auto'}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
};
