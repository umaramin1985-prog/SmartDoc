import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, formatDate, UserAvatar } from './ui';
import {
  GitCommit, GitBranch, Clock, CheckCircle2,
  AlertTriangle, RefreshCw, PlusCircle, Tag,
  ChevronDown, ChevronUp, FileText, Sliders,
  ShieldCheck, Eye, ArrowRight, Plus, Minus,
  Edit3, Sparkles, Layers, ArrowLeftRight
} from 'lucide-react';

export const VersionHistoryModal = ({ item, target, kind = 'template', onClose }) => {
  const { users = [] } = useApp();
  const activeItem = item || target;
  if (!activeItem) return null;

  const isTemplate = kind ? kind === 'template' : (!activeItem.submittedByName && !activeItem.uniqueNumber);

  let history = [];
  const rawHistory = activeItem.versionHistory ?? activeItem.version_history;
  if (Array.isArray(rawHistory)) {
    history = rawHistory;
  } else if (typeof rawHistory === 'string') {
    try {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }
  }

  const currentVersion = activeItem.version || '1.0';

  // If no history array yet, construct default initial commit
  const commits = useMemo(() => {
    if (history.length > 0) {
      return [...history].reverse(); // latest commit at top
    }
    return [{
      commitId: 'init01',
      version: currentVersion,
      author: {
        name: activeItem.createdBy || activeItem.submittedByName || 'System Author',
        department: activeItem.department || ''
      },
      timestamp: activeItem.createdAt || new Date().toISOString(),
      summary: isTemplate ? 'Initial form template creation' : 'Initial form submission',
      changeType: 'CREATE',
      details: isTemplate ? `${(activeItem.fields || []).length} fields` : `Submitted by ${activeItem.submittedByName || 'User'}`,
      changes: {
        addedFields: (activeItem.fields || []).map(f => ({
          label: f.label || f.key,
          type: f.type || 'text',
          required: !!f.required,
          mode: f.mode || 'direct',
          bold: !!f.bold
        })),
        workflow: (activeItem.workflow || []).map(w => (typeof w === 'string' ? w : w.department))
      },
      fields: activeItem.fields || [],
      workflow: activeItem.workflow || [],
      htmlContent: activeItem.htmlContent || null
    }];
  }, [history, currentVersion, activeItem, isTemplate]);

  // State: expanded commits & active tabs per commit
  const [expandedCommitIds, setExpandedCommitIds] = useState(() => {
    // Expand the latest commit by default so the user sees changes immediately
    const firstId = commits[0]?.commitId || '0';
    return new Set([firstId]);
  });
  const [commitTabs, setCommitTabs] = useState({});
  const [compareMode, setCompareMode] = useState(false);
  const [compareBaseIndex, setCompareBaseIndex] = useState(commits.length - 1); // oldest
  const [compareTargetIndex, setCompareTargetIndex] = useState(0); // newest

  const toggleExpand = (commitId) => {
    setExpandedCommitIds(prev => {
      const next = new Set(prev);
      if (next.has(commitId)) next.delete(commitId);
      else next.add(commitId);
      return next;
    });
  };

  const getCommitTab = (commitId) => commitTabs[commitId] || 'diff';
  const setCommitTab = (commitId, tab) => {
    setCommitTabs(prev => ({ ...prev, [commitId]: tab }));
  };

  const getCommitBadge = (commit) => {
    const action = String(commit.actionType || commit.changeType || '').toUpperCase();
    if (action === 'APPROVE') {
      return <span className="sd-badge sd-badge-green"><CheckCircle2 size={11} /> Approved</span>;
    }
    if (action === 'OBJECTION') {
      return <span className="sd-badge sd-badge-amber"><AlertTriangle size={11} /> Objection</span>;
    }
    if (action === 'RESUBMITTED') {
      return <span className="sd-badge sd-badge-accent"><RefreshCw size={11} /> Resubmitted</span>;
    }
    if (action === 'UPDATE') {
      return <span className="sd-badge sd-badge-accent"><GitCommit size={11} /> Update</span>;
    }
    return <span className="sd-badge sd-badge-gray"><PlusCircle size={11} /> Created</span>;
  };

  // Helper to extract or dynamically compute diffs for any commit
  const resolveCommitDetails = (c, index) => {
    const prevCommit = commits[index + 1];

    let changes = c.changes || null;
    let addedFields = changes?.addedFields || [];
    let removedFields = changes?.removedFields || [];
    let modifiedFields = changes?.modifiedFields || [];
    let workflowChanges = null;

    if (changes?.workflowChanged && changes?.nextWorkflow) {
      workflowChanges = {
        prev: changes.prevWorkflow || null,
        next: changes.nextWorkflow
      };
    } else if (changes?.workflow) {
      workflowChanges = { next: changes.workflow };
    }

    // Dynamic fallback diff computation if commit was saved before granular diff logging
    if (!changes && isTemplate) {
      const currentFields = c.fields || (index === 0 ? (activeItem.fields || []) : []);
      const prevFields = prevCommit?.fields || [];

      if (currentFields.length > 0 && prevFields.length > 0) {
        const prevMap = new Map(prevFields.map(f => [String(f.key || f.label || '').toLowerCase(), f]));
        const currMap = new Map(currentFields.map(f => [String(f.key || f.label || '').toLowerCase(), f]));

        addedFields = currentFields.filter(f => !prevMap.has(String(f.key || f.label || '').toLowerCase()))
          .map(f => ({ label: f.label || f.key, type: f.type || 'text', required: !!f.required, mode: f.mode || 'direct', bold: !!f.bold }));
        removedFields = prevFields.filter(f => !currMap.has(String(f.key || f.label || '').toLowerCase()))
          .map(f => ({ label: f.label || f.key, type: f.type || 'text' }));
        modifiedFields = [];
        currentFields.forEach(f => {
          const p = prevMap.get(String(f.key || f.label || '').toLowerCase());
          if (p) {
            const list = [];
            if (p.label !== f.label) list.push(`Label: "${p.label}" → "${f.label}"`);
            if (p.type !== f.type) list.push(`Type: ${p.type} → ${f.type}`);
            if (!!p.required !== !!f.required) list.push(f.required ? 'Marked required' : 'Marked optional');
            if (p.mode !== f.mode && (p.mode || f.mode)) list.push(`Fill format: ${f.mode || 'direct'}`);
            if (p.bold !== f.bold && (p.bold || f.bold)) list.push(`Text weight: ${f.bold ? 'Bold' : 'Normal'}`);
            if ((p.width || null) !== (f.width || null)) list.push(`Width: ${p.width ? `${p.width}%` : 'Auto'} → ${f.width ? `${f.width}%` : 'Auto'}`);
            if (JSON.stringify(p.options || []) !== JSON.stringify(f.options || [])) list.push('Dropdown options updated');
            if (list.length > 0) modifiedFields.push({ label: f.label || f.key, changes: list });
          }
        });
      } else if (index === commits.length - 1 && currentFields.length > 0) {
        // Initial creation commit
        addedFields = currentFields.map(f => ({
          label: f.label || f.key,
          type: f.type || 'text',
          required: !!f.required,
          mode: f.mode || 'direct',
          bold: !!f.bold
        }));
      }

      // Workflow fallback
      const cWf = c.workflow || (index === 0 ? (activeItem.workflow || []) : []);
      if (Array.isArray(cWf) && cWf.length > 0) {
        workflowChanges = { next: cWf.map(w => (typeof w === 'string' ? w : w.department)) };
      }
    }

    const changedAnswers = c.changedAnswers || [];
    const fieldsSnapshot = c.fields || (index === 0 ? (activeItem.fields || []) : []);
    const hasFieldChanges = addedFields.length > 0 || removedFields.length > 0 || modifiedFields.length > 0;
    const changeCount = addedFields.length + removedFields.length + modifiedFields.length + changedAnswers.length;

    return {
      addedFields,
      removedFields,
      modifiedFields,
      hasFieldChanges,
      workflowChanges,
      changedAnswers,
      fieldsSnapshot,
      changeCount
    };
  };

  // Compare mode diff between two chosen commits
  const compareDiff = useMemo(() => {
    if (!compareMode) return null;
    const baseCommit = commits[compareBaseIndex] || commits[commits.length - 1];
    const targetCommit = commits[compareTargetIndex] || commits[0];

    const baseFields = baseCommit.fields || (compareBaseIndex === 0 ? (activeItem.fields || []) : []);
    const targetFields = targetCommit.fields || (compareTargetIndex === 0 ? (activeItem.fields || []) : []);

    const baseMap = new Map(baseFields.map(f => [String(f.key || f.label || '').toLowerCase(), f]));
    const targetMap = new Map(targetFields.map(f => [String(f.key || f.label || '').toLowerCase(), f]));

    const added = targetFields.filter(f => !baseMap.has(String(f.key || f.label || '').toLowerCase()))
      .map(f => ({ label: f.label || f.key, type: f.type || 'text', required: !!f.required, mode: f.mode || 'direct', bold: !!f.bold }));
    const removed = baseFields.filter(f => !targetMap.has(String(f.key || f.label || '').toLowerCase()))
      .map(f => ({ label: f.label || f.key, type: f.type || 'text' }));
    const modified = [];
    targetFields.forEach(f => {
      const p = baseMap.get(String(f.key || f.label || '').toLowerCase());
      if (p) {
        const list = [];
        if (p.label !== f.label) list.push(`Label: "${p.label}" → "${f.label}"`);
        if (p.type !== f.type) list.push(`Type: ${p.type} → ${f.type}`);
        if (!!p.required !== !!f.required) list.push(f.required ? 'Marked required' : 'Marked optional');
        if (p.mode !== f.mode && (p.mode || f.mode)) list.push(`Fill format: ${f.mode || 'direct'}`);
        if (p.bold !== f.bold && (p.bold || f.bold)) list.push(`Text weight: ${f.bold ? 'Bold' : 'Normal'}`);
        if ((p.width || null) !== (f.width || null)) list.push(`Width: ${p.width ? `${p.width}%` : 'Auto'} → ${f.width ? `${f.width}%` : 'Auto'}`);
        if (JSON.stringify(p.options || []) !== JSON.stringify(f.options || [])) list.push('Dropdown options updated');
        if (list.length > 0) modified.push({ label: f.label || f.key, changes: list });
      }
    });

    const baseWf = (baseCommit.workflow || []).map(w => (typeof w === 'string' ? w : w.department));
    const targetWf = (targetCommit.workflow || (compareTargetIndex === 0 ? (activeItem.workflow || []) : [])).map(w => (typeof w === 'string' ? w : w.department));

    return {
      baseVersion: baseCommit.version || '1.0',
      targetVersion: targetCommit.version || currentVersion,
      added,
      removed,
      modified,
      baseWf,
      targetWf
    };
  }, [compareMode, compareBaseIndex, compareTargetIndex, commits, activeItem, currentVersion]);

  return (
    <Modal
      id="version-history-modal"
      size="lg"
      title="Version History &amp; Form Changes"
      subtitle={`${activeItem.title || activeItem.code || activeItem.uniqueNumber || 'Document'} · Active version: v${currentVersion}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="sd-muted sd-small">
            {commits.length} revision{commits.length === 1 ? '' : 's'} recorded · Git audit trail
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className="sd-git-history-container">
        {/* Branch & Mode Header Bar */}
        <div className="sd-git-header-bar">
          <div className="sd-git-branch-info">
            <GitBranch size={16} className="sd-text-primary" />
            <span className="sd-git-branch-name">main</span>
            <span className="sd-muted">·</span>
            <Tag size={14} className="sd-muted" />
            <span className="sd-font-medium">v{currentVersion}</span>
            <span className="sd-badge sd-badge-gray sd-badge-xs">
              {commits.length} commit{commits.length === 1 ? '' : 's'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {commits.length > 1 && (
              <button
                type="button"
                className={`btn btn-xs ${compareMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCompareMode(v => !v)}
                title="Compare differences between any two revisions"
              >
                <ArrowLeftRight size={13} /> {compareMode ? 'View Timeline' : 'Compare Versions'}
              </button>
            )}
          </div>
        </div>

        {/* Compare Mode View */}
        {compareMode && compareDiff && (
          <div className="sd-git-compare-panel">
            <div className="sd-git-compare-controls">
              <div className="sd-git-compare-select-group">
                <span className="sd-muted sd-small">Base Revision:</span>
                <select
                  className="sd-input sd-git-compare-select"
                  value={compareBaseIndex}
                  onChange={(e) => setCompareBaseIndex(parseInt(e.target.value, 10))}
                >
                  {commits.map((c, i) => (
                    <option key={c.commitId || i} value={i}>
                      v{c.version || '1.0'} ({c.commitId?.slice(0, 6) || `rev-${i}`}) · {c.summary?.slice(0, 32)}…
                    </option>
                  ))}
                </select>
              </div>

              <div className="sd-git-compare-arrow">
                <ArrowRight size={16} className="sd-text-primary" />
              </div>

              <div className="sd-git-compare-select-group">
                <span className="sd-muted sd-small">Compare With:</span>
                <select
                  className="sd-input sd-git-compare-select"
                  value={compareTargetIndex}
                  onChange={(e) => setCompareTargetIndex(parseInt(e.target.value, 10))}
                >
                  {commits.map((c, i) => (
                    <option key={c.commitId || i} value={i}>
                      v{c.version || '1.0'} ({c.commitId?.slice(0, 6) || `rev-${i}`}) · {c.summary?.slice(0, 32)}…
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="sd-git-compare-results">
              <div className="sd-git-compare-title">
                <Sparkles size={14} className="sd-text-primary" />
                <span>Diff: <strong>v{compareDiff.baseVersion}</strong> → <strong>v{compareDiff.targetVersion}</strong></span>
              </div>

              {/* Field Changes */}
              <div className="sd-git-diff-list">
                {compareDiff.added.map((f, fi) => (
                  <div key={fi} className="sd-git-diff-item is-add">
                    <span className="sd-git-diff-sign"><Plus size={12} /> Added</span>
                    <div className="sd-git-diff-content">
                      <span className="sd-git-field-name">{f.label}</span>
                      <span className="sd-badge sd-badge-xs sd-badge-gray">{f.type}</span>
                      {f.required && <span className="sd-badge sd-badge-xs sd-badge-amber">Mandatory</span>}
                      {f.mode === 'placeholder' && <span className="sd-badge sd-badge-xs sd-badge-accent">In-Text Placeholder</span>}
                      {f.bold && <span className="sd-badge sd-badge-xs sd-badge-primary">Bold</span>}
                    </div>
                  </div>
                ))}
                {compareDiff.removed.map((f, fi) => (
                  <div key={fi} className="sd-git-diff-item is-del">
                    <span className="sd-git-diff-sign"><Minus size={12} /> Removed</span>
                    <div className="sd-git-diff-content">
                      <span className="sd-git-field-name">{f.label}</span>
                      <span className="sd-badge sd-badge-xs sd-badge-gray">{f.type}</span>
                    </div>
                  </div>
                ))}
                {compareDiff.modified.map((f, fi) => (
                  <div key={fi} className="sd-git-diff-item is-mod">
                    <span className="sd-git-diff-sign"><Edit3 size={12} /> Modified</span>
                    <div className="sd-git-diff-content">
                      <span className="sd-git-field-name">{f.label}</span>
                      <span className="sd-git-diff-change-desc">{f.changes.join(' · ')}</span>
                    </div>
                  </div>
                ))}
                {compareDiff.added.length === 0 && compareDiff.removed.length === 0 && compareDiff.modified.length === 0 && (
                  <div className="sd-git-no-diff-msg">
                    No field structure differences between these two versions. Text layout or approval parameters were modified.
                  </div>
                )}
              </div>

              {/* Workflow Diff */}
              {(compareDiff.baseWf.length > 0 || compareDiff.targetWf.length > 0) && (
                <div className="sd-git-wf-diff-box" style={{ marginTop: '14px' }}>
                  <div className="sd-git-wf-row">
                    <span className="sd-muted sd-small">Base (v{compareDiff.baseVersion}):</span>
                    <div className="sd-git-wf-track">
                      {compareDiff.baseWf.map((dept, di) => (
                        <span key={di} className="sd-badge sd-badge-gray sd-badge-xs">
                          {di + 1}. {dept}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="sd-git-wf-row">
                    <span className="sd-muted sd-small">Target (v{compareDiff.targetVersion}):</span>
                    <div className="sd-git-wf-track">
                      {compareDiff.targetWf.map((dept, di) => (
                        <span key={di} className="sd-badge sd-badge-accent sd-badge-xs">
                          {di + 1}. {dept}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Commit Timeline Graph (Normal View) */}
        {!compareMode && (
          <div className="sd-git-timeline">
            {commits.map((c, index) => {
              const rawAuthor = c.author || { name: c.modifiedBy || 'Author', department: '' };
              const author = typeof rawAuthor === 'string'
                ? { name: rawAuthor, department: '' }
                : (rawAuthor || { name: 'Author', department: '' });

              const userObj = (users || []).find(u =>
                (author.username && u.username === author.username) ||
                (author.id && u.id === author.id) ||
                (author.name && u.name === author.name)
              );
              const isLatest = index === 0;
              const commitId = c.commitId || `rev-${index}`;
              const isExpanded = expandedCommitIds.has(commitId);
              const activeTab = getCommitTab(commitId);

              const {
                addedFields,
                removedFields,
                modifiedFields,
                hasFieldChanges,
                workflowChanges,
                changedAnswers,
                fieldsSnapshot,
                changeCount
              } = resolveCommitDetails(c, index);

              return (
                <div key={commitId} className={`sd-git-commit-node ${isLatest ? 'is-latest' : ''}`}>
                  {/* Timeline connector line & dot */}
                  <div className="sd-git-rail">
                    <div className={`sd-git-dot ${isLatest ? 'is-latest' : ''}`} />
                    {index < commits.length - 1 && <div className="sd-git-line" />}
                  </div>

                  {/* Commit Content Box */}
                  <div className={`sd-git-commit-card ${isLatest ? 'is-latest' : ''} ${isExpanded ? 'is-expanded' : ''}`}>
                    <div className="sd-git-commit-top">
                      <div className="sd-git-commit-titles">
                        <code className="sd-git-hash" title="Commit hash">
                          {c.commitId ? c.commitId.slice(0, 7) : `rev-${index}`}
                        </code>
                        <span className="sd-git-version-pill">v{c.version || currentVersion}</span>
                        {getCommitBadge(c)}
                        {changeCount > 0 && (
                          <span className="sd-badge sd-badge-xs sd-badge-outline sd-text-primary">
                            {changeCount} change{changeCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="sd-git-time" title={c.timestamp}>
                          <Clock size={12} /> {formatDate(c.timestamp, true)}
                        </span>
                        <button
                          type="button"
                          className="sd-git-expand-btn"
                          onClick={() => toggleExpand(commitId)}
                          title={isExpanded ? 'Collapse changes' : 'Inspect changes and fields'}
                        >
                          {isExpanded ? (
                            <><span>Hide changes</span> <ChevronUp size={14} /></>
                          ) : (
                            <><span>View changes</span> <ChevronDown size={14} /></>
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="sd-git-summary">{c.summary || 'No commit message recorded'}</p>

                    {c.objectionAddressed && (
                      <div className="sd-git-objection-note">
                        <strong>Addressed reviewer objection:</strong> {c.objectionAddressed}
                      </div>
                    )}

                    {c.notes && (
                      <div className="sd-git-objection-note">
                        <strong>Review note:</strong> {c.notes}
                      </div>
                    )}

                    <div className="sd-git-meta">
                      <div className="sd-git-author">
                        <UserAvatar
                          user={userObj}
                          name={author.name}
                          avatar={author.avatar || userObj?.avatar}
                          size="xs"
                        />
                        <span className="sd-git-author-name">{author.name}</span>
                        {author.department && <span className="sd-muted">({author.department})</span>}
                      </div>
                      {c.details && <span className="sd-git-details-pill">{c.details}</span>}
                    </div>

                    {/* Expandable Changes & Diff Drawer */}
                    {isExpanded && (
                      <div className="sd-git-changes-panel">
                        <div className="sd-git-panel-header">
                          <div className="sd-git-panel-title">
                            <Sparkles size={14} className="sd-text-primary" />
                            <span>Changes in v{c.version || currentVersion}</span>
                          </div>
                          <div className="sd-git-tab-pills">
                            <button
                              type="button"
                              className={`sd-git-tab-pill ${activeTab === 'diff' ? 'active' : ''}`}
                              onClick={() => setCommitTab(commitId, 'diff')}
                            >
                              <GitCommit size={12} /> Diff &amp; Changes
                            </button>
                            <button
                              type="button"
                              className={`sd-git-tab-pill ${activeTab === 'snapshot' ? 'active' : ''}`}
                              onClick={() => setCommitTab(commitId, 'snapshot')}
                            >
                              <FileText size={12} /> {isTemplate ? 'Form Schema' : 'Submitted Answers'}
                            </button>
                            {c.htmlContent && (
                              <button
                                type="button"
                                className={`sd-git-tab-pill ${activeTab === 'preview' ? 'active' : ''}`}
                                onClick={() => setCommitTab(commitId, 'preview')}
                              >
                                <Eye size={12} /> Document Preview
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Tab 1: Diff & Granular Changes */}
                        {activeTab === 'diff' && (
                          <div className="sd-git-diff-view">
                            {/* Interactive Field Changes */}
                            {hasFieldChanges && (
                              <div className="sd-git-diff-section">
                                <h5 className="sd-git-diff-title">
                                  <Sliders size={13} className="sd-text-primary" /> Form Fields Modified
                                </h5>
                                <div className="sd-git-diff-list">
                                  {addedFields.map((f, fi) => (
                                    <div key={fi} className="sd-git-diff-item is-add">
                                      <span className="sd-git-diff-sign"><Plus size={12} /> Added</span>
                                      <div className="sd-git-diff-content">
                                        <span className="sd-git-field-name">{f.label}</span>
                                        <span className="sd-badge sd-badge-xs sd-badge-gray">{f.type || 'text'}</span>
                                        {f.required && <span className="sd-badge sd-badge-xs sd-badge-amber">Mandatory</span>}
                                        {f.mode === 'placeholder' && <span className="sd-badge sd-badge-xs sd-badge-accent">In-Text Placeholder</span>}
                                        {f.bold && <span className="sd-badge sd-badge-xs sd-badge-primary">Bold</span>}
                                      </div>
                                    </div>
                                  ))}
                                  {removedFields.map((f, fi) => (
                                    <div key={fi} className="sd-git-diff-item is-del">
                                      <span className="sd-git-diff-sign"><Minus size={12} /> Removed</span>
                                      <div className="sd-git-diff-content">
                                        <span className="sd-git-field-name">{f.label}</span>
                                        <span className="sd-badge sd-badge-xs sd-badge-gray">{f.type || 'text'}</span>
                                      </div>
                                    </div>
                                  ))}
                                  {modifiedFields.map((f, fi) => (
                                    <div key={fi} className="sd-git-diff-item is-mod">
                                      <span className="sd-git-diff-sign"><Edit3 size={12} /> Modified</span>
                                      <div className="sd-git-diff-content">
                                        <span className="sd-git-field-name">{f.label}</span>
                                        <span className="sd-git-diff-change-desc">{f.changes.join(' · ')}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Submissions: Changed Answers */}
                            {changedAnswers.length > 0 && (
                              <div className="sd-git-diff-section">
                                <h5 className="sd-git-diff-title">
                                  <CheckCircle2 size={13} className="sd-text-primary" /> Changed Form Answers
                                </h5>
                                <div className="sd-git-answers-diff-table">
                                  {changedAnswers.map((a, ai) => (
                                    <div key={ai} className="sd-git-answer-diff-row">
                                      <span className="sd-git-answer-key">{a.field}</span>
                                      <div className="sd-git-answer-vals">
                                        <span className="sd-git-answer-old"><del>{a.from}</del></span>
                                        <ArrowRight size={12} className="sd-muted" />
                                        <span className="sd-git-answer-new"><ins>{a.to}</ins></span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sequential Approval Workflow Track */}
                            {workflowChanges && (
                              <div className="sd-git-diff-section">
                                <h5 className="sd-git-diff-title">
                                  <ShieldCheck size={13} className="sd-text-primary" /> Approval Chain
                                </h5>
                                <div className="sd-git-wf-diff-box">
                                  {workflowChanges.prev && (
                                    <div className="sd-git-wf-row">
                                      <span className="sd-muted sd-small">Previous:</span>
                                      <div className="sd-git-wf-track">
                                        {workflowChanges.prev.map((dept, di) => (
                                          <span key={di} className="sd-badge sd-badge-gray sd-badge-xs">
                                            {di + 1}. {dept}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div className="sd-git-wf-row">
                                    <span className="sd-muted sd-small">{workflowChanges.prev ? 'Updated to:' : 'Sequence:'}</span>
                                    <div className="sd-git-wf-track">
                                      {workflowChanges.next.map((dept, di) => (
                                        <span key={di} className="sd-badge sd-badge-accent sd-badge-xs">
                                          {di + 1}. {dept}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Title / Description metadata change */}
                            {(c.changes?.titleChanged || c.changes?.descChanged) && (
                              <div className="sd-git-diff-section">
                                <h5 className="sd-git-diff-title">
                                  <FileText size={13} className="sd-text-primary" /> Document Details
                                </h5>
                                {c.changes.titleChanged && (
                                  <div className="sd-git-diff-meta-row">
                                    <span className="sd-muted">Title:</span> <del>{c.changes.titleChanged.from}</del> → <ins>{c.changes.titleChanged.to}</ins>
                                  </div>
                                )}
                                {c.changes.descChanged && (
                                  <div className="sd-git-diff-meta-row">
                                    <span className="sd-muted">Description:</span> <del>{c.changes.descChanged.from || '(empty)'}</del> → <ins>{c.changes.descChanged.to}</ins>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Fallback if no fine-grained field diffs */}
                            {!hasFieldChanges && changedAnswers.length === 0 && !workflowChanges && (
                              <div className="sd-git-no-diff-msg">
                                <p style={{ margin: '0 0 6px 0' }}><strong>Summary:</strong> {c.summary || 'Updated form template definition and layout'}</p>
                                <span className="sd-muted sd-small">
                                  {c.details || 'Document text, paragraph formatting, or table styling committed.'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tab 2: Form Schema Snapshot / Submitted Answers */}
                        {activeTab === 'snapshot' && (
                          <div className="sd-git-snapshot-view">
                            {isTemplate ? (
                              fieldsSnapshot.length > 0 ? (
                                <div className="sd-git-schema-box">
                                  <div className="sd-git-schema-head">
                                    <span>Field Label</span>
                                    <span>Type</span>
                                    <span>Fill Format</span>
                                    <span>Required</span>
                                  </div>
                                  <div className="sd-git-schema-body">
                                    {fieldsSnapshot.map((f, fi) => (
                                      <div key={fi} className="sd-git-schema-row">
                                        <span className="sd-font-medium">{f.label || f.key}</span>
                                        <span className="sd-badge sd-badge-xs sd-badge-gray">{f.type || 'text'}</span>
                                        <span className="sd-muted sd-small">
                                          {f.mode === 'placeholder' ? '🏷️ In-Text' : '📝 Direct Input'}
                                          {f.bold ? ' (Bold)' : ''}
                                        </span>
                                        <span>
                                          {f.required ? (
                                            <span className="sd-badge sd-badge-xs sd-badge-amber">Mandatory</span>
                                          ) : (
                                            <span className="sd-muted sd-small">Optional</span>
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="sd-git-no-diff-msg">
                                  No interactive fields registered for this revision.
                                </div>
                              )
                            ) : (
                              // Submission form data snapshot
                              <div className="sd-git-schema-box">
                                <div className="sd-git-schema-head">
                                  <span>Field Key</span>
                                  <span>Submitted Value</span>
                                </div>
                                <div className="sd-git-schema-body">
                                  {Object.entries(c.formData || activeItem.formData || {}).length > 0 ? (
                                    Object.entries(c.formData || activeItem.formData || {}).map(([k, v], vi) => (
                                      <div key={vi} className="sd-git-schema-row">
                                        <span className="sd-font-medium">{k}</span>
                                        <span>{String(v || '—')}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="sd-git-no-diff-msg">No form answers recorded.</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tab 3: Document Preview (HTML) */}
                        {activeTab === 'preview' && c.htmlContent && (
                          <div className="sd-git-preview-view">
                            <div
                              className="sd-git-preview-frame sd-word-editor-body"
                              dangerouslySetInnerHTML={{
                                __html: String(c.htmlContent).replace(
                                  /<span[^>]*\bdata-sig-width=["']?([^"'\s>]+)["']?[^>]*>\s*\{\{\s*(?:Signature|Sig)\s*:\s*([^|}]+?)(?:\s*\|[^}]*)?\s*\}\}\s*<\/span>/gi,
                                  (_, w, slot) => {
                                    const cleanSlot = String(slot || 'Submitter').trim();
                                    const normW = String(w || 'auto').toLowerCase();
                                    const badge = normW !== 'auto' ? ` (${normW}% width)` : '';
                                    return `<span style="display:inline-block;padding:4px 10px;margin:4px 4px 4px 0;border:1px dashed #6366f1;border-radius:6px;background:#eef2ff;color:#312e81;font-weight:600;font-size:9pt;">✍️ Signature: ${cleanSlot}${badge}</span>`;
                                  }
                                )
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

