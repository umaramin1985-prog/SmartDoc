import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiService, session } from '../services/apiService';
import { getTabFromPath, getPathForTab, PATH_TITLES } from '../utils/router';
import { initVersionWatcher, forceCacheClearReload, APP_VERSION } from '../utils/versionManager';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  // ---------- Theme ('dark' | 'light') ----------
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('smartdoc_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const setTheme = useCallback((mode) => {
    const next = mode === 'light' ? 'light' : 'dark';
    setThemeState(next);
    try {
      localStorage.setItem('smartdoc_theme', next);
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next);
      document.body?.removeAttribute('data-theme');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('smartdoc_theme', next);
      } catch {}
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
        document.body?.removeAttribute('data-theme');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body?.removeAttribute('data-theme');
    }
  }, [theme]);

  // ---------- Sidebar Collapsed ----------
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('smartdoc_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('smartdoc_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Global shortcut: Ctrl+B or Cmd+B toggles sidebar (when not focused in editable elements)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        const tag = e.target?.tagName?.toLowerCase();
        const isEditable = e.target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
        if (!isEditable) {
          e.preventDefault();
          toggleSidebar();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // ---------- Accent Color ('green' | 'red' | 'orange' | 'purple' | 'blue') ----------
  const [accentColor, setAccentColorState] = useState(() => {
    try {
      return localStorage.getItem('smartdoc_accent_color') || 'green';
    } catch {
      return 'green';
    }
  });

  const setAccentColor = useCallback((color) => {
    const validColors = ['green', 'red', 'orange', 'purple', 'blue'];
    const selected = validColors.includes(color) ? color : 'green';
    setAccentColorState(selected);
    try {
      localStorage.setItem('smartdoc_accent_color', selected);
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-accent', selected);
      document.body?.removeAttribute('data-theme');
      document.body?.removeAttribute('data-accent');
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-accent', accentColor);
      document.body?.removeAttribute('data-theme');
      document.body?.removeAttribute('data-accent');
    }
  }, [accentColor]);

  // ---------- Toasts (Interactive & Actionable) ----------
  const [toasts, setToasts] = useState([]);
  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const addToast = useCallback((title, message, type = 'info', options = {}) => {
    const id = Date.now() + Math.random();
    const duration = options.duration !== undefined ? options.duration : 5000;
    const action = options.action || null; // { label: string, onClick: () => void }
    const secondaryAction = options.secondaryAction || null;
    const details = options.details || null;

    setToasts(prev => {
      // Avoid duplicate toasts if exact title & message already active (unless allowDuplicate: true)
      if (prev.some(t => t.title === title && t.message === message && !options.allowDuplicate)) return prev;
      return [
        ...prev,
        {
          id,
          title,
          message,
          type,
          action,
          secondaryAction,
          details,
          duration,
          createdAt: Date.now()
        }
      ].slice(-5);
    });
  }, []);

  // ---------- App Version & Cache Invalidation Watcher ----------
  useEffect(() => {
    const unwatch = initVersionWatcher((newVersion) => {
      addToast(
        'SmartDoc Update Available',
        `Version v${newVersion} is now available. Clearing cache & reloading...`,
        'info'
      );
      setTimeout(() => {
        forceCacheClearReload(newVersion);
      }, 1200);
    });
    return unwatch;
  }, [addToast]);

  // ---------- Auth ----------
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(() => !!session.get());
  const isAuthenticated = !!currentUser;
  const isSuperAdmin = currentUser?.systemRole === 'superadmin';
  const isAdmin = currentUser?.systemRole === 'admin' || isSuperAdmin;

  const [activeTab, setActiveTabState] = useState(() => getTabFromPath());

  const setActiveTab = useCallback((tabOrFn, options = {}) => {
    setActiveTabState(prev => {
      const nextTab = typeof tabOrFn === 'function' ? tabOrFn(prev) : tabOrFn;
      const targetPath = getPathForTab(nextTab);
      const currentPath = window.location.pathname;

      if (options.replaceState) {
        if (currentPath !== targetPath) {
          window.history.replaceState({ tab: nextTab }, '', targetPath);
        }
      } else if (options.skipHistory) {
        // do not touch history
      } else {
        if (currentPath !== targetPath) {
          window.history.pushState({ tab: nextTab }, '', targetPath);
        }
      }

      return nextTab;
    });
  }, []);

  // Listen to popstate (browser back/forward buttons) and synchronize active tab
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setActiveTabState(tab);
    };

    // Ensure initial canonical path matches (preserve deep-link query string, e.g. ?action=fill&id=…)
    const initialTab = getTabFromPath(window.location.pathname);
    const canonicalPath = getPathForTab(initialTab);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({ tab: initialTab }, '', canonicalPath + window.location.search + window.location.hash);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Synchronize document.title based on auth status and current active tab
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      document.title = 'SmartDoc | Sign In';
    } else {
      document.title = PATH_TITLES[activeTab] || 'SmartDoc | Dashboard';
    }
  }, [isAuthenticated, authLoading, activeTab]);

  // Guard settings tab: redirect non-superadmins to dashboard
  useEffect(() => {
    if (currentUser && !isSuperAdmin && activeTab === 'settings') {
      setActiveTab('dashboard', { replaceState: true });
    }
  }, [currentUser, isSuperAdmin, activeTab, setActiveTab]);

  // ---------- Data ----------
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [formTemplates, setFormTemplates] = useState([]);
  const [formSubmissions, setFormSubmissions] = useState([]);
  const [departmentMessages, setDepartmentMessages] = useState([]);
  const [templateReviews, setTemplateReviews] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [activityLogsMeta, setActivityLogsMeta] = useState({
    totalCount: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    from: 0,
    to: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  // ---------- Global modals ----------
  const [documentPreview, setDocumentPreview] = useState(null); // { kind: 'submission'|'template', id, title, fileName, fileType }
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileModalTargetUser, setProfileModalTargetUser] = useState(null);
  const [profileModalInitialTab, setProfileModalInitialTab] = useState('signature');

  const refreshUsers = useCallback(async () => setUsers(await apiService.getUsers()), []);
  const refreshDepartments = useCallback(async () => setDepartments(await apiService.getDepartments()), []);
  const refreshFolders = useCallback(async () => setFolders(await apiService.getFolders()), []);
  const refreshTemplates = useCallback(async () => setFormTemplates(await apiService.getTemplates()), []);
  const refreshSubmissions = useCallback(async () => setFormSubmissions(await apiService.getSubmissions()), []);
  const refreshReviews = useCallback(async () => setTemplateReviews(await apiService.getReviews()), []);
  const refreshActivityLogs = useCallback(async (params = {}) => {
    setActivityLogsLoading(true);
    try {
      const res = await apiService.getActivityLogs(params);
      setActivityLogs(res.logs || []);
      setActivityLogsMeta({
        totalCount: res.totalCount || 0,
        page: res.page || 1,
        pageSize: res.pageSize || 25,
        totalPages: res.totalPages || 1,
        from: res.from || 0,
        to: res.to || 0,
        hasNextPage: !!res.hasNextPage,
        hasPrevPage: !!res.hasPrevPage
      });
      return res;
    } catch (err) {
      console.error('[refreshActivityLogs]', err);
      return { logs: [], totalCount: 0 };
    } finally {
      setActivityLogsLoading(false);
    }
  }, []);
  const refreshNotifications = useCallback(async () => {
    try {
      const res = await apiService.getNotifications();
      setNotifications(res.notifications || []);
      setUnreadNotificationsCount(res.unreadCount || 0);
    } catch {
      // ignore silently if network blip
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.all([
        refreshUsers(), refreshDepartments(), refreshFolders(),
        refreshTemplates(), refreshSubmissions(), refreshReviews(),
        refreshNotifications()
      ]);
    } catch (err) {
      if (err.status === 401) {
        session.clear();
        setCurrentUser(null);
      } else {
        addToast('Could not load data', err.message, 'error');
      }
    }
  }, [refreshUsers, refreshDepartments, refreshFolders, refreshTemplates, refreshSubmissions, refreshReviews, refreshNotifications, addToast]);

  // Restore session on page load
  useEffect(() => {
    if (!session.get()) return;
    apiService.me()
      .then(user => setCurrentUser(user))
      .catch(() => session.clear())
      .finally(() => setAuthLoading(false));
  }, []);

  // Load data after sign-in, then keep approvals and notifications fresh
  useEffect(() => {
    if (!currentUser?.id) return;
    refreshAll();
    const timer = setInterval(() => {
      refreshSubmissions().catch(() => {});
      refreshReviews().catch(() => {});
      refreshNotifications().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [currentUser?.id, refreshAll, refreshSubmissions, refreshReviews, refreshNotifications]);

  const login = async (username, password) => {
    try {
      const res = await apiService.login(username, password);
      session.set(res.user.id);
      const currentRequestedTab = getTabFromPath(window.location.pathname);
      const destTab = (currentRequestedTab === 'settings' && res.user.systemRole !== 'superadmin')
        ? 'dashboard'
        : currentRequestedTab;
      setActiveTab(destTab, { replaceState: true });
      setCurrentUser(res.user);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const logout = () => {
    session.clear();
    setCurrentUser(null);
    setUsers([]);
    setFolders([]);
    setFormTemplates([]);
    setFormSubmissions([]);
    setDepartmentMessages([]);
    setTemplateReviews([]);
    setActiveTab('dashboard', { replaceState: true });
    document.title = 'SmartDoc | Sign In';
  };

  // Wraps an API call with error toast; returns result or null
  const run = useCallback(async (fn, successTitle, successMsg, options = {}) => {
    try {
      const result = await fn();
      if (successTitle) addToast(successTitle, successMsg || '', 'success', options);
      return result ?? true;
    } catch (err) {
      addToast('Action failed', err.message, 'error');
      return null;
    }
  }, [addToast]);

  // ---------- Signature ----------
  const saveSignature = async (dataUrl) => {
    const updated = await run(() => apiService.saveSignature(currentUser.id, dataUrl),
      dataUrl ? 'Signature saved' : 'Signature cleared',
      dataUrl ? 'It will be applied automatically when you submit or approve forms.' : '');
    if (updated) {
      setCurrentUser(updated);
      refreshUsers().catch(() => {});
    }
    return updated;
  };

  // ---------- Profile Picture / Avatar ----------
  const saveAvatar = async (dataUrl, targetUserId = null) => {
    const uid = targetUserId || currentUser?.id;
    if (!uid) return null;
    const isSelf = uid === currentUser?.id;
    const updated = await run(
      () => apiService.saveAvatar(uid, dataUrl),
      dataUrl ? 'Profile picture updated' : 'Profile picture removed',
      dataUrl ? 'Your avatar has been updated across SmartDoc.' : ''
    );
    if (updated) {
      if (isSelf) {
        setCurrentUser(prev => ({ ...prev, avatar: updated.avatar }));
      }
      refreshUsers().catch(() => {});
    }
    return updated;
  };

  // ---------- PKI Digital Certificates ----------
  const getPkiCertificate = useCallback(async (targetUserId = null) => {
    const uid = targetUserId || currentUser?.id;
    if (!uid) return null;
    try {
      return await apiService.getPkiCertificate(uid);
    } catch (err) {
      console.error('[AppContext] Failed to get PKI certificate:', err);
      return null;
    }
  }, [currentUser]);

  const generatePkiCertificate = useCallback(async (targetUserId = null) => {
    const uid = targetUserId || currentUser?.id;
    if (!uid) return null;
    const isSelf = uid === currentUser?.id;
    const r = await run(
      () => apiService.generatePkiCertificate(uid),
      'PKI Certificate Generated',
      'A fresh RSA 2048-bit key pair and X.509 v3 certificate have been issued.'
    );
    if (r) {
      if (isSelf) {
        setCurrentUser(prev => ({
          ...prev,
          hasPkiCertificate: true,
          pkiSerialNumber: r.serialNumber,
          pkiFingerprint: r.fingerprint,
          pkiIssuedAt: r.issuedAt,
          pkiExpiresAt: r.expiresAt
        }));
      }
      refreshUsers().catch(() => {});
    }
    return r;
  }, [currentUser, run, refreshUsers]);

  const verifySubmissionSignatures = useCallback(async (submissionId) => {
    try {
      return await apiService.verifySubmissionSignatures(submissionId);
    } catch (err) {
      addToast('Verification Failed', err.message || 'Failed to verify signatures', 'error');
      return null;
    }
  }, [addToast]);

  // ---------- Users & departments (super admin) ----------
  const createUser = async (data) => {
    const r = await run(() => apiService.createUser(data), 'User created', `${data.name} can now sign in as "${data.username}".`);
    if (r) await refreshUsers();
    return r;
  };
  const updateUser = async (id, data) => {
    const r = await run(() => apiService.updateUser(id, data), 'User updated');
    if (r) await refreshUsers();
    return r;
  };
  const toggleUserStatus = async (id) => {
    const r = await run(() => apiService.toggleUserStatus(id));
    if (r) {
      addToast(r.status === 'ACTIVE' ? 'User activated' : 'User suspended', '', 'success');
      await refreshUsers();
    }
    return r;
  };
  const deleteUser = async (id) => {
    const r = await run(() => apiService.deleteUser(id), 'User deleted');
    if (r) await refreshUsers();
    return r;
  };
  const createDepartment = async (data) => {
    const r = await run(() => apiService.createDepartment(data), 'Department created', data.name);
    if (r) await refreshDepartments();
    return r;
  };
  const updateDepartment = async (id, data) => {
    const r = await run(() => apiService.updateDepartment(id, data), 'Department updated', data.name);
    if (r) {
      await Promise.all([
        refreshDepartments(),
        refreshUsers(),
        refreshFolders(),
        refreshTemplates(),
        refreshSubmissions(),
        refreshReviews()
      ]);
      try {
        const me = await apiService.me();
        if (me) setCurrentUser(me);
      } catch (_) {}
    }
    return r;
  };
  const deleteDepartment = async (id) => {
    const r = await run(() => apiService.deleteDepartment(id), 'Department deleted');
    if (r) await refreshDepartments();
    return r;
  };

  // ---------- Explorer Folders ----------
  const canManageDepartment = useCallback((deptName) => {
    if (!currentUser) return false;
    return isSuperAdmin || (isAdmin && currentUser.department === deptName);
  }, [currentUser, isSuperAdmin, isAdmin]);

  const createFolder = async (data) => {
    const r = await run(() => apiService.createFolder(data), 'Folder created', data.name);
    if (r) await refreshFolders();
    return r;
  };
  const updateFolder = async (id, data) => {
    const r = await run(() => apiService.updateFolder(id, data), 'Folder renamed');
    if (r) await refreshFolders();
    return r;
  };
  const deleteFolder = async (id) => {
    const r = await run(() => apiService.deleteFolder(id), 'Folder deleted');
    if (r) {
      await Promise.all([refreshFolders(), refreshTemplates(), refreshSubmissions()]);
    }
    return r;
  };

  // ---------- Templates ----------
  const createTemplate = async (data) => {
    const isDraft = data?.isDraft === true || data?.status === 'DRAFT';
    const r = await run(
      () => apiService.createTemplate(data),
      isDraft ? 'Draft saved' : 'Template published',
      isDraft ? `"${data.title}" saved as draft in ${data.department || 'drive'}` : data.title
    );
    if (r) {
      await refreshTemplates();
      if (data?.reviewId) await refreshReviews();
    }
    return r;
  };
  const bulkImportTemplates = async (data) => {
    const r = await run(() => apiService.bulkImportTemplates(data), 'Bulk Import Complete', `${data.files?.length || 0} documents imported.`);
    if (r) {
      await Promise.all([refreshTemplates(), refreshFolders()]);
    }
    return r;
  };
  const updateTemplate = async (id, data) => {
    const isDraft = data?.isDraft === true || data?.status === 'DRAFT';
    const r = await run(
      () => apiService.updateTemplate(id, data),
      isDraft ? 'Draft saved' : 'Form updated',
      isDraft ? `Draft "${data?.title || 'Template'}" saved.` : 'Template changes saved.'
    );
    if (r) {
      await refreshTemplates();
      if (data?.reviewId) await refreshReviews();
    }
    return r;
  };
  const updateTemplatePermissions = async (id, data) => {
    const r = await run(() => apiService.updateTemplatePermissions(id, data), 'Access rights saved', 'Form visibility updated.');
    if (r) await refreshTemplates();
    return r;
  };
  const addTemplateComment = async (id, data) => {
    const r = await run(() => apiService.addTemplateComment(id, data), 'Comment added');
    if (r) await refreshTemplates();
    return r;
  };
  const updateTemplateComment = async (id, commentId, data) => {
    const r = await run(() => apiService.updateTemplateComment(id, commentId, data), 'Comment updated');
    if (r) await refreshTemplates();
    return r;
  };
  const moveTemplate = async (id, folderId) => {
    const r = await run(() => apiService.moveTemplate(id, folderId), 'Template moved');
    if (r) await refreshTemplates();
    return r;
  };
  const archiveTemplate = async (id) => {
    const r = await run(() => apiService.archiveTemplate(id));
    if (r) {
      if (r.action === 'deleted') {
        addToast('Template Deleted', r.message || 'Document permanently deleted from drive.', 'success');
      } else {
        addToast('Template Archived', r.message || 'Existing submissions were preserved.', 'info');
      }
      await refreshTemplates();
    }
    return r;
  };

  // ---------- Submissions ----------
  const submitForm = async (data) => {
    const r = await run(() => apiService.submitForm(data));
    if (r) {
      addToast(
        'Form submitted',
        `${r.uniqueNumber} is now with ${r.workflow?.[0]?.department || 'the first approver'}.`,
        'success',
        {
          action: {
            label: 'View Approvals',
            onClick: () => setActiveTab('approvals')
          }
        }
      );
      await refreshSubmissions();
    }
    return r;
  };
  const resubmitForm = async (id, data) => {
    const r = await run(() => apiService.resubmitForm(id, data));
    if (r) {
      addToast(
        'Form resubmitted',
        `${r.uniqueNumber} is now version ${r.version}.`,
        'success',
        {
          action: {
            label: 'View Approvals',
            onClick: () => setActiveTab('approvals')
          }
        }
      );
      await refreshSubmissions();
    }
    return r;
  };
  const workflowAction = async (id, action, notes) => {
    const r = await run(() => apiService.workflowAction(id, action, notes));
    if (r) {
      const msg = {
        APPROVE: r.status === 'APPROVED' ? 'Final approval recorded — form is approved.' : 'Approved and signed. Sent to the next department.',
        OBJECTION: 'Objection sent back to the submitter.',
        REJECT: 'Form rejected.'
      }[action];
      addToast(r.uniqueNumber, msg, action === 'REJECT' ? 'warning' : 'success');
      await refreshSubmissions();
    }
    return r;
  };
  const addSubmissionComment = async (id, data) => {
    const r = await run(() => apiService.addSubmissionComment(id, data), 'Comment added');
    if (r) await refreshSubmissions();
    return r;
  };
  const updateSubmissionComment = async (id, commentId, data) => {
    const r = await run(() => apiService.updateSubmissionComment(id, commentId, data), 'Comment updated');
    if (r) await refreshSubmissions();
    return r;
  };

  // ---------- Notifications ----------
  const markNotificationRead = async (id) => {
    try {
      await apiService.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadNotificationsCount(prev => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };
  const markAllNotificationsRead = async () => {
    try {
      await apiService.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadNotificationsCount(0);
    } catch {
      // ignore
    }
  };

  // ---------- Template reviews ----------
  const startReview = async (data) => {
    const r = await run(() => apiService.startReview(data),
      'Sent for review', `${data.title} is now with ${data.reviewerIds.length} reviewer${data.reviewerIds.length === 1 ? '' : 's'}.`);
    if (r) await refreshReviews();
    return r;
  };
  const submitReview = async (id, data) => {
    const r = await run(() => apiService.submitReview(id, data),
      'Review submitted', data.hasChanges ? 'Your changes were sent to the person who started the review.' : 'You submitted with no changes.');
    if (r) await refreshReviews();
    return r;
  };
  const saveReviewDecisions = async (id, decisions) => run(() => apiService.saveReviewDecisions(id, decisions));
  const finalizeReview = async (id, data) => {
    const r = await run(() => apiService.finalizeReview(id, data));
    if (r) await refreshReviews();
    return r;
  };
  const cancelReview = async (id) => {
    const r = await run(() => apiService.cancelReview(id), 'Review cancelled');
    if (r) await refreshReviews();
    return r;
  };

  // ---------- Messaging ----------
  const fetchDepartmentMessages = useCallback(async (department) => {
    try {
      setDepartmentMessages(await apiService.getDepartmentMessages(department));
    } catch {
      setDepartmentMessages([]);
    }
  }, []);
  const sendDepartmentMessage = async (department, message, formRefId, formRefTitle) => {
    const r = await run(() => apiService.sendDepartmentMessage({ department, message, formRefId, formRefTitle }));
    if (r) await fetchDepartmentMessages(department);
    return r;
  };

  // ---------- System Maintenance (Superadmin) ----------
  const wipeAllData = async () => {
    const r = await run(
      () => apiService.wipeAllData(),
      'System Reset Complete',
      'All system data, templates, submissions, and non-superadmin accounts have been wiped.',
      {
        action: {
          label: 'Go to Dashboard',
          onClick: () => setActiveTab('dashboard')
        },
        duration: 8000
      }
    );
    if (r) await refreshAll();
    return r;
  };

  const wipeFormsOnly = async () => {
    const r = await run(
      () => apiService.wipeFormsOnly(),
      'Forms Reset Complete',
      'All form templates, folders, submissions, and reviews have been wiped.',
      {
        action: {
          label: 'Go to Forms Hub',
          onClick: () => setActiveTab('forms')
        },
        secondaryAction: {
          label: 'Dashboard',
          onClick: () => setActiveTab('dashboard')
        },
        duration: 8000
      }
    );
    if (r) await refreshAll();
    return r;
  };

  // ---------- Derived ----------
  // Forms waiting for the current user's decision
  const myApprovalQueue = useMemo(() => {
    if (!currentUser || !isAdmin) return [];
    return formSubmissions.filter(s => {
      if (s.status !== 'IN_REVIEW') return false;
      const step = s.workflow?.[(s.currentWorkflowStep || 1) - 1];
      return step && (isSuperAdmin || step.department === currentUser.department);
    });
  }, [formSubmissions, currentUser, isAdmin, isSuperAdmin]);

  const mySubmissions = useMemo(
    () => formSubmissions.filter(s => s.submittedById === currentUser?.id),
    [formSubmissions, currentUser]
  );

  const departmentSubmissions = useMemo(
    () => formSubmissions.filter(s => s.department === currentUser?.department || s.workflow?.some(st => st.department === currentUser?.department)),
    [formSubmissions, currentUser]
  );

  // Reviews that need something from the current user:
  //  - as reviewer: still has to submit an edited copy
  //  - as initiator: every reviewer submitted, changes are waiting for accept / reject
  const reviewsNeedingMe = useMemo(() => templateReviews.filter(r => {
    if (r.status !== 'IN_REVIEW') return false;
    if (r.initiatorId === currentUser?.id) return r.phase === 'AWAITING_DECISION';
    return r.reviewers?.some(v => v.userId === currentUser?.id && v.status === 'PENDING');
  }), [templateReviews, currentUser]);

  const value = {
    theme, setTheme, toggleTheme,
    sidebarCollapsed, setSidebarCollapsed, toggleSidebar,
    toasts, addToast, removeToast,
    currentUser, isAuthenticated, authLoading, isAdmin, isSuperAdmin, login, logout,
    activeTab, setActiveTab,
    users, departments, folders, formTemplates, formSubmissions, departmentMessages, templateReviews,
    refreshAll, refreshSubmissions, refreshTemplates, refreshFolders, refreshReviews,
    saveSignature, isSignatureModalOpen, profileModalInitialTab,
    getPkiCertificate, generatePkiCertificate, verifySubmissionSignatures,
    openSignatureModal: () => {
      setProfileModalTargetUser(null);
      setProfileModalInitialTab('signature');
      setIsSignatureModalOpen(true);
      setIsProfileModalOpen(true);
    },
    closeSignatureModal: () => {
      setIsSignatureModalOpen(false);
      setIsProfileModalOpen(false);
    },
    saveAvatar, isProfileModalOpen, profileModalTargetUser,
    openProfileModal: (u = null, tab = 'photo') => {
      setProfileModalTargetUser(u);
      setProfileModalInitialTab(tab);
      setIsProfileModalOpen(true);
      setIsSignatureModalOpen(true);
    },
    closeProfileModal: () => {
      setIsProfileModalOpen(false);
      setIsSignatureModalOpen(false);
      setProfileModalTargetUser(null);
    },
    documentPreview,
    openDocumentPreview: (p) => setDocumentPreview(p),
    closeDocumentPreview: () => setDocumentPreview(null),
    createUser, updateUser, toggleUserStatus, deleteUser, createDepartment, updateDepartment, deleteDepartment,
    canManageDepartment, createFolder, updateFolder, deleteFolder,
    createTemplate, bulkImportTemplates, refreshTemplates, refreshFolders,
    updateTemplate, updateTemplatePermissions, addTemplateComment, updateTemplateComment,
    moveTemplate, archiveTemplate,
    submitForm, resubmitForm, workflowAction, addSubmissionComment, updateSubmissionComment,
    notifications, unreadNotificationsCount, refreshNotifications, markNotificationRead, markAllNotificationsRead,
    fetchDepartmentMessages, sendDepartmentMessage,
    myApprovalQueue, mySubmissions, departmentSubmissions,
    startReview, submitReview, saveReviewDecisions, finalizeReview, cancelReview, reviewsNeedingMe,
    activityLogs, activityLogsLoading, activityLogsMeta, refreshActivityLogs,
    wipeAllData, wipeFormsOnly,
    accentColor, setAccentColor,
    appVersion: APP_VERSION, forceCacheClearReload
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => useContext(AppContext);
