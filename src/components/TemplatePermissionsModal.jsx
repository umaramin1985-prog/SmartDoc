import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, UserAvatar } from './ui';
import {
  Globe, Building2, Users, Search, Check,
  AlertCircle, ShieldCheck, CheckCircle2, RotateCcw
} from 'lucide-react';

export const TemplatePermissionsModal = ({ template, onClose, onSaved }) => {
  const { departments, users, updateTemplatePermissions } = useApp();

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
  const [deptSearch, setDeptSearch] = useState('');
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
  const activeUsers = useMemo(() => users.filter(u => u.status !== 'SUSPENDED'), [users]);
  const filteredUsers = useMemo(() => {
    if (!q) return activeUsers;
    return activeUsers.filter(u => {
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q))
      );
    });
  }, [activeUsers, q]);

  // Filter departments by search term
  const dq = deptSearch.trim().toLowerCase();
  const filteredDepts = useMemo(() => {
    if (!dq) return departments;
    return departments.filter(d => d.name.toLowerCase().includes(dq));
  }, [departments, dq]);

  // Count employees per department
  const deptUserCounts = useMemo(() => {
    const counts = {};
    activeUsers.forEach(u => {
      if (u.department) {
        counts[u.department] = (counts[u.department] || 0) + 1;
      }
    });
    return counts;
  }, [activeUsers]);

  const handleSave = async () => {
    setError('');
    if (accessType === 'DEPARTMENTS' && selectedDepts.length === 0) {
      setError('Please select at least one department to grant access.');
      return;
    }
    if (accessType === 'USERS' && selectedUserIds.length === 0) {
      setError('Please select at least one individual person to grant access.');
      return;
    }

    setSaving(true);
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

  // Scope summary text for footer
  const scopeSummary = useMemo(() => {
    if (accessType === 'ALL') {
      return { icon: Globe, label: 'Company-Wide', detail: 'Visible to all employees' };
    }
    if (accessType === 'DEPARTMENTS') {
      return {
        icon: Building2,
        label: `${selectedDepts.length} Department${selectedDepts.length === 1 ? '' : 's'}`,
        detail: selectedDepts.length === 1 ? selectedDepts[0] : 'Restricted access'
      };
    }
    return {
      icon: Users,
      label: `${selectedUserIds.length} Person${selectedUserIds.length === 1 ? '' : 's'}`,
      detail: 'Assigned individuals only'
    };
  }, [accessType, selectedDepts, selectedUserIds]);

  const ScopeSummaryIcon = scopeSummary.icon;

  return (
    <Modal
      id="template-permissions-modal"
      size="lg"
      title="Access & Permissions"
      subtitle={`Configure who can discover, open, and submit "${template.title}"`}
      onClose={onClose}
      footer={
        <div className="sd-perm-footer-content">
          <div className="sd-perm-footer-summary">
            <ScopeSummaryIcon size={14} className="sd-text-primary" />
            <span>Scope: <strong>{scopeSummary.label}</strong> ({scopeSummary.detail})</span>
          </div>
          <div className="sd-flex-row sd-gap-sm">
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
              {saving ? <CheckCircle2 size={14} className="sd-spin" /> : <Check size={14} />}
              <span>{saving ? 'Saving…' : 'Save Access Rights'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="sd-perm-modal-container">
        {error && (
          <div className="sd-alert sd-alert-error">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Sleek 3-Way Horizontal Scope Selector */}
        <div>
          <label className="sd-label" style={{ marginBottom: '8px', display: 'block' }}>
            Who can view and submit this form?
          </label>
          <div className="sd-perm-scope-selector" role="radiogroup" aria-label="Access scope">
            {/* Scope 1: ALL */}
            <button
              type="button"
              className={`sd-perm-scope-btn ${accessType === 'ALL' ? 'is-active' : ''}`}
              onClick={() => setAccessType('ALL')}
              role="radio"
              aria-checked={accessType === 'ALL'}
            >
              <div className="sd-perm-scope-icon-wrap">
                <Globe size={16} />
              </div>
              <div className="sd-perm-scope-text">
                <span className="sd-perm-scope-title">All Employees</span>
                <span className="sd-perm-scope-sub">Company-wide access</span>
              </div>
            </button>

            {/* Scope 2: DEPARTMENTS */}
            <button
              type="button"
              className={`sd-perm-scope-btn ${accessType === 'DEPARTMENTS' ? 'is-active' : ''}`}
              onClick={() => setAccessType('DEPARTMENTS')}
              role="radio"
              aria-checked={accessType === 'DEPARTMENTS'}
            >
              <div className="sd-perm-scope-icon-wrap">
                <Building2 size={16} />
              </div>
              <div className="sd-perm-scope-text">
                <span className="sd-perm-scope-title">Departments</span>
                <span className="sd-perm-scope-sub">
                  {selectedDepts.length} selected
                </span>
              </div>
            </button>

            {/* Scope 3: USERS */}
            <button
              type="button"
              className={`sd-perm-scope-btn ${accessType === 'USERS' ? 'is-active' : ''}`}
              onClick={() => setAccessType('USERS')}
              role="radio"
              aria-checked={accessType === 'USERS'}
            >
              <div className="sd-perm-scope-icon-wrap">
                <Users size={16} />
              </div>
              <div className="sd-perm-scope-text">
                <span className="sd-perm-scope-title">Specific Persons</span>
                <span className="sd-perm-scope-sub">
                  {selectedUserIds.length} chosen
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Contextual Configuration Workspace */}
        <div className="sd-perm-section-card">
          {/* CASE A: ALL USERS */}
          {accessType === 'ALL' && (
            <div className="sd-perm-all-banner animate-fade-in">
              <div className="sd-perm-all-icon-badge">
                <Globe size={22} />
              </div>
              <div className="sd-perm-all-content">
                <h4>Open Organization-Wide Form</h4>
                <p>
                  Every active member across all company departments will have permission to browse, open, fill out, and submit this document.
                </p>
                <div className="sd-perm-all-pills">
                  <span className="sd-perm-pill-tag">
                    <Check size={12} className="sd-text-primary" /> Visible in Forms Hub
                  </span>
                  <span className="sd-perm-pill-tag">
                    <Check size={12} className="sd-text-primary" /> Searchable by all users
                  </span>
                  <span className="sd-perm-pill-tag">
                    <ShieldCheck size={12} className="sd-text-primary" /> Follows template approval workflow
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* CASE B: DEPARTMENTS */}
          {accessType === 'DEPARTMENTS' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="sd-perm-toolbar">
                <div className="sd-perm-toolbar-left">
                  <span className="sd-perm-toolbar-title">Authorized Departments</span>
                  <span className="sd-perm-counter-badge">
                    {selectedDepts.length} of {departments.length} Selected
                  </span>
                </div>
                <div className="sd-perm-actions">
                  <button type="button" className="sd-perm-action-btn" onClick={selectAllDepts}>
                    Select All
                  </button>
                  <button
                    type="button"
                    className="sd-perm-action-btn"
                    onClick={clearAllDepts}
                    title={`Reset to owning department (${template.department})`}
                  >
                    <RotateCcw size={11} style={{ display: 'inline', marginRight: '3px' }} />
                    Reset
                  </button>
                </div>
              </div>

              {departments.length > 6 && (
                <div className="sd-perm-user-search-wrap">
                  <Search size={14} />
                  <input
                    type="text"
                    className="sd-perm-user-search-input"
                    placeholder="Filter departments…"
                    value={deptSearch}
                    onChange={e => setDeptSearch(e.target.value)}
                  />
                </div>
              )}

              <div className="sd-perm-dept-grid">
                {filteredDepts.map(dept => {
                  const isSelected = selectedDepts.includes(dept.name);
                  const isOwning = dept.name === template.department;
                  const memberCount = deptUserCounts[dept.name] || 0;

                  return (
                    <div
                      key={dept.id || dept.name}
                      className={`sd-perm-dept-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleDept(dept.name)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggleDept(dept.name);
                        }
                      }}
                    >
                      <div className="sd-perm-checkbox-custom">
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div className="sd-perm-dept-info">
                        <div className="sd-perm-dept-name-row">
                          <span className="sd-perm-dept-name" title={dept.name}>{dept.name}</span>
                          {isOwning && (
                            <span className="sd-badge sd-badge-accent sd-badge-xs">Owning Dept</span>
                          )}
                        </div>
                        <span className="sd-perm-dept-meta">
                          {memberCount} employee{memberCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CASE C: USERS */}
          {accessType === 'USERS' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="sd-perm-toolbar">
                <div className="sd-perm-toolbar-left">
                  <span className="sd-perm-toolbar-title">Authorized Individuals</span>
                  <span className="sd-perm-counter-badge">
                    {selectedUserIds.length} Chosen
                  </span>
                </div>
                <div className="sd-perm-actions">
                  <button type="button" className="sd-perm-action-btn" onClick={selectAllFilteredUsers}>
                    Select All Listed ({filteredUsers.length})
                  </button>
                  <button type="button" className="sd-perm-action-btn" onClick={clearAllUsers}>
                    Clear All
                  </button>
                </div>
              </div>

              <div className="sd-perm-user-search-wrap">
                <Search size={14} />
                <input
                  id="input-perm-user-search"
                  type="text"
                  className="sd-perm-user-search-input"
                  placeholder="Search employees by name, @username, or department…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
              </div>

              <div className="sd-perm-user-scroll">
                {filteredUsers.length === 0 ? (
                  <div className="sd-empty" style={{ padding: '24px 0' }}>
                    <p className="sd-muted sd-sm">No employees match "{userSearch}".</p>
                  </div>
                ) : (
                  filteredUsers.map(u => {
                    const isChecked = selectedUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        className={`sd-perm-user-item ${isChecked ? 'is-selected' : ''}`}
                        onClick={() => toggleUser(u.id)}
                        role="checkbox"
                        aria-checked={isChecked}
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            toggleUser(u.id);
                          }
                        }}
                      >
                        <div className="sd-perm-checkbox-custom">
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </div>
                        <UserAvatar user={u} size="sm" />
                        <div className="sd-perm-user-details">
                          <div className="sd-perm-user-main">
                            <span className="sd-perm-user-name">{u.name}</span>
                            <span className="sd-perm-user-sub">@{u.username}</span>
                          </div>
                          <div className="sd-flex-row sd-gap-xs" style={{ flexShrink: 0 }}>
                            <span className="sd-badge sd-badge-gray sd-badge-xs">{u.department}</span>
                            {u.systemRole === 'admin' && (
                              <span className="sd-badge sd-badge-amber sd-badge-xs">Admin</span>
                            )}
                            {u.systemRole === 'superadmin' && (
                              <span className="sd-badge sd-badge-accent sd-badge-xs">Superadmin</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
