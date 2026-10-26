import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader, Modal, EmptyState, initials, roleLabel, formatDate, UserAvatar } from './ui';
import { UserPlus, Building2, Pencil, Trash2, Ban, CheckCircle2, Search, Plus, Users, PenLine, AlertTriangle, ShieldAlert, FileText, Database, Camera } from 'lucide-react';

const emptyUser = { username: '', name: '', password: '', department: '', systemRole: 'user', email: '' };

const UserFormModal = ({ user, onClose }) => {
  const { departments, createUser, updateUser } = useApp();
  const isEdit = !!user;
  const [form, setForm] = useState(() => isEdit
    ? { ...emptyUser, ...user, password: '' }
    : { ...emptyUser, department: departments[0]?.name || '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  const isSuperTarget = user?.systemRole === 'superadmin';

  const valid = form.name.trim() && form.department && (isEdit || (form.username.trim() && form.password.length >= 6));

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    const payload = isEdit
      ? { name: form.name, department: form.department, systemRole: form.systemRole, ...(form.password ? { password: form.password } : {}) }
      : form;
    const r = isEdit ? await updateUser(user.id, payload) : await createUser(payload);
    setSaving(false);
    if (r) onClose();
  };

  return (
    <Modal
      id="user-form-modal"
      title={isEdit ? `Edit ${user.name}` : 'Add user'}
      subtitle={isEdit ? `@${user.username}` : 'Users sign in with their username and password.'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button id="btn-save-user" type="submit" form="user-form" className="btn btn-primary" disabled={!valid || saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        <div className="sd-grid-2">
          <label className="sd-field">
            <span className="sd-label">Full name *</span>
            <input id="input-user-name" className="sd-input" value={form.name} onChange={set('name')} />
          </label>
          <label className="sd-field">
            <span className="sd-label">Username *</span>
            <input id="input-user-username" className="sd-input" value={form.username} onChange={set('username')} disabled={isEdit} autoComplete="off" />
          </label>
          <label className="sd-field">
            <span className="sd-label">{isEdit ? 'New password' : 'Password *'}</span>
            <input id="input-user-password" type="password" className="sd-input" value={form.password} onChange={set('password')}
              placeholder={isEdit ? 'Leave blank to keep current' : 'At least 6 characters'} autoComplete="new-password" />
            {!isEdit && form.password.length > 0 && form.password.length < 6 && (
              <span className="sd-hint" style={{ color: '#f59e0b', fontSize: '0.74rem', marginTop: '4px' }}>
                Password must be at least 6 characters (currently {form.password.length}/6)
              </span>
            )}
          </label>
          <label className="sd-field">
            <span className="sd-label">Email</span>
            <input className="sd-input" type="email" value={form.email} onChange={set('email')} disabled={isEdit} placeholder="Optional" />
          </label>
          <label className="sd-field">
            <span className="sd-label">Department *</span>
            <select id="select-user-department" className="sd-input" value={form.department} onChange={set('department')}>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </label>
          <label className="sd-field">
            <span className="sd-label">Role</span>
            <select id="select-user-role" className="sd-input" value={form.systemRole} onChange={set('systemRole')} disabled={isSuperTarget}>
              {isSuperTarget && <option value="superadmin">Super Administrator</option>}
              <option value="user">User — fills and submits forms</option>
              <option value="admin">Department Admin — uploads templates and approves</option>
            </select>
          </label>
        </div>
      </form>
    </Modal>
  );
};

const DepartmentFormModal = ({ onClose }) => {
  const { createDepartment } = useApp();
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [saving, setSaving] = useState(false);
  const valid = form.name.trim() && form.code.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    const r = await createDepartment(form);
    setSaving(false);
    if (r) onClose();
  };
  return (
    <Modal
      id="department-form-modal"
      title="Add department"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="dept-form" className="btn btn-primary" disabled={!valid || saving}>{saving ? 'Saving…' : 'Create department'}</button>
        </>
      }
    >
      <form id="dept-form" onSubmit={submit}>
        <div className="sd-grid-2">
          <label className="sd-field">
            <span className="sd-label">Name *</span>
            <input className="sd-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="sd-field">
            <span className="sd-label">Short code *</span>
            <input className="sd-input" value={form.code} maxLength={10} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. HR" />
          </label>
        </div>
        <label className="sd-field">
          <span className="sd-label">Description</span>
          <input className="sd-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </label>
      </form>
    </Modal>
  );
};

export const SmartSettingsAdmin = () => {
  const { users, departments, currentUser, isSuperAdmin, toggleUserStatus, deleteUser, deleteDepartment, wipeAllData, wipeFormsOnly, openProfileModal } = useApp();
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState(undefined); // undefined = closed, null = new
  const [showDept, setShowDept] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, text, action }
  const [wipeModal, setWipeModal] = useState(null);
  const [wipeInput, setWipeInput] = useState('');
  const [wiping, setWiping] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => !q || [u.name, u.username, u.department].some(v => String(v || '').toLowerCase().includes(q)));
  }, [users, search]);

  const openWipeEverythingModal = () => {
    setWipeInput('');
    setWipeModal({
      type: 'everything',
      title: 'Wipe Out Every Data (Factory Reset)',
      warning: 'This will irreversibly erase all application data, uploaded Word templates, submissions, review workflows, department chats, and employee accounts across the entire system.',
      confirmPhrase: 'WIPE ALL DATA',
      buttonText: 'Permanently Wipe Everything',
      itemsToDelete: [
        'All uploaded Word templates and explorer folder hierarchies',
        'All filled form submissions, signatures and approval records',
        'All pending and completed template review workflows',
        'All department team messages and system audit logs',
        'All employee and admin accounts'
      ],
      itemsPreserved: [
        `Your Super Administrator account (@${currentUser?.username || 'admin'})`,
        '5 Standard base enterprise departments (HR, Finance, Operations, Legal, IT)'
      ]
    });
  };

  const openWipeFormsModal = () => {
    setWipeInput('');
    setWipeModal({
      type: 'forms',
      title: 'Wipe Only Forms & Templates',
      warning: 'This will irreversibly delete all form templates, folders, filled form submissions, and approval reviews across all departments.',
      confirmPhrase: 'WIPE FORMS',
      buttonText: 'Permanently Wipe Forms',
      itemsToDelete: [
        'All uploaded Word templates and folder structures',
        'All filled form submissions and approval workflow histories',
        'All template review drafts and reviewer responses',
        'Form-related notification alerts'
      ],
      itemsPreserved: [
        'All user accounts, credentials, and saved signatures',
        'All departments and manager configurations',
        'All departmental chat messages and system settings'
      ]
    });
  };

  const handleExecuteWipe = async () => {
    if (!wipeModal || wipeInput.trim() !== wipeModal.confirmPhrase) return;
    setWiping(true);
    try {
      if (wipeModal.type === 'everything') {
        await wipeAllData();
      } else {
        await wipeFormsOnly();
      }
      setWipeModal(null);
      setWipeInput('');
    } finally {
      setWiping(false);
    }
  };

  if (!isSuperAdmin) {
    return <div className="sd-page"><EmptyState title="Restricted" text="Only the Super Administrator can manage users and departments." /></div>;
  }

  return (
    <div className="sd-page animate-fade-in">
      <PageHeader
        title={tab === 'system' ? 'System Reset & Data Purge' : 'Users & Departments'}
        subtitle={tab === 'system'
          ? 'Administrative maintenance utilities to wipe form data or restore the system to factory settings.'
          : 'Each department can have several admins. Admins upload templates and approve forms for their department.'}
        actions={
          tab === 'users' ? (
            <button id="btn-add-user" className="btn btn-primary" onClick={() => setEditUser(null)}><UserPlus size={16} /> Add user</button>
          ) : tab === 'departments' ? (
            <button id="btn-add-department" className="btn btn-primary" onClick={() => setShowDept(true)}><Plus size={16} /> Add department</button>
          ) : null
        }
      />

      <div className="sd-tabs" role="tablist">
        <button role="tab" className={`sd-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          <Users size={15} /> Users <span className="sd-tab-count">{users.length}</span>
        </button>
        <button role="tab" className={`sd-tab ${tab === 'departments' ? 'active' : ''}`} onClick={() => setTab('departments')}>
          <Building2 size={15} /> Departments <span className="sd-tab-count">{departments.length}</span>
        </button>
        <button role="tab" className={`sd-tab ${tab === 'system' ? 'active' : ''}`} onClick={() => setTab('system')}>
          <ShieldAlert size={15} /> System Reset
        </button>
      </div>

      {tab === 'users' && (
        <>
          <div className="sd-toolbar">
            <div className="sd-search">
              <Search size={15} />
              <input
                id="input-search-users"
                type="text"
                placeholder="Search users…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '1.1rem',
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="sd-table-wrap sd-card">
            <table className="sd-table">
              <thead>
                <tr><th>User</th><th>Department</th><th>Role</th><th>Signature</th><th>Status</th><th>Last login</th><th /></tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const isSelf = u.id === currentUser.id;
                  const isSuperRow = u.systemRole === 'superadmin';
                  return (
                    <tr key={u.id}>
                      <td>
                        <div
                          className="sd-user-cell sd-user-cell-clickable"
                          onClick={() => openProfileModal(u)}
                          title="Click to view or change profile photo"
                          style={{ cursor: 'pointer' }}
                        >
                          <UserAvatar user={u} size="sm" />
                          <div><div>{u.name}</div><div className="sd-muted">@{u.username}</div></div>
                        </div>
                      </td>
                      <td>{u.department}</td>
                      <td><span className={`sd-badge ${u.systemRole === 'user' ? 'sd-badge-gray' : 'sd-badge-violet'}`}>{roleLabel(u.systemRole)}</span></td>
                      <td>{u.hasSignature ? <span className="sd-text-good"><PenLine size={14} /> Saved</span> : <span className="sd-muted">Not set</span>}</td>
                      <td><span className={`sd-badge ${u.status === 'SUSPENDED' ? 'sd-badge-red' : 'sd-badge-green'}`}>{u.status === 'SUSPENDED' ? 'Suspended' : 'Active'}</span></td>
                      <td className="sd-muted">{u.lastLogin && u.lastLogin !== 'Never' ? formatDate(u.lastLogin, true) : 'Never'}</td>
                      <td>
                        <div className="sd-btn-row sd-justify-end">
                          <button className="sd-icon-btn" title="Change photo" onClick={() => openProfileModal(u)}><Camera size={15} /></button>
                          <button className="sd-icon-btn" title="Edit" onClick={() => setEditUser(u)}><Pencil size={15} /></button>
                          {!isSelf && !isSuperRow && (
                            <>
                              <button className="sd-icon-btn" title={u.status === 'SUSPENDED' ? 'Activate' : 'Suspend'} onClick={() => toggleUserStatus(u.id)}>
                                {u.status === 'SUSPENDED' ? <CheckCircle2 size={15} /> : <Ban size={15} />}
                              </button>
                              <button className="sd-icon-btn sd-danger-hover" title="Delete" onClick={() => setConfirm({
                                title: 'Delete user?', text: `${u.name} (@${u.username}) will no longer be able to sign in.`, action: () => deleteUser(u.id)
                              })}><Trash2 size={15} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'departments' && (
        <div className="sd-card-grid">
          {departments.map(d => {
            const members = users.filter(u => u.department === d.name);
            const admins = members.filter(u => u.systemRole !== 'user');
            return (
              <article key={d.id} className="sd-card sd-dept-card">
                <div className="sd-dept-head">
                  <div>
                    <h3 className="sd-card-title">{d.name}</h3>
                    <span className="sd-badge sd-badge-gray">{d.code}</span>
                  </div>
                  <button className="sd-icon-btn sd-danger-hover" title="Delete department" onClick={() => setConfirm({
                    title: 'Delete department?', text: `${d.name} will be removed. Departments with users cannot be deleted.`, action: () => deleteDepartment(d.id)
                  })}><Trash2 size={15} /></button>
                </div>
                {d.description && <p className="sd-card-text">{d.description}</p>}
                <div className="sd-meta-row">
                  <span><Users size={13} /> {members.length} member{members.length === 1 ? '' : 's'}</span>
                  <span>{admins.length} admin{admins.length === 1 ? '' : 's'}</span>
                </div>
                {admins.length > 0 && <p className="sd-muted sd-small">Admins: {admins.map(a => a.name).join(', ')}</p>}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'system' && (
        <div className="sd-danger-zone animate-fade-in">
          <div className="sd-danger-header-card">
            <div className="sd-danger-header-icon">
              <ShieldAlert size={28} />
            </div>
            <div>
              <h3 className="sd-danger-header-title">System Data Purge & Reset</h3>
              <p className="sd-danger-header-desc">
                High-privilege administrative utilities to reset application state. You can wipe all form data while preserving users and departments, or perform a complete factory reset.
              </p>
            </div>
          </div>

          <div className="sd-danger-cards-grid">
            {/* Option 1: Factory Reset */}
            <div className="sd-card sd-danger-card">
              <div className="sd-danger-card-top">
                <span className="sd-danger-badge sd-danger-badge-red">Option 1 • Destructive Reset</span>
                <div className="sd-danger-icon-box sd-danger-icon-red">
                  <Database size={20} />
                </div>
              </div>
              <h4 className="sd-danger-card-title">Wipe Out Every Data (Factory Reset)</h4>
              <p className="sd-danger-card-desc">
                Completely resets SmartDoc back to a fresh installation state. Purges all templates, submissions, review workflows, team messages, and non-superadmin user accounts.
              </p>
              <div className="sd-danger-scope-list">
                <div className="sd-danger-scope-item">
                  <span className="sd-scope-dot sd-dot-red" />
                  <span>Erases all forms, templates, folders, submissions & reviews</span>
                </div>
                <div className="sd-danger-scope-item">
                  <span className="sd-scope-dot sd-dot-red" />
                  <span>Deletes all user accounts (preserves Superadmin)</span>
                </div>
                <div className="sd-danger-scope-item">
                  <span className="sd-scope-dot sd-dot-red" />
                  <span>Resets departments to 5 standard enterprise departments</span>
                </div>
              </div>
              <div className="sd-danger-card-action">
                <button
                  id="btn-wipe-all-data"
                  className="btn btn-danger sd-w-full"
                  onClick={openWipeEverythingModal}
                >
                  <Trash2 size={16} /> Wipe Everything…
                </button>
              </div>
            </div>

            {/* Option 2: Forms Only */}
            <div className="sd-card sd-danger-card">
              <div className="sd-danger-card-top">
                <span className="sd-danger-badge sd-danger-badge-amber">Option 2 • Forms Purge</span>
                <div className="sd-danger-icon-box sd-danger-icon-amber">
                  <FileText size={20} />
                </div>
              </div>
              <h4 className="sd-danger-card-title">Wipe Only Forms & Templates</h4>
              <p className="sd-danger-card-desc">
                Purges all form documents and submissions while keeping user accounts, departmental structures, and team chat history intact.
              </p>
              <div className="sd-danger-scope-list">
                <div className="sd-danger-scope-item">
                  <span className="sd-scope-dot sd-dot-red" />
                  <span>Erases all Word templates, folders & submission records</span>
                </div>
                <div className="sd-danger-scope-item">
                  <span className="sd-scope-dot sd-dot-green" />
                  <span>Preserves all user accounts, roles & saved signatures</span>
                </div>
                <div className="sd-danger-scope-item">
                  <span className="sd-scope-dot sd-dot-green" />
                  <span>Preserves all custom departments and team chat messages</span>
                </div>
              </div>
              <div className="sd-danger-card-action">
                <button
                  id="btn-wipe-forms-data"
                  className="btn btn-warning sd-w-full"
                  onClick={openWipeFormsModal}
                >
                  <Trash2 size={16} /> Wipe Only Forms…
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editUser !== undefined && <UserFormModal user={editUser} onClose={() => setEditUser(undefined)} />}
      {showDept && <DepartmentFormModal onClose={() => setShowDept(false)} />}
      {confirm && (
        <Modal
          title={confirm.title}
          size="sm"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => { await confirm.action(); setConfirm(null); }}>Delete</button>
            </>
          }
        >
          <p>{confirm.text}</p>
        </Modal>
      )}

      {wipeModal && (
        <Modal
          id="modal-confirm-wipe"
          title={wipeModal.title}
          subtitle="Please review the consequences carefully before proceeding."
          size="md"
          onClose={() => { if (!wiping) { setWipeModal(null); setWipeInput(''); } }}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => { setWipeModal(null); setWipeInput(''); }} disabled={wiping}>
                Cancel
              </button>
              <button
                id="btn-confirm-wipe-execute"
                className="btn btn-danger"
                disabled={wipeInput.trim() !== wipeModal.confirmPhrase || wiping}
                onClick={handleExecuteWipe}
              >
                {wiping ? 'Wiping Data…' : wipeModal.buttonText}
              </button>
            </>
          }
        >
          <div className="sd-wipe-modal-content">
            <div className="sd-wipe-alert-box">
              <AlertTriangle size={24} className="sd-wipe-alert-icon" />
              <div className="sd-wipe-alert-text">
                <div className="sd-wipe-alert-heading">Warning: Irreversible Operation</div>
                <div>{wipeModal.warning}</div>
              </div>
            </div>

            <div className="sd-wipe-details-box">
              <div className="sd-wipe-section-title">Items that will be permanently deleted:</div>
              <ul className="sd-wipe-bullet-list sd-wipe-delete-list">
                {wipeModal.itemsToDelete.map((it, idx) => <li key={idx}>{it}</li>)}
              </ul>

              {wipeModal.itemsPreserved?.length > 0 && (
                <>
                  <div className="sd-wipe-section-title sd-mt-sm">Items that will be preserved:</div>
                  <ul className="sd-wipe-bullet-list sd-wipe-preserve-list">
                    {wipeModal.itemsPreserved.map((it, idx) => <li key={idx}>{it}</li>)}
                  </ul>
                </>
              )}
            </div>

            <div className="sd-wipe-prompt-area">
              <label className="sd-label" htmlFor="wipe-confirmation-input">
                To confirm, type <span className="sd-wipe-phrase-highlight">{wipeModal.confirmPhrase}</span> in the box below:
              </label>
              <input
                id="wipe-confirmation-input"
                className="sd-input sd-wipe-confirm-input"
                placeholder={`Type "${wipeModal.confirmPhrase}"`}
                value={wipeInput}
                onChange={e => setWipeInput(e.target.value)}
                autoFocus
                disabled={wiping}
                autoComplete="off"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
