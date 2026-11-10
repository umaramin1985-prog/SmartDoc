import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader, EmptyState, roleLabel, formatDate, UserAvatar, StatusBadge } from './ui';
import { buildAppUrl, tabLinkProps } from '../utils/router';
import {
  MessageSquare, Send, Paperclip, X, FileText, Shield,
  Search, ExternalLink, Eye, Building2, Users
} from 'lucide-react';

const formatDayDivider = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export const DepartmentMessaging = () => {
  const {
    currentUser, isSuperAdmin, departments, users, formSubmissions,
    departmentMessages, fetchDepartmentMessages, sendDepartmentMessage,
    openDocumentPreview, setActiveTab
  } = useApp();

  const [dept, setDept] = useState(currentUser.department);
  const [text, setText] = useState('');
  const [formRef, setFormRef] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const [attachSearch, setAttachSearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    fetchDepartmentMessages(dept);
    const timer = setInterval(() => fetchDepartmentMessages(dept), 5000);
    return () => clearInterval(timer);
  }, [dept, fetchDepartmentMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [departmentMessages.length]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    const ok = await sendDepartmentMessage(dept, text.trim(), formRef?.uniqueNumber || null, formRef?.title || null);
    if (ok) {
      setText('');
      setFormRef(null);
      setShowAttach(false);
      setAttachSearch('');
    }
  };

  const members = useMemo(
    () => users.filter(u => u.department === dept),
    [users, dept]
  );

  const attachable = useMemo(() => {
    const base = formSubmissions.filter(s => s.department === dept || s.submittedById === currentUser.id);
    const q = attachSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(s =>
      (s.uniqueNumber || '').toLowerCase().includes(q) ||
      (s.title || '').toLowerCase().includes(q)
    );
  }, [formSubmissions, dept, currentUser.id, attachSearch]);

  const visibleMessages = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    if (!q) return departmentMessages;
    return departmentMessages.filter(m =>
      (m.message || '').toLowerCase().includes(q) ||
      (m.senderName || '').toLowerCase().includes(q) ||
      (m.formRefId || '').toLowerCase().includes(q) ||
      (m.formRefTitle || '').toLowerCase().includes(q)
    );
  }, [departmentMessages, chatSearch]);

  return (
    <div className="sd-page sd-page-fill animate-fade-in">
      <PageHeader
        title="Team Messaging"
        subtitle={`Private encrypted channel for ${dept}. Reference any form to discuss workflows and approvals with your department.`}
        actions={
          <div className="sd-btn-row">
            <div className="sd-chat-header-search">
              <Search size={14} className="sd-text-muted" />
              <input
                type="text"
                placeholder="Filter messages or form #…"
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
              />
              {chatSearch && (
                <button type="button" className="sd-icon-btn sd-icon-btn-xs" onClick={() => setChatSearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            {isSuperAdmin && (
              <select
                className="sd-input"
                value={dept}
                onChange={e => setDept(e.target.value)}
                aria-label="Channel"
                style={{ width: 'auto', minWidth: '180px' }}
              >
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            )}
          </div>
        }
      />

      <div className="sd-chat-layout">
        <section className="sd-card sd-chat">
          <div className="sd-chat-channel-banner">
            <div className="sd-chat-channel-info">
              <Building2 size={15} className="sd-text-accent" />
              <strong>{dept} Channel</strong>
              <span className="sd-badge sd-badge-gray sd-badge-xs">{departmentMessages.length} messages</span>
            </div>
            <span className="sd-muted sd-xs">Use the paperclip to link a form serial number</span>
          </div>

          <div className="sd-chat-scroll">
            {visibleMessages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={chatSearch ? 'No matching messages' : 'No messages yet'}
                text={chatSearch ? `No messages matched "${chatSearch}".` : `Start the conversation with ${dept}.`}
              />
            ) : visibleMessages.map((m, idx) => {
              const mine = m.senderId === currentUser.id;
              const found = m.formRefId && formSubmissions.find(s => s.uniqueNumber === m.formRefId);
              const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
              const dayLabel = formatDayDivider(m.createdAt);
              const prevDayLabel = prevMsg ? formatDayDivider(prevMsg.createdAt) : null;
              const showDayDivider = dayLabel && dayLabel !== prevDayLabel;

              return (
                <React.Fragment key={m.id}>
                  {showDayDivider && (
                    <div className="sd-chat-day-divider">
                      <span>{dayLabel}</span>
                    </div>
                  )}
                  <div className={`sd-msg ${mine ? 'is-mine' : ''}`}>
                    <UserAvatar
                      name={m.senderName}
                      avatar={m.senderAvatar || (mine ? currentUser?.avatar : undefined)}
                      size="sm"
                    />
                    <div className="sd-msg-bubble">
                      <div className="sd-msg-meta">
                        <strong>{mine ? 'You' : m.senderName}</strong>
                        {m.senderRole && m.senderRole !== 'user' && (
                          <span className="sd-badge sd-badge-violet sd-badge-xs">
                            <Shield size={10} /> Admin
                          </span>
                        )}
                        <span className="sd-muted">{formatDate(m.createdAt, true)}</span>
                      </div>
                      <div className="sd-msg-text">{m.message}</div>

                      {m.formRefId && (
                        <div className="sd-msg-ref-card">
                          <div className="sd-msg-ref-info">
                            <div className="sd-msg-ref-head">
                              <FileText size={14} className="sd-text-accent" />
                              <span className="sd-mono sd-font-medium">{m.formRefId}</span>
                              {found && <StatusBadge status={found.status} />}
                            </div>
                            <div className="sd-msg-ref-title">
                              {m.formRefTitle || found?.title || 'Referenced Submission'}
                            </div>
                          </div>
                          {found && (
                            <div className="sd-msg-ref-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                title="Preview Word document"
                                onClick={() => openDocumentPreview({
                                  kind: 'submission',
                                  id: found.id,
                                  title: `${found.uniqueNumber} — ${found.title}`,
                                  fileName: `${found.uniqueNumber}_v${found.version}.docx`
                                })}
                              >
                                <Eye size={12} /> Preview
                              </button>
                              <a
                                className="btn btn-secondary btn-xs"
                                title="Open in Submissions & Approvals"
                                {...tabLinkProps(
                                  buildAppUrl('approvals', { submission: found.id }),
                                  () => {
                                    window.history.pushState({ tab: 'approvals' }, '', buildAppUrl('approvals', { submission: found.id }));
                                    setActiveTab('approvals', { skipHistory: true });
                                  }
                                )}
                              >
                                <ExternalLink size={12} /> Workflow
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={endRef} />
          </div>

          {showAttach && (
            <div className="sd-attach-list animate-fade-in">
              <div className="sd-attach-head">
                <span>Reference a form in your message</span>
                <div className="sd-attach-search-box">
                  <Search size={12} className="sd-text-muted" />
                  <input
                    type="text"
                    placeholder="Filter by SD-… or title"
                    value={attachSearch}
                    onChange={e => setAttachSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <button className="sd-icon-btn" onClick={() => setShowAttach(false)}><X size={14} /></button>
              </div>
              <div className="sd-attach-scroll">
                {attachable.length === 0 ? (
                  <p className="sd-muted sd-small" style={{ padding: '8px 10px' }}>No matching forms to reference.</p>
                ) : attachable.slice(0, 25).map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="sd-attach-item"
                    onClick={() => { setFormRef(s); setShowAttach(false); setAttachSearch(''); }}
                  >
                    <FileText size={14} className="sd-text-accent" />
                    <span className="sd-mono sd-font-medium">{s.uniqueNumber}</span>
                    <span className="sd-truncate" style={{ flex: 1, textAlign: 'left' }}>{s.title}</span>
                    <StatusBadge status={s.status} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {formRef && (
            <div className="sd-attach-chip">
              <FileText size={14} className="sd-text-accent" />
              <span className="sd-mono sd-font-medium">{formRef.uniqueNumber}</span>
              <span>· {formRef.title}</span>
              <button type="button" className="sd-icon-btn" onClick={() => setFormRef(null)}><X size={13} /></button>
            </div>
          )}

          <form className="sd-chat-input" onSubmit={send}>
            <button
              type="button"
              className={`sd-icon-btn ${showAttach ? 'is-active' : ''}`}
              title="Reference a form"
              onClick={() => setShowAttach(v => !v)}
            >
              <Paperclip size={17} />
            </button>
            <textarea
              id="input-chat-message"
              rows={1}
              className="sd-input"
              placeholder={`Message ${dept}… (Enter to send)`}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button id="btn-send-message" type="submit" className="btn btn-primary" disabled={!text.trim()}>
              <Send size={15} /> Send
            </button>
          </form>
        </section>

        <aside className="sd-card sd-members">
          <div className="sd-members-head">
            <h3 className="sd-section-title">
              <Users size={15} className="sd-text-accent" /> Members ({members.length})
            </h3>
          </div>
          {members.length === 0 ? (
            <p className="sd-muted sd-small">No users in this department yet.</p>
          ) : (
            <ul className="sd-member-list">
              {members.map(u => (
                <li key={u.id} className="sd-member-row">
                  <UserAvatar user={u} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sd-font-medium sd-truncate">
                      {u.name} {u.id === currentUser?.id && <span className="sd-muted sd-xs">(You)</span>}
                    </div>
                    <div className="sd-muted sd-small">{roleLabel(u.systemRole)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
};
