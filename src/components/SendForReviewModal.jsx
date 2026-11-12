import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, roleLabel, UserAvatar } from './ui';
import { Search, Send, Check, X, MessageSquarePlus, ArrowLeft } from 'lucide-react';

// Pick reviewers (any active user from any department) and send the draft form out for review
export const SendForReviewModal = ({ title, onClose, onBack, onSend }) => {
  const { users, departments, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [sending, setSending] = useState(false);

  const candidates = useMemo(
    () => users.filter(u => u.id !== currentUser.id && u.status !== 'SUSPENDED'),
    [users, currentUser.id]
  );

  const deptNames = useMemo(() => {
    const names = [
      ...departments.map(d => d.name),
      ...Array.from(new Set(candidates.map(u => u.department))).filter(n => !departments.some(d => d.name === n))
    ];
    return names.filter(name => candidates.some(u => u.department === name));
  }, [candidates, departments]);

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter(u => {
      if (deptFilter !== 'ALL' && u.department !== deptFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q)
      );
    });
  }, [candidates, deptFilter, search]);

  const selectedUsers = useMemo(
    () => candidates.filter(u => selected.has(u.id)),
    [candidates, selected]
  );

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allVisibleSelected = filteredCandidates.length > 0 && filteredCandidates.every(m => selected.has(m.id));

  const toggleVisible = () => setSelected(prev => {
    const next = new Set(prev);
    filteredCandidates.forEach(m => {
      if (allVisibleSelected) next.delete(m.id);
      else next.add(m.id);
    });
    return next;
  });

  const submit = async () => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    const ok = await onSend({ reviewerIds: Array.from(selected), message: message.trim() });
    if (!ok) setSending(false);
  };

  return (
    <Modal
      id="modal-send-for-review"
      title="Send for Review"
      subtitle={`Select colleagues to review "${title || 'Untitled Form'}"`}
      onClose={sending ? undefined : onClose}
      size="md"
      footer={(
        <>
          <span className="sd-muted sd-rvp-count">
            {selected.size === 0 ? 'No reviewers selected' : `${selected.size} reviewer${selected.size === 1 ? '' : 's'} selected`}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBack || onClose}
            disabled={sending}
          >
            {onBack ? <><ArrowLeft size={14} /> Back</> : 'Cancel'}
          </button>
          <button
            type="button"
            id="btn-confirm-send-review"
            className="btn btn-primary"
            onClick={submit}
            disabled={selected.size === 0 || sending}
          >
            <Send size={14} /> {sending ? 'Sending…' : `Send${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </>
      )}
    >
      {/* Search + Department Filter Bar */}
      <div className="sd-rvp-toolbar">
        <label className="sd-rvp-search">
          <Search size={15} />
          <input
            className="sd-input"
            placeholder="Search by name, role, or department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button type="button" className="sd-rvp-clear-search" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </label>

        {deptNames.length > 1 && (
          <div className="sd-rvp-dept-bar">
            <div className="sd-rvp-dept-pills">
              <button
                type="button"
                className={`sd-rvp-dept-pill ${deptFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setDeptFilter('ALL')}
              >
                All
              </button>
              {deptNames.map(name => (
                <button
                  type="button"
                  key={name}
                  className={`sd-rvp-dept-pill ${deptFilter === name ? 'active' : ''}`}
                  onClick={() => setDeptFilter(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            {filteredCandidates.length > 0 && (
              <button type="button" className="sd-link-btn sd-rvp-select-all" onClick={toggleVisible}>
                {allVisibleSelected ? 'Clear visible' : 'Select all'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Reviewer Chips */}
      {selectedUsers.length > 0 && (
        <div className="sd-rvp-chips">
          {selectedUsers.map(u => (
            <span key={u.id} className="sd-rvp-chip">
              <UserAvatar user={u} size="xs" />
              <span>{u.name}</span>
              <button type="button" onClick={() => toggle(u.id)} aria-label={`Remove ${u.name}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Reviewer Grid */}
      <div className="sd-rvp-list">
        {filteredCandidates.length === 0 ? (
          <p className="sd-muted sd-rvp-empty">No people match your search.</p>
        ) : (
          <div className="sd-rvp-members">
            {filteredCandidates.map(u => {
              const on = selected.has(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  id={`reviewer-opt-${u.username || u.id}`}
                  className={`sd-rvp-member ${on ? 'on' : ''}`}
                  onClick={() => toggle(u.id)}
                  aria-pressed={on}
                >
                  <UserAvatar user={u} className="sd-rvp-avatar" />
                  <span className="sd-rvp-meta">
                    <span className="sd-rvp-name">{u.name}</span>
                    <span className="sd-muted sd-rvp-sub">{u.department} · {u.role || roleLabel(u.systemRole)}</span>
                  </span>
                  <span className="sd-rvp-check">{on && <Check size={12} />}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible Optional Note */}
      <div className="sd-rvp-note">
        {!showNote && !message ? (
          <button
            type="button"
            className="sd-link-btn sd-rvp-note-toggle"
            onClick={() => setShowNote(true)}
          >
            <MessageSquarePlus size={14} /> Add a note for reviewers (optional)
          </button>
        ) : (
          <input
            type="text"
            className="sd-input"
            maxLength={500}
            placeholder="Note for reviewers (e.g., Please check section 2 and the approval chain)…"
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
};
