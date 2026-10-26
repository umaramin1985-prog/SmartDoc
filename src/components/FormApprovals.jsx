import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader, EmptyState, StatusBadge, formatDate } from './ui';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import {
  Inbox, Send, Building2, CheckCircle2, Search, FileText, AlertTriangle, ArrowRight, Eye, X
} from 'lucide-react';

const STATUS_OPTIONS = [
  { id: 'ALL', label: 'All' },
  { id: 'IN_REVIEW', label: 'In Review', tone: 'blue' },
  { id: 'OBJECTION_RAISED', label: 'Changes Requested', tone: 'amber' },
  { id: 'APPROVED', label: 'Approved', tone: 'green' },
  { id: 'REJECTED', label: 'Rejected', tone: 'red' }
];

const SubmissionTable = ({ rows, onOpen, showSubmitter = true, showDept = true, currentUserId }) => (
  <div className="sd-table-wrap sd-card">
    <table className="sd-table sd-table-click">
      <thead>
        <tr>
          <th>Form #</th>
          <th>Title</th>
          {showDept && <th>Department</th>}
          {showSubmitter && <th>Submitted by</th>}
          <th>Current step</th>
          <th>Deadline</th>
          <th>Status</th>
          <th style={{ textAlign: 'right' }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(s => {
          const step = s.workflow?.[(s.currentWorkflowStep || 1) - 1];
          const isOriginator = s.submittedById === currentUserId;
          const hasObjection = s.status === 'OBJECTION_RAISED' && isOriginator;

          return (
            <tr
              key={s.id}
              onClick={() => onOpen(s.id)}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(s.id); }}
              className={hasObjection ? 'sd-tr-highlight-warn' : ''}
            >
              <td>
                <div className="sd-flex-col">
                  <span className="sd-mono sd-font-medium">{s.uniqueNumber}</span>
                  <span className="sd-muted sd-xs">v{s.version}</span>
                </div>
              </td>
              <td>
                <div className="sd-table-title-cell">
                  <strong>{s.title}</strong>
                  {hasObjection && (
                    <span className="sd-badge sd-badge-amber sd-badge-xs sd-mt-xs">
                      <AlertTriangle size={10} /> Action required: Changes requested
                    </span>
                  )}
                </div>
              </td>
              {showDept && (
                <td>
                  <span className="sd-badge sd-badge-gray sd-badge-sm">{s.department}</span>
                </td>
              )}
              {showSubmitter && (
                <td>
                  <span className={isOriginator ? 'sd-font-medium sd-text-accent' : ''}>
                    {s.submittedByName} {isOriginator && '(You)'}
                  </span>
                </td>
              )}
              <td>
                {s.status === 'IN_REVIEW' && step ? (
                  <span className="sd-badge sd-badge-accent sd-badge-sm">{step.department}</span>
                ) : (
                  <span className="sd-muted">—</span>
                )}
              </td>
              <td>{formatDate(s.expiryDate)}</td>
              <td><StatusBadge status={s.status} /></td>
              <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => onOpen(s.id)}
                  title="View submission details"
                >
                  <Eye size={13} /> View
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const FormApprovals = () => {
  const { isAdmin, isSuperAdmin, formSubmissions, myApprovalQueue, mySubmissions, departmentSubmissions, currentUser } = useApp();
  const [tab, setTab] = useState(isAdmin && myApprovalQueue.length > 0 ? 'queue' : 'mine');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [openId, setOpenId] = useState(null);

  const deptForms = useMemo(
    () => departmentSubmissions || formSubmissions.filter(s => s.department === currentUser?.department),
    [departmentSubmissions, formSubmissions, currentUser?.department]
  );

  const tabs = [
    ...(isAdmin ? [{ id: 'queue', label: 'Awaiting my decision', icon: Inbox, count: myApprovalQueue.length }] : []),
    { id: 'mine', label: 'My submissions', icon: Send, count: mySubmissions.length },
    { id: 'dept', label: `${currentUser?.department || 'Department'} documents`, icon: Building2, count: deptForms.length },
    { id: 'all', label: 'All submitted forms', icon: FileText, count: formSubmissions.length }
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

  return (
    <div className="sd-page animate-fade-in">
      <PageHeader
        title="Submissions &amp; Approvals"
        subtitle={isAdmin
          ? 'Review forms awaiting your department approval, track submissions, and follow submitted documents across the enterprise.'
          : 'Track all your submitted forms, view department documents, and address any requested changes.'}
      />

      {/* Tabs */}
      <div className="sd-tabs" role="tablist">
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

      {/* Approvals Toolbar: Status Filter Chips + Search */}
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

        <div className="sd-approvals-search">
          <Search size={14} className="sd-text-muted" />
          <input
            type="text"
            placeholder="Search by form #, title, user…"
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
      </div>

      {filteredRows.length === 0 ? (
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
      ) : (
        <SubmissionTable
          rows={filteredRows}
          onOpen={id => setOpenId(id)}
          showSubmitter={tab !== 'mine'}
          showDept={tab === 'all'}
          currentUserId={currentUser?.id}
        />
      )}

      {openId && (
        <SubmissionDetailModal
          submissionId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
};
