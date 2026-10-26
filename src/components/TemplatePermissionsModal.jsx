import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, initials, UserAvatar } from './ui';
import {
  ShieldCheck, Globe, Building2, Users, Search, Check,
  UserCheck, AlertCircle, Lock
} from 'lucide-react';

export const TemplatePermissionsModal = ({ template, onClose, onSaved }) => {
  const { departments, users, updateTemplatePermissions, currentUser } = useApp();

  const [accessType, setAccessType] = useState(() => {
    if (template?.accessType) return template.accessType;
    if (template?.audience === 'ALL') return 'ALL';
    return 'DEPARTMENTS';
  });

  const [selectedDepts, setSelectedDepts] = useState(() => {
    if (Array.isArray(template?.allowedDepartments) && template.allowedDepartments.length > 0) {
      return template.allowedDepartments;
    }
    return template?.department ? [template.department] : [];
  });

  const [selectedUserIds, setSelectedUserIds] = useState(() => {
    if (Array.isArray(template?.allowedUsers)) {
      return template.allowedUsers.map(u => (typeof u === 'string' ? u : u.id)).filter(Boolean);
    }
    return [];
  });

  const [userSearch, setUserSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!template) return null;

  // Toggle department in selection
  const toggleDept = (deptName) => {
    setSelectedDepts(prev => {
      if (prev.includes(deptName)) {
        return prev.filter(d => d !== deptName);
      }
      return [...prev, deptName];
    });
  };

  const selectAllDepts = () => {
    setSelectedDepts(departments.map(d => d.name));
  };

  const clearAllDepts = () => {
    setSelectedDepts(template.department ? [template.department] : []);
  };

  // Toggle user in selection
  const toggleUser = (userId) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      }
      return [...prev, userId];
    });
  };

  const selectAllFilteredUsers = () => {
    const ids = filteredUsers.map(u => u.id);
    setSelectedUserIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const clearAllUsers = () => {
    setSelectedUserIds([]);
  };

  // Filter users by search term
  const q = userSearch.trim().toLowerCase();
  const activeUsers = users.filter(u => u.status !== 'SUSPENDED');
  const filteredUsers = activeUsers.filter(u => {
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.department && u.department.toLowerCase().includes(q))
    );
  });

  const handleSave = async () => {
    setError('');
    if (accessType === 'DEPARTMENTS' && selectedDepts.length === 0) {
      setError('Please select at least one department');
      return;
    }
    if (accessType === 'USERS' && selectedUserIds.length === 0) {
      setError('Please select at least one person');
      return;
    }

    setSaving(true);
    // Map selected user ids to user descriptor objects
    const allowedUsers = selectedUserIds.map(id => {
      const u = users.find(x => x.id === id);
      return u ? { id: u.id, username: u.username, name: u.name, department: u.department } : { id };
    });

    const res = await updateTemplatePermissions(template.id, {
      accessType,
      allowedDepartments: selectedDepts,
      allowedUsers
    });
    setSaving(false);

    if (res) {
      if (onSaved) onSaved(res);
      onClose();
    }
  };

  return (
    <Modal
      id="template-permissions-modal"
      size="md"
      title="Assign Access Rights"
      subtitle={`Configure who can view and fill "${template.title}" (${template.code})`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            id="btn-save-permissions"
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Access Rights'}
          </button>
        </>
      }
    >
      <div className="sd-permissions-form">
        {error && <div className="sd-alert sd-alert-error sd-mb-sm"><AlertCircle size={15} /> {error}</div>}

        <p className="sd-perm-lead">
          Choose whether this form is available company-wide, restricted to specific departments, or assigned to specific individuals only.
        </p>

        {/* Access Scope Options */}
        <div className="sd-perm-cards-grid">
          {/* Option 1: ALL */}
          <div
            className={`sd-perm-card ${accessType === 'ALL' ? 'is-selected' : ''}`}
            onClick={() => setAccessType('ALL')}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => { if (e.key === 'Enter') setAccessType('ALL'); }}
          >
            <div className="sd-perm-card-icon">
              <Globe size={20} />
            </div>
            <div className="sd-perm-card-content">
              <strong>All Users (Company-wide)</strong>
              <span>Every active employee across all departments can view and fill this form.</span>
            </div>
            <div className="sd-perm-radio-check">
              {accessType === 'ALL' && <Check size={13} strokeWidth={3} />}
            </div>
          </div>

          {/* Option 2: DEPARTMENTS */}
          <div
            className={`sd-perm-card ${accessType === 'DEPARTMENTS' ? 'is-selected' : ''}`}
            onClick={() => setAccessType('DEPARTMENTS')}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => { if (e.key === 'Enter') setAccessType('DEPARTMENTS'); }}
          >
            <div className="sd-perm-card-icon">
              <Building2 size={20} />
            </div>
            <div className="sd-perm-card-content">
              <strong>Specific Departments</strong>
              <span>Only members of selected department(s) can view and fill this form.</span>
            </div>
            <div className="sd-perm-radio-check">
              {accessType === 'DEPARTMENTS' && <Check size={13} strokeWidth={3} />}
            </div>
          </div>

          {/* Option 3: USERS */}
          <div
            className={`sd-perm-card ${accessType === 'USERS' ? 'is-selected' : ''}`}
            onClick={() => setAccessType('USERS')}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => { if (e.key === 'Enter') setAccessType('USERS'); }}
          >
            <div className="sd-perm-card-icon">
              <Users size={20} />
            </div>
            <div className="sd-perm-card-content">
              <strong>Specific Persons Only</strong>
              <span>Only explicitly chosen individuals can access and submit this form.</span>
            </div>
            <div className="sd-perm-radio-check">
              {accessType === 'USERS' && <Check size={13} strokeWidth={3} />}
            </div>
          </div>
        </div>

        {/* Detailed selection panel */}
        {accessType === 'DEPARTMENTS' && (
          <div className="sd-perm-detail-panel animate-fade-in">
            <div className="sd-perm-detail-header">
              <span className="sd-perm-detail-title">Select Allowed Departments ({selectedDepts.length})</span>
              <div className="sd-btn-row">
                <button type="button" className="sd-link" onClick={selectAllDepts}>Select All</button>
                <span className="sd-muted">·</span>
                <button type="button" className="sd-link" onClick={clearAllDepts}>Reset</button>
              </div>
            </div>

            <div className="sd-perm-check-grid">
              {departments.map(dept => {
                const isSelected = selectedDepts.includes(dept.name);
                const isOwning = dept.name === template.department;
                return (
                  <label key={dept.id} className={`sd-perm-checkbox-item ${isSelected ? 'is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDept(dept.name)}
                    />
                    <div className="sd-perm-item-label">
                      <strong>{dept.name}</strong>
                      {isOwning && <span className="sd-badge sd-badge-accent sd-badge-xs">Owning Dept</span>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {accessType === 'USERS' && (
          <div className="sd-perm-detail-panel animate-fade-in">
            <div className="sd-perm-detail-header">
              <span className="sd-perm-detail-title">
                Select Allowed Persons ({selectedUserIds.length} chosen)
              </span>
              <div className="sd-btn-row">
                <button type="button" className="sd-link" onClick={selectAllFilteredUsers}>Select All Listed</button>
                <span className="sd-muted">·</span>
                <button type="button" className="sd-link" onClick={clearAllUsers}>Clear</button>
              </div>
            </div>

            <div className="sd-search sd-mb-sm">
              <Search size={14} />
              <input
                id="input-perm-user-search"
                placeholder="Search employees by name, username, or department…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
            </div>

            <div className="sd-perm-user-list">
              {filteredUsers.length === 0 ? (
                <div className="sd-empty-text">No active users match "{userSearch}".</div>
              ) : (
                filteredUsers.map(u => {
                  const isChecked = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      className={`sd-perm-user-row ${isChecked ? 'is-checked' : ''}`}
                      onClick={() => toggleUser(u.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                      />
                      <UserAvatar user={u} size="sm" />
                      <div className="sd-perm-user-info">
                        <span className="sd-perm-user-name">{u.name}</span>
                        <span className="sd-muted sd-small">@{u.username} · {u.department} ({u.role || u.systemRole})</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
