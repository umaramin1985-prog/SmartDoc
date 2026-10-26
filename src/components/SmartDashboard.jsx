import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader, StatusBadge, formatDate, EmptyState } from './ui';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import {
  Inbox, Clock, AlertTriangle, CheckCircle2, PenLine, FileText, ArrowRight, Building2, Eye
} from 'lucide-react';

export const SmartDashboard = () => {
  const {
    currentUser, isAdmin, isSuperAdmin, myApprovalQueue, mySubmissions, departmentSubmissions, formSubmissions,
    formTemplates, setActiveTab, openSignatureModal
  } = useApp();

  const [submissionsTab, setSubmissionsTab] = useState('mine');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);

  const stats = useMemo(() => ({
    inReview: mySubmissions.filter(s => s.status === 'IN_REVIEW').length,
    objections: mySubmissions.filter(s => s.status === 'OBJECTION_RAISED'),
    approved: mySubmissions.filter(s => s.status === 'APPROVED').length,
    allCount: formSubmissions.length
  }), [mySubmissions, formSubmissions]);

  const cards = [
    ...(isAdmin ? [{ label: 'Awaiting my decision', value: myApprovalQueue.length, icon: Inbox, tone: 'blue', onClick: () => setActiveTab('approvals') }] : []),
    { label: 'My forms in review', value: stats.inReview, icon: Clock, tone: 'violet', onClick: () => setActiveTab('approvals') },
    { label: 'Objections to fix', value: stats.objections.length, icon: AlertTriangle, tone: 'amber', onClick: () => setActiveTab('approvals') },
    { label: 'My approved forms', value: stats.approved, icon: CheckCircle2, tone: 'green', onClick: () => setActiveTab('approvals') },
    { label: 'Total submitted forms', value: stats.allCount, icon: FileText, tone: 'blue', onClick: () => setActiveTab('approvals') }
  ];

  const actionItems = [
    ...myApprovalQueue.map(s => ({
      s,
      reason: `Waiting for your decision (${s.workflow?.[(s.currentWorkflowStep || 1) - 1]?.department})`,
      actionRequired: true
    })),
    ...stats.objections.map(s => ({
      s,
      reason: `Objection raised: "${s.objectionNotes || 'Reviewer requested changes'}" — modify and resubmit`,
      isObjection: true
    }))
  ].slice(0, 6);

  const deptList = useMemo(
    () => departmentSubmissions || formSubmissions.filter(s => s.department === currentUser?.department),
    [departmentSubmissions, formSubmissions, currentUser?.department]
  );

  const displayedSubmissions = useMemo(() => {
    if (submissionsTab === 'mine') return mySubmissions.slice(0, 6);
    if (submissionsTab === 'dept') return deptList.slice(0, 6);
    return formSubmissions.slice(0, 6);
  }, [submissionsTab, mySubmissions, deptList, formSubmissions]);

  return (
    <div className="sd-page animate-fade-in">
      <PageHeader
        title={`Welcome, ${currentUser.name}`}
        subtitle={`${currentUser.department} · ${formTemplates.length} form template${formTemplates.length === 1 ? '' : 's'} available to you · ${formSubmissions.length} document${formSubmissions.length === 1 ? '' : 's'} submitted`}
        actions={
          <div className="sd-btn-row">
            <button className="btn btn-secondary" onClick={() => setActiveTab('approvals')}>
              <CheckCircle2 size={16} /> Submissions &amp; Approvals ({formSubmissions.length})
            </button>
            <button className="btn btn-primary" onClick={() => setActiveTab('forms')}>
              <FileText size={16} /> Fill a form
            </button>
          </div>
        }
      />

      {!currentUser.hasSignature && (
        <div className="sd-alert sd-alert-info sd-alert-action">
          <PenLine size={18} />
          <div>
            <strong>Set up your signature.</strong> It is required to submit or approve forms and is stamped on the Word document.
          </div>
          <button id="btn-dashboard-signature" className="btn btn-primary btn-sm" onClick={openSignatureModal}>Draw signature</button>
        </div>
      )}

      <div className="sd-stat-grid">
        {cards.map(({ label, value, icon: Icon, tone, onClick }) => (
          <div key={label} className="sd-card sd-stat" onClick={onClick} style={{ cursor: 'pointer' }}>
            <div className={`sd-stat-icon sd-tone-${tone}`}><Icon size={18} /></div>
            <div>
              <div className="sd-stat-value">{value}</div>
              <div className="sd-stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="sd-two-col">
        <section className="sd-card sd-panel">
          <header className="sd-panel-header">
            <h2>Needs your action</h2>
            <button className="sd-link" onClick={() => setActiveTab('approvals')}>Submissions &amp; Approvals <ArrowRight size={13} /></button>
          </header>
          {actionItems.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="You're all caught up" />
          ) : (
            <ul className="sd-list">
              {actionItems.map(({ s, reason, isObjection }) => (
                <li
                  key={s.id}
                  className={`sd-list-item ${isObjection ? 'sd-list-item-warn' : ''}`}
                  onClick={() => setSelectedSubmissionId(s.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="sd-list-title">
                      {s.title} <span className="sd-muted sd-mono">{s.uniqueNumber}</span>
                    </div>
                    <div className="sd-muted">{reason} · due {formatDate(s.expiryDate)}</div>
                  </div>
                  <div className="sd-flex-gap-xs">
                    <StatusBadge status={s.status} />
                    <button className="btn btn-secondary btn-xs" title="Open details">
                      <Eye size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sd-card sd-panel">
          <header className="sd-panel-header">
            <div className="sd-flex-gap-sm sd-items-center">
              <h2>Recent Submissions</h2>
              <div className="sd-pill-toggle">
                <button
                  className={`sd-pill-btn ${submissionsTab === 'mine' ? 'active' : ''}`}
                  onClick={() => setSubmissionsTab('mine')}
                >
                  Mine ({mySubmissions.length})
                </button>
                <button
                  className={`sd-pill-btn ${submissionsTab === 'dept' ? 'active' : ''}`}
                  onClick={() => setSubmissionsTab('dept')}
                >
                  Department ({deptList.length})
                </button>
                <button
                  className={`sd-pill-btn ${submissionsTab === 'all' ? 'active' : ''}`}
                  onClick={() => setSubmissionsTab('all')}
                >
                  All ({formSubmissions.length})
                </button>
              </div>
            </div>
            <button className="sd-link" onClick={() => setActiveTab('approvals')}>All forms <ArrowRight size={13} /></button>
          </header>
          {displayedSubmissions.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No submissions yet"
              text={submissionsTab === 'mine' ? "Forms you submit will appear here." : "No documents submitted in this category."}
            />
          ) : (
            <ul className="sd-list">
              {displayedSubmissions.map(s => (
                <li
                  key={s.id}
                  className="sd-list-item"
                  onClick={() => setSelectedSubmissionId(s.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="sd-list-title">
                      {s.title} <span className="sd-muted sd-mono">{s.uniqueNumber}</span>
                    </div>
                    <div className="sd-muted">
                      v{s.version} · By {s.submittedByName} ({s.department}) · {formatDate(s.createdAt)}
                    </div>
                  </div>
                  <div className="sd-flex-gap-xs">
                    <StatusBadge status={s.status} />
                    <button className="btn btn-secondary btn-xs" title="Open details">
                      <Eye size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selectedSubmissionId && (
        <SubmissionDetailModal
          submissionId={selectedSubmissionId}
          onClose={() => setSelectedSubmissionId(null)}
        />
      )}
    </div>
  );
};
