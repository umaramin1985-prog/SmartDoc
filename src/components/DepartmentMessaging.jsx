import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader, EmptyState, initials, roleLabel, formatDate, UserAvatar } from './ui';
import { MessageSquare, Send, Paperclip, X, FileText, Shield } from 'lucide-react';

export const DepartmentMessaging = () => {
  const {
    currentUser, isSuperAdmin, departments, users, formSubmissions,
    departmentMessages, fetchDepartmentMessages, sendDepartmentMessage, openDocumentPreview
  } = useApp();

  const [dept, setDept] = useState(currentUser.department);
  const [text, setText] = useState('');
  const [formRef, setFormRef] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    fetchDepartmentMessages(dept);
    const timer = setInterval(() => fetchDepartmentMessages(dept), 5000);
    return () => clearInterval(timer);
  }, [dept, fetchDepartmentMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [departmentMessages.length]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    const ok = await sendDepartmentMessage(dept, text.trim(), formRef?.uniqueNumber || null, formRef?.title || null);
    if (ok) { setText(''); setFormRef(null); setShowAttach(false); }
  };

  const members = users.filter(u => u.department === dept);
  const attachable = formSubmissions.filter(s => s.department === dept || s.submittedById === currentUser.id);

  return (
    <div className="sd-page sd-page-fill animate-fade-in">
      <PageHeader
        title="Team Messaging"
        subtitle={`Private channel for ${dept}. Reference a form to discuss it with your team.`}
        actions={isSuperAdmin && (
          <select className="sd-input" value={dept} onChange={e => setDept(e.target.value)} aria-label="Channel">
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        )}
      />

      <div className="sd-chat-layout">
        <section className="sd-card sd-chat">
          <div className="sd-chat-scroll">
            {departmentMessages.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No messages yet" text="Start the conversation with your department." />
            ) : departmentMessages.map(m => {
              const mine = m.senderId === currentUser.id;
              const found = m.formRefId && formSubmissions.find(s => s.uniqueNumber === m.formRefId);
              return (
                <div key={m.id} className={`sd-msg ${mine ? 'is-mine' : ''}`}>
                  <UserAvatar name={m.senderName} avatar={m.senderAvatar || (mine ? currentUser?.avatar : undefined)} size="sm" />
                  <div className="sd-msg-bubble">
                    <div className="sd-msg-meta">
                      <strong>{mine ? 'You' : m.senderName}</strong>
                      {m.senderRole && m.senderRole !== 'user' && <span className="sd-badge sd-badge-violet"><Shield size={10} /> Admin</span>}
                      <span className="sd-muted">{formatDate(m.createdAt, true)}</span>
                    </div>
                    <div className="sd-msg-text">{m.message}</div>
                    {m.formRefId && (
                      <button
                        className="sd-msg-ref"
                        disabled={!found}
                        title={found ? 'Open document' : 'You do not have access to this form'}
                        onClick={() => found && openDocumentPreview({ kind: 'submission', id: found.id, title: `${found.uniqueNumber} — ${found.title}`, fileName: `${found.uniqueNumber}_v${found.version}.docx` })}
                      >
                        <FileText size={14} /> {m.formRefId}{m.formRefTitle ? ` · ${m.formRefTitle}` : ''}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {showAttach && (
            <div className="sd-attach-list">
              <div className="sd-attach-head">
                <span>Reference a form</span>
                <button className="sd-icon-btn" onClick={() => setShowAttach(false)}><X size={14} /></button>
              </div>
              {attachable.length === 0 ? <p className="sd-muted sd-small">No forms to reference.</p> : attachable.slice(0, 20).map(s => (
                <button key={s.id} className="sd-attach-item" onClick={() => { setFormRef(s); setShowAttach(false); }}>
                  <FileText size={14} /> <span className="sd-mono">{s.uniqueNumber}</span> {s.title}
                </button>
              ))}
            </div>
          )}

          {formRef && (
            <div className="sd-attach-chip">
              <FileText size={14} /> {formRef.uniqueNumber} · {formRef.title}
              <button className="sd-icon-btn" onClick={() => setFormRef(null)}><X size={13} /></button>
            </div>
          )}

          <form className="sd-chat-input" onSubmit={send}>
            <button type="button" className="sd-icon-btn" title="Reference a form" onClick={() => setShowAttach(v => !v)}>
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
          <h3 className="sd-section-title">Members ({members.length})</h3>
          {members.length === 0 ? <p className="sd-muted sd-small">No users in this department yet.</p> : (
            <ul className="sd-member-list">
              {members.map(u => (
                <li key={u.id}>
                  <UserAvatar user={u} size="sm" />
                  <div>
                    <div>{u.name}</div>
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
