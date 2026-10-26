import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, initials, roleLabel, UserAvatar } from './ui';
import { Search, Send, Users, Check } from 'lucide-react';

// Pick reviewers (any active user from any department) and send the draft form out for review
export const SendForReviewModal = ({ title, onClose, onSend }) => {
  const { users, departments, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const candidates = useMemo(
    () => users.filter(u => u.id !== currentUser.id && u.status !== 'SUSPENDED'),
    [users, currentUser.id]
  );

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = candidates.filter(u => !q
      || u.name.toLowerCase().includes(q)
      || (u.username || '').toLowerCase().includes(q)
      || (u.role || '').toLowerCase().includes(q)
      || u.department.toLowerCase().includes(q));
    const names = [
      ...departments.map(d => d.name),
      ...Array.from(new Set(matches.map(u => u.department))).filter(n => !departments.some(d => d.name === n))
    ];
    return names
      .map(name => ({ name, members: matches.filter(u => u.department === name) }))
      .filter(g => g.members.length > 0);
  }, [candidates, departments, search]);

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleGroup = (members) => setSelected(prev => {
    const next = new Set(prev);
    const all = members.every(m => next.has(m.id));
    members.forEach(m => { if (all) next.delete(m.id); else next.add(m.id); });
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
      title="Send for review"
      subtitle={`Choose who should review "${title}" before it is published.`}
      onClose={sending ? undefined : onClose}
      size="lg"
      footer={(
        <>
          <span className="sd-muted sd-rvp-count">
            <Users size={14} /> {selected.size} reviewer{selected.size === 1 ? '' : 's'} selected
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
          <button
            type="button"
            id="btn-confirm-send-review"
            className="btn btn-primary"
            onClick={submit}
            disabled={selected.size === 0 || sending}
          >
            <Send size={15} /> {sending ? 'Sending…' : 'Send for review'}
          </button>
        </>
      )}
    >
      <p className="sd-rvp-intro">
        Each reviewer gets their own copy of the document and can edit it. When everyone has submitted,
        you review every person's changes and accept or reject them one by one.
      </p>

      <label className="sd-rvp-search">
        <Search size={15} />
        <input
          className="sd-input"
          placeholder="Search people, roles or departments…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </label>

      <div className="sd-rvp-list">
        {groups.length === 0 && <p className="sd-muted sd-rvp-empty">No people match your search.</p>}
        {groups.map(g => {
          const allOn = g.members.every(m => selected.has(m.id));
          return (
            <section key={g.name} className="sd-rvp-group">
              <header className="sd-rvp-group-head">
                <strong>{g.name}</strong>
                <span className="sd-muted">{g.members.length} {g.members.length === 1 ? 'person' : 'people'}</span>
                <button type="button" className="sd-link-btn" onClick={() => toggleGroup(g.members)}>
                  {allOn ? 'Clear department' : 'Select department'}
                </button>
              </header>
              <div className="sd-rvp-members">
                {g.members.map(u => {
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
                        <span className="sd-muted sd-rvp-sub">{u.role || roleLabel(u.systemRole)} · @{u.username}</span>
                      </span>
                      <span className="sd-rvp-check">{on && <Check size={13} />}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <label className="sd-field sd-rvp-note">
        <span className="sd-label">Message to reviewers (optional)</span>
        <textarea
          className="sd-input"
          rows={2}
          maxLength={500}
          placeholder="e.g. Please check the wording of section 2 and the approval chain."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
      </label>
    </Modal>
  );
};
