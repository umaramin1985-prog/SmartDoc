import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge, formatDate, UserAvatar, roleLabel } from './ui';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import { FillFormModal } from './FillFormModal';
import { buildAppUrl, tabLinkProps } from '../utils/router';
import {
  Inbox, Clock, CheckCircle2, PenLine, FileText, ArrowRight,
  Building2, Eye, ShieldCheck, RefreshCw, Search, X, Zap,
  Sparkles, Kanban, Table2, Check, FolderOpen, ClipboardCheck,
  GitBranch, Compass, PlayCircle, Layers, ChevronRight, Lock
} from 'lucide-react';

export const SmartDashboardModern = () => {
  const {
    currentUser, isAdmin, myApprovalQueue, mySubmissions,
    departmentSubmissions, formSubmissions, formTemplates,
    reviewsNeedingMe, setActiveTab, openSignatureModal,
    refreshAll
  } = useApp();

  // Department submissions
  const deptList = useMemo(
    () => departmentSubmissions || formSubmissions.filter(
      s => s.department === currentUser?.department || s.workflow?.some(st => st.department === currentUser?.department)
    ),
    [departmentSubmissions, formSubmissions, currentUser?.department]
  );

  // User's own submissions breakdown
  const myObjections = useMemo(
    () => mySubmissions.filter(s => s.status === 'OBJECTION_RAISED'),
    [mySubmissions]
  );
  const myApprovedCount = useMemo(
    () => mySubmissions.filter(s => s.status === 'APPROVED').length,
    [mySubmissions]
  );
  const myInReviewCount = useMemo(
    () => mySubmissions.filter(s => s.status === 'IN_REVIEW').length,
    [mySubmissions]
  );

  // Prioritized "Needs Your Attention" Inbox items
  const priorityActionItems = useMemo(() => {
    const items = [];
    const now = Date.now();

    // 1. Missing digital signature
    if (!currentUser?.hasSignature) {
      items.push({
        id: 'setup-signature',
        type: 'signature',
        tone: 'amber',
        icon: ShieldCheck,
        badge: 'Step 1 · Account Readiness',
        title: 'Create your Digital Signature & PKI Seal',
        subtitle: 'Required before you can sign form submissions or approve department workflows.',
        meta: 'RSA-2048 Cryptographic Identity',
        ctaLabel: 'Set Up Signature',
        onAction: () => openSignatureModal()
      });
    }

    // 2. Forms awaiting the user's approval decision
    myApprovalQueue.forEach(s => {
      const totalSteps = s.workflow?.length || 1;
      const currStep = Math.min(s.currentWorkflowStep || 1, totalSteps);
      const isUrgent = s.expiryDate && (new Date(s.expiryDate).getTime() - now < 48 * 3600 * 1000);
      const activeDept = s.workflow?.[currStep - 1]?.department || s.department;
      items.push({
        id: `approve-${s.id}`,
        type: 'approval',
        tone: isUrgent ? 'amber' : 'violet',
        icon: Inbox,
        badge: isUrgent ? 'Urgent Approval (<48h)' : 'Awaiting Your Decision',
        title: s.title,
        code: s.uniqueNumber,
        subtitle: `Submitted by ${s.submittedByName} (${s.department})`,
        meta: `Stage ${currStep} of ${totalSteps} · ${activeDept} Sign-off`,
        ctaLabel: 'Review & Decide',
        onAction: () => setSelectedSubmissionId(s.id)
      });
    });

    // 3. User's own submissions that raised an objection / need revision
    myObjections.forEach(s => {
      items.push({
        id: `revise-${s.id}`,
        type: 'revision',
        tone: 'amber',
        icon: PenLine,
        badge: 'Revision Requested',
        title: s.title,
        code: s.uniqueNumber,
        subtitle: 'An approver requested changes on your submission',
        meta: 'Inspect comments & resubmit updated form',
        ctaLabel: 'Fix & Resubmit',
        onAction: () => setSelectedSubmissionId(s.id)
      });
    });

    // 4. Template peer reviews assigned to user
    (reviewsNeedingMe || []).forEach(r => {
      items.push({
        id: `review-${r.id}`,
        type: 'peer-review',
        tone: 'blue',
        icon: ClipboardCheck,
        badge: 'Template Peer Review',
        title: r.templateTitle,
        code: r.templateDepartment,
        subtitle: `Requested by ${r.requestedByName}`,
        meta: 'Pre-publish template verification',
        ctaLabel: 'Review Template',
        onAction: () => setActiveTab('reviews')
      });
    });

    return items;
  }, [currentUser?.hasSignature, myApprovalQueue, myObjections, reviewsNeedingMe, openSignatureModal, setActiveTab]);

  // Workspace view states
  const [activeStep, setActiveStep] = useState(() => (
    !currentUser?.hasSignature ? 1 : priorityActionItems.length > 0 ? 3 : 2
  ));
  const [leftTab, setLeftTab] = useState(() => (
    priorityActionItems.length > 0 ? 'inbox' : 'kanban'
  )); // 'inbox' | 'kanban' | 'table'
  const [trackerScope, setTrackerScope] = useState('mine'); // 'mine' | 'dept' | 'enterprise'
  const [searchQuery, setSearchQuery] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [launchpadHighlight, setLaunchpadHighlight] = useState(false);

  // Direct in-place modals
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [fillTemplate, setFillTemplate] = useState(null);

  const quickFillInputRef = useRef(null);

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

  // Ready-to-fill interactive templates
  const fillableTemplates = useMemo(() => {
    const counts = new Map();
    formSubmissions.forEach(s => {
      const key = s.templateId || s.title;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return formTemplates
      .filter(t => !t.isDraft && t.fileType !== 'pdf' && t.fileType !== 'image' && (t.workflow?.length > 0))
      .map(t => ({
        template: t,
        usageCount: counts.get(t.id) || counts.get(t.title) || 0
      }))
      .sort((a, b) => b.usageCount - a.usageCount);
  }, [formTemplates, formSubmissions]);

  const filteredFillableTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return fillableTemplates.slice(0, 6);
    return fillableTemplates
      .filter(({ template: t }) =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.department || '').toLowerCase().includes(q) ||
        (t.code || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [fillableTemplates, templateSearch]);

  // Scoped submissions for Kanban / Table
  const scopedSubmissions = useMemo(() => {
    if (trackerScope === 'mine') return mySubmissions;
    if (trackerScope === 'dept') return deptList;
    return formSubmissions;
  }, [trackerScope, mySubmissions, deptList, formSubmissions]);

  const filteredSubmissions = useMemo(() => {
    if (!searchQuery.trim()) return scopedSubmissions;
    const q = searchQuery.toLowerCase();
    return scopedSubmissions.filter(s => {
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchNum = (s.uniqueNumber || '').toLowerCase().includes(q);
      const matchName = (s.submittedByName || '').toLowerCase().includes(q);
      const matchDept = (s.department || '').toLowerCase().includes(q);
      return matchTitle || matchNum || matchName || matchDept;
    });
  }, [scopedSubmissions, searchQuery]);

  // 4-Column Kanban Swimlanes
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
        count: actionable.length,
        items: actionable
      },
      {
        id: 'in_review',
        title: 'In Review',
        tone: 'blue',
        count: inReview.length,
        items: inReview
      },
      {
        id: 'revisions',
        title: 'Revisions',
        tone: 'amber',
        count: revisions.length,
        items: revisions
      },
      {
        id: 'approved',
        title: 'Approved & Sealed',
        tone: 'emerald',
        count: approved.length,
        items: approved
      }
    ];
  }, [filteredSubmissions, myApprovalQueue]);

  // Interactive 4-Step Guided Journey definition
  const pendingDecisionCount = myApprovalQueue.length + (reviewsNeedingMe?.length || 0) + myObjections.length;

  const guidedSteps = [
    {
      step: 1,
      icon: ShieldCheck,
      title: 'Digital Signature & PKI',
      desc: currentUser?.hasSignature
        ? 'RSA-2048 certificate active & ready'
        : 'Click to configure your signature',
      statusLabel: currentUser?.hasSignature ? 'Verified' : 'Setup Needed',
      tone: currentUser?.hasSignature ? 'emerald' : 'amber',
      done: Boolean(currentUser?.hasSignature),
      onClick: () => {
        setActiveStep(1);
        openSignatureModal();
      }
    },
    {
      step: 2,
      icon: PenLine,
      title: 'Fill & Submit a Form',
      desc: `${fillableTemplates.length} templates ready in Launchpad`,
      statusLabel: 'Launchpad',
      tone: 'violet',
      done: mySubmissions.length > 0,
      onClick: () => {
        setActiveStep(2);
        setLaunchpadHighlight(true);
        setTimeout(() => setLaunchpadHighlight(false), 1200);
        quickFillInputRef.current?.focus();
      }
    },
    {
      step: 3,
      icon: Inbox,
      title: 'Review & Sign Off',
      desc: pendingDecisionCount > 0
        ? `${pendingDecisionCount} item${pendingDecisionCount === 1 ? '' : 's'} waiting for your decision`
        : 'All assigned approvals & reviews complete',
      statusLabel: pendingDecisionCount > 0 ? `${pendingDecisionCount} Action${pendingDecisionCount === 1 ? '' : 's'}` : 'All Clear',
      tone: pendingDecisionCount > 0 ? 'amber' : 'emerald',
      done: pendingDecisionCount === 0,
      onClick: () => {
        setActiveStep(3);
        setLeftTab('inbox');
      }
    },
    {
      step: 4,
      icon: Kanban,
      title: 'Track & Export PDF',
      desc: `${myInReviewCount} in pipeline · ${myApprovedCount} sealed & approved`,
      statusLabel: `${mySubmissions.length} Forms`,
      tone: 'blue',
      done: myApprovedCount > 0,
      onClick: () => {
        setActiveStep(4);
        setTrackerScope('mine');
        setLeftTab('kanban');
      }
    }
  ];

  const selectedSubmission = useMemo(
    () => formSubmissions.find(s => s.id === selectedSubmissionId) || null,
    [formSubmissions, selectedSubmissionId]
  );

  return (
    <div className="sd-page sdm-page animate-fade-in">
      {/* =====================================================================
          1. Unified Hero & Connected 4-Step Guided Journey Card
          ===================================================================== */}
      <section className="sdm-hero-journey-card sd-card">
        <div className="sdm-hero-top-row">
          <div className="sdm-hero-left">
            <div className="sdm-guided-avatar-badge">
              <Compass size={22} />
            </div>
            <div className="sdm-hero-titles">
              <div className="sdm-hero-title-row">
                <h1 className="sdm-title">{greetingPrefix}, {currentUser.name}</h1>
                <span className="sdm-pill-badge sdm-pill-primary">
                  <Sparkles size={11} /> Guided Workspace
                </span>
                <span className="sdm-pill-badge sdm-pill-neutral">
                  <Building2 size={11} /> {currentUser.department} · {roleLabel(currentUser.systemRole)}
                </span>
              </div>
              <p className="sdm-subtitle">
                {priorityActionItems.length > 0 ? (
                  <>
                    Follow the 4-step workflow guide below — you have <strong>{priorityActionItems.length} item{priorityActionItems.length === 1 ? '' : 's'}</strong> in your Action Queue ready to complete.
                  </>
                ) : (
                  <>
                    Your action queue is clear! Follow the steps below to launch a new form or track live department approvals.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="sdm-hero-right">
            <div className="sd-pill-toggle sd-pill-toggle-sm" role="group" aria-label="Dashboard mode">
              <a
                className="sd-pill-btn active"
                {...tabLinkProps(buildAppUrl('dashboard-modern'), () => setActiveTab('dashboard-modern'))}
                title="Guided Action Workspace"
              >
                <Sparkles size={12} />
                <span>Guided View</span>
              </a>
              <a
                className="sd-pill-btn"
                {...tabLinkProps(buildAppUrl('dashboard'), () => setActiveTab('dashboard'))}
                title="Switch to Charts & Analytics Cockpit"
              >
                <span>Analytics Cockpit</span>
              </a>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              title="Refresh workspace"
            >
              <RefreshCw size={13} className={isRefreshing ? 'sd-spin' : ''} />
            </button>

            <a
              className="btn btn-primary btn-sm"
              {...tabLinkProps(buildAppUrl('forms'), () => setActiveTab('forms'))}
            >
              <FolderOpen size={13} />
              <span>Forms Explorer</span>
            </a>
          </div>
        </div>

        {/* Connected 4-Step Workflow Stepper */}
        <div className="sdm-journey-stepper" role="navigation" aria-label="Guided Workflow Steps">
          {guidedSteps.map((st, idx) => {
            const StepIcon = st.icon;
            const isCurrent = activeStep === st.step;
            return (
              <React.Fragment key={st.step}>
                <button
                  type="button"
                  className={`sdm-journey-node tone-${st.tone} ${isCurrent ? 'is-active' : ''} ${st.done ? 'is-done' : ''}`}
                  onClick={st.onClick}
                >
                  <div className="sdm-journey-node-icon">
                    <StepIcon size={16} />
                    <span className="sdm-journey-step-badge">
                      {st.done ? <Check size={9} strokeWidth={3} /> : st.step}
                    </span>
                  </div>
                  <div className="sdm-journey-node-text">
                    <div className="sdm-journey-node-head">
                      <span className="sdm-journey-node-title">
                        {st.step}. {st.title}
                      </span>
                      <span className={`sdm-step-pill tone-${st.tone}`}>
                        {st.statusLabel}
                      </span>
                    </div>
                    <div className="sdm-journey-node-desc">{st.desc}</div>
                  </div>
                </button>
                {idx < guidedSteps.length - 1 && (
                  <div className={`sdm-journey-connector ${st.done ? 'is-done' : ''}`} aria-hidden="true">
                    <ChevronRight size={14} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          2. Spacious Full-Height 2-Column Workspace
             Left (60%): Action Queue / Live Pipeline Board / Table
             Right (40%): Form Launchpad & Workspace Shortcuts
          ===================================================================== */}
      <div className="sdm-guided-stage">
        {/* LEFT HUB: Priority Action Queue + Live Pipeline */}
        <section className="sd-card sdm-stage-panel sdm-left-hub">
          <header className="sdm-stage-header">
            <div className="sd-pill-toggle">
              <button
                type="button"
                className={`sd-pill-btn ${leftTab === 'inbox' ? 'active' : ''}`}
                onClick={() => {
                  setLeftTab('inbox');
                  setActiveStep(3);
                }}
              >
                <Inbox size={13} />
                <span>Action Queue</span>
                <span className="sdm-seg-count">{priorityActionItems.length}</span>
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${leftTab === 'kanban' ? 'active' : ''}`}
                onClick={() => {
                  setLeftTab('kanban');
                  setActiveStep(4);
                }}
              >
                <Kanban size={13} />
                <span>Pipeline Board</span>
                <span className="sdm-seg-count">{scopedSubmissions.length}</span>
              </button>
              <button
                type="button"
                className={`sd-pill-btn ${leftTab === 'table' ? 'active' : ''}`}
                onClick={() => {
                  setLeftTab('table');
                  setActiveStep(4);
                }}
              >
                <Table2 size={13} />
                <span>Table View</span>
              </button>
            </div>

            {leftTab === 'inbox' ? (
              <div className="sdm-stage-header-right">
                <a
                  className="sd-link sd-small"
                  {...tabLinkProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
                >
                  Open Full Approvals Hub <ArrowRight size={13} />
                </a>
              </div>
            ) : (
              <div className="sdm-stage-header-right">
                <div className="sd-pill-toggle sd-pill-toggle-sm">
                  {[
                    { id: 'mine', label: 'My Forms', count: mySubmissions.length },
                    { id: 'dept', label: currentUser.department, count: deptList.length },
                    ...(isAdmin ? [{ id: 'enterprise', label: 'All', count: formSubmissions.length }] : [])
                  ].map(sc => (
                    <button
                      key={sc.id}
                      type="button"
                      className={`sd-pill-btn ${trackerScope === sc.id ? 'active' : ''}`}
                      onClick={() => setTrackerScope(sc.id)}
                    >
                      <span>{sc.label}</span>
                      <span className="sdm-seg-count">{sc.count}</span>
                    </button>
                  ))}
                </div>

                <div className="sdm-search-box sdm-search-box-sm">
                  <Search size={12} className="sdm-search-icon" />
                  <input
                    type="text"
                    placeholder="Filter pipeline..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button type="button" className="sdm-search-clear" onClick={() => setSearchQuery('')}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </header>

          {/* TAB 1: PRIORITY ACTION QUEUE */}
          {leftTab === 'inbox' && (
            <div className="sdm-stage-body">
              {priorityActionItems.length === 0 ? (
                <div className="sdm-zero-hero">
                  <div className="sdm-zero-orb">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3>You&apos;re All Caught Up!</h3>
                  <p>
                    You have zero pending approvals, revisions, or template reviews waiting on you.
                    Pick a form template on the right to start a new submission, or switch to the Pipeline Board to track active documents.
                  </p>
                  <div className="sd-btn-row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        if (fillableTemplates.length > 0) {
                          setFillTemplate(fillableTemplates[0].template);
                        } else {
                          setActiveTab('forms');
                        }
                      }}
                    >
                      <PlayCircle size={14} /> Start a Form Submission
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setLeftTab('kanban')}
                    >
                      <Kanban size={14} /> View Pipeline Board
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sdm-priority-feed">
                  {priorityActionItems.map((item, idx) => {
                    const ItemIcon = item.icon || Inbox;
                    return (
                      <div
                        key={item.id}
                        className={`sdm-priority-card tone-${item.tone}`}
                        onClick={item.onAction}
                      >
                        <div className={`sdm-priority-icon tone-${item.tone}`}>
                          <ItemIcon size={18} />
                        </div>

                        <div className="sdm-priority-content">
                          <div className="sdm-priority-top">
                            <span className="sdm-priority-step-tag">Priority #{idx + 1}</span>
                            <span className={`sdm-action-badge tone-${item.tone}`}>
                              {item.badge}
                            </span>
                            {item.code && <span className="sdm-mono-tag">{item.code}</span>}
                          </div>
                          <h4 className="sdm-priority-title">{item.title}</h4>
                          <div className="sdm-priority-meta-row">
                            <span>{item.subtitle}</span>
                            {item.meta && (
                              <>
                                <span className="sdm-meta-dot">•</span>
                                <span className="sdm-priority-stage">{item.meta}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary btn-sm sdm-priority-cta"
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onAction();
                          }}
                        >
                          <span>{item.ctaLabel}</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LIVE KANBAN PIPELINE BOARD */}
          {leftTab === 'kanban' && (
            <div className="sdm-kanban-grid">
              {kanbanColumns.map(col => (
                <div key={col.id} className="sdm-kanban-col">
                  <div className={`sdm-kanban-col-head tone-${col.tone}`}>
                    <span className="sdm-kanban-col-title">{col.title}</span>
                    <span className="sdm-kanban-col-count">{col.count}</span>
                  </div>

                  <div className="sdm-kanban-cards">
                    {col.items.map(s => {
                      const totalSteps = s.workflow?.length || 1;
                      const currStep = Math.min(s.currentWorkflowStep || 1, totalSteps);
                      const stepPct = s.status === 'APPROVED' ? 100 : Math.round((currStep / totalSteps) * 100);
                      const activeDept = s.workflow?.[currStep - 1]?.department || s.department;

                      return (
                        <div
                          key={s.id}
                          className="sdm-kanban-card"
                          onClick={() => setSelectedSubmissionId(s.id)}
                        >
                          <div className="sdm-kcard-top">
                            <span className="sdm-mono-tag">{s.uniqueNumber}</span>
                            {s.pkiSignature && (
                              <span className="sd-badge sd-badge-green sd-badge-xs" title="PKI Cryptographically Signed">
                                <ShieldCheck size={10} /> PKI
                              </span>
                            )}
                          </div>
                          <div className="sdm-kcard-title sd-truncate">{s.title}</div>

                          <div className="sdm-kcard-step">
                            <div className="sd-flex-between">
                              <span>
                                {s.status === 'APPROVED'
                                  ? 'All stages approved'
                                  : `Step ${currStep}/${totalSteps} · ${activeDept}`}
                              </span>
                              <strong>{stepPct}%</strong>
                            </div>
                            <div className="sdm-kcard-step-bar">
                              <div className="sdm-kcard-step-fill" style={{ width: `${stepPct}%` }} />
                            </div>
                          </div>

                          <div className="sdm-kcard-foot">
                            <div className="sdm-kcard-user">
                              <UserAvatar name={s.submittedByName} size="xs" />
                              <span className="sd-truncate">{s.submittedByName}</span>
                            </div>
                            <span className="sd-muted sd-xs">{formatDate(s.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })}

                    {col.items.length === 0 && (
                      <div className="sdm-kanban-empty">No documents</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: CLEAN TABLE VIEW */}
          {leftTab === 'table' && (
            <div className="sd-table-wrap sdm-table-wrap">
              <table className="sd-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Submitted By</th>
                    <th>Current Stage</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.slice(0, 20).map(s => {
                    const totalSteps = s.workflow?.length || 1;
                    const currStep = Math.min(s.currentWorkflowStep || 1, totalSteps);
                    const activeDept = s.workflow?.[currStep - 1]?.department || s.department;
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
                            {s.status === 'APPROVED' ? 'Completed' : `Step ${currStep} of ${totalSteps} (${activeDept})`}
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

        {/* RIGHT LAUNCHPAD: Instant Form Starter & Workspace Shortcuts */}
        <aside className={`sd-card sdm-stage-panel sdm-launchpad ${launchpadHighlight ? 'is-highlighted' : ''}`}>
          <header className="sdm-stage-header">
            <div className="sdm-panel-title-group">
              <div className="sdm-panel-icon sdm-tone-violet"><Zap size={16} /></div>
              <div>
                <h2 className="sdm-panel-title">Form Launchpad</h2>
                <p className="sdm-panel-subtitle">
                  Click any template below to fill &amp; submit right from here
                </p>
              </div>
            </div>
            <span className="sdm-pill-badge sdm-pill-primary">
              {fillableTemplates.length} Ready
            </span>
          </header>

          {/* Search input for templates */}
          <div className="sdm-launchpad-search">
            <Search size={14} className="sdm-search-icon" />
            <input
              ref={quickFillInputRef}
              type="text"
              placeholder="Search forms by title, department, or code..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
            />
            {templateSearch && (
              <button type="button" className="sdm-search-clear" onClick={() => setTemplateSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Rich Template Cards */}
          <div className="sdm-launchpad-list">
            {filteredFillableTemplates.length === 0 ? (
              <div className="sdm-kanban-empty">
                No matching fillable templates found.
              </div>
            ) : (
              filteredFillableTemplates.map(({ template: t, usageCount }) => {
                const steps = (t.workflow || []).map(st => (typeof st === 'string' ? st : st?.department)).filter(Boolean);
                const routePreview = steps.length <= 2
                  ? steps.join(' → ')
                  : `${steps[0]} → ${steps[1]} +${steps.length - 2}`;

                return (
                  <div
                    key={t.id}
                    className="sdm-launch-card"
                    onClick={() => setFillTemplate(t)}
                  >
                    <div className="sdm-launch-card-icon">
                      <FileText size={17} />
                    </div>
                    <div className="sdm-launch-card-body">
                      <div className="sdm-launch-card-title sd-truncate">{t.title}</div>
                      <div className="sdm-launch-card-sub">
                        <span className="sdm-launch-dept">{t.department}</span>
                        <span>•</span>
                        <span title={`Approval Route: ${steps.join(' → ')}`}>
                          {routePreview || `${steps.length} stages`}
                        </span>
                        {usageCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{usageCount} filed</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-xs sdm-launch-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFillTemplate(t);
                      }}
                    >
                      <PenLine size={12} />
                      <span>Fill</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Guided Workspace Shortcuts */}
          <footer className="sdm-launchpad-footer">
            <a
              className="sdm-shortcut-tile"
              {...tabLinkProps(buildAppUrl('forms'), () => setActiveTab('forms'))}
            >
              <FolderOpen size={15} className="sd-text-accent" />
              <div>
                <div className="sdm-shortcut-title">All Templates</div>
                <div className="sdm-shortcut-sub">Explorer &amp; Studio</div>
              </div>
            </a>

            <a
              className="sdm-shortcut-tile"
              {...tabLinkProps(buildAppUrl('approvals'), () => setActiveTab('approvals'))}
            >
              <CheckCircle2 size={15} className="sd-text-good" />
              <div>
                <div className="sdm-shortcut-title">Approvals</div>
                <div className="sdm-shortcut-sub">{myApprovalQueue.length} waiting</div>
              </div>
            </a>

            <a
              className="sdm-shortcut-tile"
              {...tabLinkProps(
                buildAppUrl((reviewsNeedingMe?.length || 0) > 0 ? 'reviews' : 'workflows'),
                () => setActiveTab((reviewsNeedingMe?.length || 0) > 0 ? 'reviews' : 'workflows')
              )}
            >
              <GitBranch size={15} className="sd-text-accent" />
              <div>
                <div className="sdm-shortcut-title">
                  {(reviewsNeedingMe?.length || 0) > 0 ? 'Peer Reviews' : 'Workflows'}
                </div>
                <div className="sdm-shortcut-sub">
                  {(reviewsNeedingMe?.length || 0) > 0 ? `${reviewsNeedingMe.length} assigned` : 'Visual Graph'}
                </div>
              </div>
            </a>
          </footer>
        </aside>
      </div>

      {/* Direct In-Place Submission Inspection / Approval Modal */}
      {selectedSubmission && (
        <SubmissionDetailModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmissionId(null)}
        />
      )}

      {/* Direct In-Place Fill Form Modal */}
      {fillTemplate && (
        <FillFormModal
          template={fillTemplate}
          onClose={() => setFillTemplate(null)}
          onDone={() => {
            setFillTemplate(null);
            setTrackerScope('mine');
            setLeftTab('kanban');
            setActiveStep(4);
          }}
        />
      )}
    </div>
  );
};
