import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/apiService';
import { buildAppUrl, tabLinkProps, tabOpenProps } from '../utils/router';
import { useDeepLink } from '../utils/useDeepLink';
import { PageHeader, EmptyState, StatusBadge, formatDate, fileToBase64, formatSize, Modal, downloadBlob } from './ui';
import { TemplateUploadModal } from './TemplateUploadModal';
import { BulkImportModal } from './BulkImportModal';
import { SmartWordStudio } from './SmartWordStudio';
import { FillFormModal } from './FillFormModal';
import { SubmissionDetailModal } from './SubmissionDetailModal';
import { TemplatePermissionsModal } from './TemplatePermissionsModal';
import { ApprovalRouteModal } from './ApprovalRouteModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { SendForReviewModal } from './SendForReviewModal';
import { exportWordToPdf } from '../utils/pdfExportEngine';
import {
  Folder, FolderPlus, FolderOpen, FolderInput, FileText,
  ChevronRight, ChevronDown, ArrowLeft, ArrowRight, ArrowUp,
  Upload, Eye, Trash2, Search, PenSquare, Building2,
  ShieldCheck, Lock, LayoutGrid, List, Plus,
  CheckCircle2, HardDrive, Edit2, Edit3, History, Image as ImageIcon, Shield,
  AlertTriangle, Send, Printer, FileEdit, Sparkles, Download, FileDown, Loader2,
  Archive, RotateCcw, Layers, Link2, Check, X, GitMerge, MoreHorizontal, Compass
} from 'lucide-react';

export const FormsHub = () => {
  const {
    departments, folders, formTemplates, archivedTemplates, formSubmissions,
    currentUser, isAdmin, isSuperAdmin, canManageDepartment,
    createFolder, updateFolder, deleteFolder, moveTemplate, updateTemplateSubforms,
    archiveTemplate, restoreTemplate, openDocumentPreview, startReview, addToast,
    refreshTemplates, refreshFolders
  } = useApp();

  // Navigation state
  const [currentDept, setCurrentDept] = useState(null); // null = "All Departments" (Drive root)
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = Department root
  const [showExplorerGuide, setShowExplorerGuide] = useState(false);
  const [explorerGuideTab, setExplorerGuideTab] = useState('fill'); // 'fill' | 'create' | 'manage'

  // Navigation history for Back / Forward
  const [navHistory, setNavHistory] = useState([{ dept: null, folderId: null }]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Tree expansion state
  const [expandedDepts, setExpandedDepts] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});

  // Toolbar & filter state
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('smartdoc_explorer_view') || 'grid');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'templates' | 'submissions'
  const [search, setSearch] = useState('');
  const [inspectedTemplateId, setInspectedTemplateId] = useState(null);
  const [showInspector, setShowInspector] = useState(true);

  const inspectedTemplate = useMemo(
    () => formTemplates.find(t => t.id === inspectedTemplateId) || null,
    [formTemplates, inspectedTemplateId]
  );

  // Modals state
  const [showUpload, setShowUpload] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showWordStudio, setShowWordStudio] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState(null);
  const [rightsTemplate, setRightsTemplate] = useState(null);
  const [routeModalTemplate, setRouteModalTemplate] = useState(null);
  const [versionHistoryTarget, setVersionHistoryTarget] = useState(null);
  const [fillTemplate, setFillTemplate] = useState(null);
  const [printDirect, setPrintDirect] = useState(false);
  const [downloadDirect, setDownloadDirect] = useState(false);
  const [viewOnlyFill, setViewOnlyFill] = useState(false);
  const [detailSubmissionId, setDetailSubmissionId] = useState(null);
  const [folderModal, setFolderModal] = useState(null); // { mode: 'create'|'rename', dept, parentId, folderId, name }
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [moveTemplateTarget, setMoveTemplateTarget] = useState(null);
  const [confirmRemoveTemplate, setConfirmRemoveTemplate] = useState(null);
  const [sendForReviewTarget, setSendForReviewTarget] = useState(null);
  const [downloadTarget, setDownloadTarget] = useState(null);
  const [downloadingFormat, setDownloadingFormat] = useState(null);
  const [downloadPdfProgress, setDownloadPdfProgress] = useState('');
  const [subformsModalTarget, setSubformsModalTarget] = useState(null);
  const [subformsSelection, setSubformsSelection] = useState([]);
  const [subformsSearch, setSubformsSearch] = useState('');
  const [savingSubforms, setSavingSubforms] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (ev) => {
      if (ev.target?.closest?.('.sd-tpl-dropdown-menu, .sd-tpl-more-btn')) return;
      setOpenMenu(null);
    };
    const handleKey = (ev) => {
      if (ev.key === 'Escape') setOpenMenu(null);
    };
    const handleDismiss = () => setOpenMenu(null);
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [openMenu]);

  const handleToggleTemplateMenu = (e, tpl) => {
    e.stopPropagation();
    if (openMenu?.template?.id === tpl.id) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 210;
    const estHeight = 310;
    const openUp = window.innerHeight - rect.bottom < estHeight && rect.top > estHeight;
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
    setOpenMenu({
      template: tpl,
      left,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined
    });
  };

  const parentMainFormBySubformId = useMemo(() => {
    const map = new Map();
    (formTemplates || []).forEach(main => {
      if (main.status === 'ARCHIVED') return;
      (main.subforms || []).forEach(sf => {
        const sfId = typeof sf === 'string' ? sf : sf?.id;
        if (sfId && sfId !== main.id && !map.has(sfId)) {
          map.set(sfId, main);
        }
      });
    });
    return map;
  }, [formTemplates]);

  const openSubformsManager = (t) => {
    const initial = (t.subforms || []).map(sf => (typeof sf === 'string' ? sf : sf?.id)).filter(Boolean);
    setSubformsSelection(initial);
    setSubformsSearch('');
    setSubformsModalTarget(t);
  };

  const handleSaveSubformsModal = async () => {
    if (!subformsModalTarget || savingSubforms) return;
    setSavingSubforms(true);
    try {
      const res = await updateTemplateSubforms(subformsModalTarget.id, subformsSelection);
      if (res) {
        setSubformsModalTarget(null);
      }
    } finally {
      setSavingSubforms(false);
    }
  };

  const handleDirectDownload = async (t) => {
    try {
      addToast('Downloading File', `Retrieving ${t.fileName || t.title}…`, 'info');
      const blob = await apiService.getTemplateFile(t.id);
      const ext = t.fileType === 'pdf' ? '.pdf' : (t.fileName?.match(/\.[^.]+$/)?.[0] || '.png');
      const name = t.fileName || `${t.title || 'document'}${ext}`;
      downloadBlob(blob, name);
      addToast('Download Complete', `Downloaded ${name}`, 'success');
    } catch (err) {
      addToast('Download Failed', err.message || 'Could not download document file.', 'error');
    }
  };

  const handleDownloadWordFromModal = async (t) => {
    setDownloadingFormat('docx');
    try {
      addToast('Downloading Word File', `Retrieving ${t.title} (.docx)…`, 'info');
      const blob = await apiService.getTemplateFile(t.id, { download: true });
      const name = t.fileName || `${t.title || 'template'}.docx`;
      downloadBlob(blob, name);
      addToast('Download Complete', `Downloaded ${name}`, 'success');
      setDownloadTarget(null);
    } catch (err) {
      addToast('Download Failed', err.message || 'Could not download Word document.', 'error');
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleDownloadPdfFromModal = async (t) => {
    const isEditableDocx = t?.isEditable !== false && (!t?.fileType || t.fileType === 'docx' || t.fileType === 'doc');
    if (isEditableDocx) {
      setDownloadTarget(null);
      setViewOnlyFill(true);
      setPrintDirect(false);
      setDownloadDirect(true);
      setFillTemplate(t);
      return;
    }
    setDownloadingFormat('pdf');
    setDownloadPdfProgress('Preparing document…');
    try {
      addToast('Converting Document', `Generating authentic PDF for ${t.title}…`, 'info');
      const blob = await apiService.getTemplateFile(t.id);
      const pdfName = (t.fileName || t.title || 'document').replace(/\.(docx?|pdf|png|jpe?g)$/i, '') + '.pdf';
      await exportWordToPdf(blob, pdfName, (prog) => {
        setDownloadPdfProgress(prog?.status || 'Converting to PDF…');
      });
      addToast('PDF Saved', `Successfully generated ${pdfName}`, 'success');
      setDownloadTarget(null);
    } catch (err) {
      addToast('PDF Export Failed', err.message || 'Could not generate PDF. Please try again.', 'error');
    } finally {
      setDownloadingFormat(null);
      setDownloadPdfProgress('');
    }
  };

  const handlePrintTemplate = (t) => {
    setViewOnlyFill(true);
    setPrintDirect(true);
    setDownloadDirect(false);
    setFillTemplate(t);
  };

  const handleSendTemplateForReview = async ({ reviewerIds, message }) => {
    if (!sendForReviewTarget) return false;
    let html = sendForReviewTarget.htmlContent;
    if (!html) {
      try {
        const blob = await apiService.getTemplateFile(sendForReviewTarget.id);
        const b64 = await fileToBase64(blob);
        const parsed = await apiService.parseDocx(b64);
        html = parsed.html || `<p>${sendForReviewTarget.title}</p>`;
      } catch {
        html = `<p>${sendForReviewTarget.title}</p>`;
      }
    }
    const r = await startReview({
      templateId: sendForReviewTarget.id,
      title: sendForReviewTarget.title,
      description: sendForReviewTarget.description,
      department: sendForReviewTarget.department,
      folderId: sendForReviewTarget.folderId || null,
      audience: sendForReviewTarget.audience,
      defaultExpiryDays: sendForReviewTarget.defaultExpiryDays || 14,
      workflow: sendForReviewTarget.workflow,
      fields: sendForReviewTarget.fields || [],
      subforms: sendForReviewTarget.subforms || [],
      htmlContent: html,
      reviewerIds,
      message
    });
    if (r) {
      setSendForReviewTarget(null);
      return true;
    }
    return false;
  };

  const handleStartFill = (t) => {
    const hasWf = Array.isArray(t?.workflow) && t.workflow.length > 0;
    if (!hasWf) {
      addToast('Cannot Fill Form', 'This document cannot be filled because no approval workflow has been configured. An authorized admin must configure the approval chain first.', 'warn');
      return;
    }
    setViewOnlyFill(false);
    setPrintDirect(false);
    setDownloadDirect(false);
    setFillTemplate(t);
  };

  // ---------- Open-in-new-tab links & deep links ----------
  // Each action has a shareable URL (e.g. /forms?action=fill&id=…). Action elements are
  // rendered as <a href> so Ctrl/Cmd/Shift/Middle-click or right-click "Open in new tab" work.
  const tplUrl = (action, t) => buildAppUrl('forms', { action, id: t.id });
  const locUrl = (dept, folderId) => buildAppUrl('forms', { dept, folder: folderId });
  const newStudioUrl = () => buildAppUrl('forms', { action: 'new', dept: currentDept, folder: currentFolderId });

  const openEditor = (t) => {
    setTemplateToEdit(t);
    setShowWordStudio(true);
  };

  const openNewStudio = () => {
    setTemplateToEdit(null);
    setShowWordStudio(true);
  };

  const openPreview = (t) => {
    openDocumentPreview({ kind: 'template', id: t.id, title: t.title, fileName: t.fileName, fileType: t.fileType });
  };

  // Deep links (/forms?action=fill|edit|view|history|print|new&id=…, /forms?dept=…&folder=…)
  // are applied once the data they need has loaded; return false to keep waiting.
  useDeepLink(({ action, id, dept, folder }, { timedOut }) => {
    if (!action && !dept && !folder) return true;
    const templatesReady = formTemplates.length > 0 || timedOut;
    const foldersReady = folders.length > 0 || timedOut;

    // 1. New Word Form Studio document (optionally inside a department/folder)
    if (action === 'new') {
      if (folder && !foldersReady) return false;
      const f = folder ? folders.find(x => String(x.id) === String(folder)) : null;
      if (f) navigateTo(f.department, f.id);
      else if (dept) navigateTo(dept, null);
      if (isAdmin) openNewStudio();
      else addToast('Access Denied', 'Only administrators can open Word Form Studio.', 'warn');
      return true;
    }

    // 2. Template actions: fill | edit | view | history | print
    if (action && id) {
      const t = formTemplates.find(x => String(x.id) === String(id));
      if (!t) {
        if (!templatesReady) return false;
        addToast('Form Not Found', 'The requested form does not exist, was archived, or you do not have access to it.', 'warn');
        return true;
      }
      // Reveal the template's location in the explorer behind the opened modal
      if (t.department) navigateTo(t.department, t.folderId || null);

      const isNonEditable = t.isEditable === false;
      const canManageTpl = isSuperAdmin || (t.department && canManageDepartment(t.department));
      switch (action) {
        case 'fill':
          if (isNonEditable) openPreview(t);
          else if (t.isDraft && !canManageTpl) addToast('Unpublished Draft', 'This form has not been published yet.', 'warn');
          else handleStartFill(t);
          break;
        case 'print':
          if (isNonEditable) openPreview(t);
          else handlePrintTemplate(t);
          break;
        case 'edit':
          if (!canManageTpl) addToast('Access Denied', 'You do not have rights to edit this template.', 'warn');
          else if (isNonEditable) openPreview(t);
          else openEditor(t);
          break;
        case 'history':
          setVersionHistoryTarget(t);
          break;
        case 'view':
        default:
          openPreview(t);
          break;
      }
      return true;
    }

    // 3. Explorer location: department and/or folder
    if (folder) {
      const f = folders.find(x => String(x.id) === String(folder));
      if (!f) {
        if (!foldersReady) return false;
        addToast('Folder Not Found', 'The requested folder does not exist or you do not have access to it.', 'warn');
        if (dept) navigateTo(dept, null);
        return true;
      }
      navigateTo(f.department, f.id);
    } else if (dept) {
      navigateTo(dept, null);
    }
    return true;
  }, [formTemplates, folders]);

  // Active context rights check
  const canManageCurrent = currentDept ? canManageDepartment(currentDept) : false;

  const currentFolderObj = useMemo(() => {
    if (!currentFolderId) return null;
    return folders.find(f => f.id === currentFolderId) || null;
  }, [folders, currentFolderId]);

  // Save view mode preference
  const toggleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('smartdoc_explorer_view', mode);
  };

  // Open New Folder modal with sensible defaults
  const handleOpenNewFolder = (dept = null, parentId = null) => {
    const targetDept = dept || currentDept || (isSuperAdmin ? (departments[0]?.name || 'IT & Systems') : currentUser?.department);
    setFolderModal({
      mode: 'create',
      dept: targetDept,
      parentId: parentId !== null ? parentId : (currentFolderId || null),
      name: ''
    });
  };

  // Navigate to location with history tracking
  const navigateTo = (dept, folderId = null, keepFilter = false) => {
    if (!keepFilter && filterType === 'archived') {
      setFilterType('all');
    }
    if (dept === currentDept && folderId === currentFolderId) return;
    const nextLoc = { dept, folderId };
    const nextHist = navHistory.slice(0, historyIdx + 1);
    nextHist.push(nextLoc);
    setNavHistory(nextHist);
    setHistoryIdx(nextHist.length - 1);
    setCurrentDept(dept);
    setCurrentFolderId(folderId);

    // Auto-expand tree
    if (dept) {
      setExpandedDepts(prev => ({ ...prev, [dept]: true }));
      if (folderId) {
        let f = folders.find(x => x.id === folderId);
        const toExpand = {};
        while (f) {
          toExpand[f.id] = true;
          f = f.parentId ? folders.find(x => x.id === f.parentId) : null;
        }
        setExpandedFolders(prev => ({ ...prev, ...toExpand }));
      }
    }
  };

  const goBack = () => {
    if (historyIdx > 0) {
      const prev = navHistory[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setCurrentDept(prev.dept);
      setCurrentFolderId(prev.folderId);
    }
  };

  const goForward = () => {
    if (historyIdx < navHistory.length - 1) {
      const next = navHistory[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setCurrentDept(next.dept);
      setCurrentFolderId(next.folderId);
    }
  };

  const goUp = () => {
    if (!currentDept) return;
    if (currentFolderId) {
      const curr = folders.find(f => f.id === currentFolderId);
      if (curr && curr.parentId) {
        navigateTo(currentDept, curr.parentId);
      } else {
        navigateTo(currentDept, null);
      }
    } else {
      navigateTo(null, null);
    }
  };

  // Expand / collapse helpers
  const toggleDept = (deptName, e) => {
    e?.stopPropagation();
    setExpandedDepts(prev => ({ ...prev, [deptName]: !prev[deptName] }));
  };

  const toggleFolder = (folderId, e) => {
    e?.stopPropagation();
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // Breadcrumbs calculation
  const breadcrumbs = useMemo(() => {
    const list = [{ label: 'SmartDoc Drive', dept: null, folderId: null }];
    if (!currentDept) return list;

    list.push({ label: currentDept, dept: currentDept, folderId: null });
    if (!currentFolderId) return list;

    const chain = [];
    let curr = folders.find(f => f.id === currentFolderId);
    while (curr) {
      chain.unshift({ label: curr.name, dept: currentDept, folderId: curr.id });
      curr = curr.parentId ? folders.find(f => f.id === curr.parentId) : null;
    }
    return list.concat(chain);
  }, [currentDept, currentFolderId, folders]);

  // Items in current view
  const currentFolders = useMemo(() => {
    if (!currentDept) return [];
    return folders.filter(f => f.department === currentDept && (f.parentId || null) === (currentFolderId || null));
  }, [folders, currentDept, currentFolderId]);

  const currentTemplates = useMemo(() => {
    if (!currentDept) return formTemplates;
    return formTemplates.filter(t => t.department === currentDept && (t.folderId || null) === (currentFolderId || null));
  }, [formTemplates, currentDept, currentFolderId]);

  const currentArchivedTemplates = useMemo(() => {
    const list = archivedTemplates || [];
    if (!currentDept) return list;
    return list.filter(t => t.department === currentDept && (!currentFolderId || (t.folderId || null) === (currentFolderId || null)));
  }, [archivedTemplates, currentDept, currentFolderId]);

  // Filter & search applied
  const q = search.trim().toLowerCase();

  const filteredDepartments = useMemo(() => {
    if (!q) return departments;
    return departments.filter(d =>
      [d.name, d.code, d.description].some(v => String(v || '').toLowerCase().includes(q))
    );
  }, [departments, q]);

  const filteredFolders = useMemo(() => {
    if (filterType === 'templates' || filterType === 'archived') return [];
    if (!q) return currentFolders;
    return currentFolders.filter(f => f.name.toLowerCase().includes(q));
  }, [currentFolders, filterType, q]);

  const filteredTemplates = useMemo(() => {
    if (filterType === 'folders' || filterType === 'archived') return [];
    if (!q) return currentTemplates;
    return currentTemplates.filter(t =>
      [t.title, t.code, t.description, t.department].some(v => String(v || '').toLowerCase().includes(q))
    );
  }, [currentTemplates, filterType, q]);

  const filteredArchivedTemplates = useMemo(() => {
    if (!q) return currentArchivedTemplates;
    return currentArchivedTemplates.filter(t =>
      [t.title, t.code, t.description, t.department].some(v => String(v || '').toLowerCase().includes(q))
    );
  }, [currentArchivedTemplates, q]);

  const totalItemsCount = filterType === 'archived'
    ? filteredArchivedTemplates.length
    : (currentDept === null)
      ? (filterType === 'templates' ? filteredTemplates.length : filteredDepartments.length)
      : (filteredFolders.length + filteredTemplates.length);

  // Descendant folders (recursive)
  const getDescendantFolderIds = useMemo(() => {
    return (folderId) => {
      const ids = new Set([folderId]);
      let added = true;
      while (added) {
        added = false;
        for (const f of folders) {
          if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
            ids.add(f.id);
            added = true;
          }
        }
      }
      return ids;
    };
  }, [folders]);

  // Total storage size of a folder (recursive: direct templates + all nested subfolders)
  const getFolderStorageSize = useMemo(() => {
    return (folderId) => {
      const folderIds = getDescendantFolderIds(folderId);
      return formTemplates
        .filter(t => t.folderId && folderIds.has(t.folderId))
        .reduce((sum, t) => sum + (Number(t.fileSize) || 0), 0);
    };
  }, [formTemplates, getDescendantFolderIds]);

  // Total storage size of a department
  const getDepartmentStorageSize = useMemo(() => {
    return (deptName) => {
      return formTemplates
        .filter(t => t.department === deptName)
        .reduce((sum, t) => sum + (Number(t.fileSize) || 0), 0);
    };
  }, [formTemplates]);

  // Current view total storage size
  const currentTotalStorageSize = useMemo(() => {
    if (currentDept === null) {
      if (filterType === 'templates') {
        return filteredTemplates.reduce((sum, t) => sum + (Number(t.fileSize) || 0), 0);
      }
      return filteredDepartments.reduce((sum, d) => sum + getDepartmentStorageSize(d.name), 0);
    }
    const foldersSize = filteredFolders.reduce((sum, f) => sum + getFolderStorageSize(f.id), 0);
    const templatesSize = filteredTemplates.reduce((sum, t) => sum + (Number(t.fileSize) || 0), 0);
    return foldersSize + templatesSize;
  }, [currentDept, filterType, filteredTemplates, filteredDepartments, filteredFolders, getDepartmentStorageSize, getFolderStorageSize]);

  // Folder modal submission
  const handleFolderModalSubmit = async (e) => {
    e.preventDefault();
    if (!folderModal) return;
    const name = folderModal.name?.trim();
    if (!name) return;

    if (folderModal.mode === 'create') {
      const res = await createFolder({
        name,
        department: folderModal.dept,
        parentId: folderModal.parentId || null
      });
      if (res) {
        if (folderModal.parentId) {
          setExpandedFolders(prev => ({ ...prev, [folderModal.parentId]: true }));
        }
        setFolderModal(null);
      }
    } else if (folderModal.mode === 'rename') {
      const res = await updateFolder(folderModal.folderId, { name });
      if (res) setFolderModal(null);
    }
  };

  // Move template submission with duplicate file prevention
  const handleMoveTemplateSubmit = async (targetFolderId) => {
    if (!moveTemplateTarget) return;
    const destFolderStr = String(targetFolderId || '');
    const cleanT = (moveTemplateTarget.title || '').trim().toLowerCase();
    const cleanFn = (moveTemplateTarget.fileName || '').trim().toLowerCase();

    const conflict = formTemplates.find(t => {
      if (t.id === moveTemplateTarget.id) return false;
      if (t.department !== moveTemplateTarget.department) return false;
      if (t.status === 'ARCHIVED') return false;
      const tFolderStr = String(t.folderId || '');
      if (tFolderStr !== destFolderStr) return false;
      const matchTitle = cleanT && t.title?.trim().toLowerCase() === cleanT;
      const matchFn = cleanFn && t.fileName?.trim().toLowerCase() === cleanFn;
      return matchTitle || matchFn;
    });

    if (conflict) {
      addToast(
        'Cannot Move: Duplicate Document',
        `A document named "${conflict.title || conflict.fileName}" already exists in the destination folder. Duplicate files are not allowed in the same folder.`,
        'warning'
      );
      return;
    }

    const res = await moveTemplate(moveTemplateTarget.id, targetFolderId || null);
    if (res) setMoveTemplateTarget(null);
  };

  // Tree recursive folder rendering
  const renderTreeFolder = (folder, depth = 1) => {
    const isSelected = currentDept === folder.department && currentFolderId === folder.id;
    const isExpanded = !!expandedFolders[folder.id];
    const subFolders = folders.filter(f => f.parentId === folder.id);
    const hasChildren = subFolders.length > 0;
    const folderItemCount = formTemplates.filter(t => t.folderId === folder.id).length;
    const canManageDept = canManageDepartment(folder.department);

    return (
      <div key={folder.id} className="sd-tree-node">
        <div
          className={`sd-tree-item ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 18}px` }}
          {...tabOpenProps(locUrl(folder.department, folder.id), () => navigateTo(folder.department, folder.id))}
        >
          <button
            type="button"
            className={`sd-tree-caret ${hasChildren ? '' : 'invisible'}`}
            onClick={(e) => toggleFolder(folder.id, e)}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span className="sd-tree-icon">
            {isSelected ? <FolderOpen size={15} className="sd-text-accent" /> : <Folder size={15} />}
          </span>
          <span className="sd-tree-label" title={folder.name}>{folder.name}</span>
          {folderItemCount > 0 && (
            <span
              className="sd-tree-badge"
              title={`${folderItemCount} item${folderItemCount === 1 ? '' : 's'} (${formatSize(getFolderStorageSize(folder.id))})`}
            >
              {folderItemCount}
            </span>
          )}

          {canManageDept && (
            <div className="sd-tree-actions" onClick={e => e.stopPropagation()}>
              <button
                className="sd-tree-btn"
                title="New Subfolder"
                onClick={() => handleOpenNewFolder(folder.department, folder.id)}
              >
                <Plus size={12} />
              </button>
              <button
                className="sd-tree-btn"
                title="Rename folder"
                onClick={() => setFolderModal({ mode: 'rename', dept: folder.department, folderId: folder.id, name: folder.name })}
              >
                <Edit2 size={12} />
              </button>
              <button
                className="sd-tree-btn sd-danger-hover"
                title="Delete folder"
                onClick={() => setDeleteFolderTarget(folder)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="sd-tree-children">
            {subFolders.map(child => renderTreeFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderTemplateCard = (t) => {
    const isNonEditable = t.isEditable === false;
    const isImage = t.fileType === 'image';
    const isPdf = t.fileType === 'pdf';
    const isArchived = t.status === 'ARCHIVED';
    const canManageTpl = isSuperAdmin || (t.department && canManageDepartment(t.department));
    const taggedSubformsList = (t.subforms || [])
      .map(sf => (typeof sf === 'string' ? (formTemplates || []).find(x => x.id === sf) : sf))
      .filter(Boolean);
    const parentMain = parentMainFormBySubformId.get(t.id) || null;
    const stepCount = (t.workflow || []).length;
    const fieldCount = (t.fields || []).length;
    const isMenuOpen = openMenu?.template?.id === t.id;

    return (
      <article
        key={t.id}
        className={`sd-card sd-template-card ${inspectedTemplateId === t.id ? 'is-inspected' : ''} ${isMenuOpen ? 'has-open-menu' : ''}`}
        onClick={(e) => {
          if (!e.target.closest('a, button')) {
            setInspectedTemplateId(t.id);
            setShowInspector(true);
          }
        }}
      >
        <div className="sd-template-head">
          <div className={`sd-template-icon ${isNonEditable ? (isPdf ? 'sd-icon-pdf' : 'sd-icon-img') : 'sd-icon-word'}`}>
            {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
          </div>

          <div className="sd-template-titles">
            <h3 className="sd-card-title" title={t.title}>{t.title}</h3>
            <div className="sd-tpl-subline">
              {!isNonEditable ? (
                <span>v{t.version || 1}</span>
              ) : (
                <span>{(t.fileType || 'DOC').toUpperCase()}</span>
              )}
              {currentDept === null && t.department && (
                <>
                  <span>·</span>
                  <span>{t.department}</span>
                </>
              )}
              {isArchived && (
                <span className="sd-tpl-status-pill is-warn">Archived</span>
              )}
              {!isArchived && t.isDraft && (
                <span className="sd-tpl-status-pill is-warn">Draft</span>
              )}
              {!isArchived && !isNonEditable && !t.isDraft && stepCount === 0 && (
                <span className="sd-tpl-status-pill is-warn">No Route</span>
              )}
              {taggedSubformsList.length > 0 && (
                <span className="sd-tpl-status-pill is-accent">
                  {taggedSubformsList.length} subform{taggedSubformsList.length === 1 ? '' : 's'}
                </span>
              )}
              {parentMain && (
                <span className="sd-tpl-status-pill" title={`Subform of ${parentMain.title}`}>
                  Subform
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className={`sd-tpl-more-btn ${isMenuOpen ? 'is-active' : ''}`}
            title="More actions"
            aria-label="More template actions"
            onClick={(e) => handleToggleTemplateMenu(e, t)}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        {t.description && (
          <p className="sd-card-text sd-tpl-desc-clamp">{t.description}</p>
        )}

        <div className="sd-tpl-clean-footer">
          <span className="sd-tpl-clean-meta">
            {!isNonEditable
              ? `${fieldCount} field${fieldCount === 1 ? '' : 's'} · ${stepCount} step${stepCount === 1 ? '' : 's'}`
              : `${(t.fileType || 'DOC').toUpperCase()} · ${formatSize(t.fileSize)}`}
          </span>

          <div className="sd-tpl-clean-cta">
            {isArchived ? (
              <>
                <a
                  className="btn btn-secondary btn-xs"
                  {...tabLinkProps(tplUrl('view', t), () => openPreview(t))}
                >
                  Preview
                </a>
                {canManageTpl && (
                  <button
                    id={`btn-tpl-restore-${t.id}`}
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={() => restoreTemplate(t.id)}
                  >
                    Restore
                  </button>
                )}
              </>
            ) : isNonEditable ? (
              <a
                className="btn btn-primary btn-xs"
                {...tabLinkProps(tplUrl('view', t), () => openPreview(t))}
              >
                View
              </a>
            ) : (
              <>
                {canManageTpl && (
                  <a
                    id={`btn-tpl-edit-${t.id}`}
                    className="sd-icon-btn sd-icon-btn-xs"
                    title="Open in Word Form Studio"
                    aria-label="Edit template in Word Form Studio"
                    {...tabLinkProps(tplUrl('edit', t), () => openEditor(t))}
                  >
                    <Edit3 size={13} />
                  </a>
                )}

                {t.isDraft ? (
                  canManageTpl ? (
                    <a
                      className="btn btn-primary btn-xs"
                      {...tabLinkProps(tplUrl('edit', t), () => openEditor(t))}
                    >
                      Publish
                    </a>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-xs" disabled>
                      Draft
                    </button>
                  )
                ) : stepCount > 0 ? (
                  <a
                    id={`btn-tpl-fill-${t.id}`}
                    className="btn btn-primary btn-xs"
                    {...tabLinkProps(tplUrl('fill', t), () => handleStartFill(t))}
                  >
                    Fill Form
                  </a>
                ) : canManageTpl ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={() => setRouteModalTemplate(t)}
                  >
                    Set Route
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-xs" disabled>
                    No Route
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </article>
    );
  };

  const renderTemplateRow = (t) => {
    const isNonEditable = t.isEditable === false;
    const isPdf = t.fileType === 'pdf';
    const isImage = t.fileType === 'image';
    const isArchived = t.status === 'ARCHIVED';
    const canManageTpl = isSuperAdmin || (t.department && canManageDepartment(t.department));
    const stepCount = (t.workflow || []).length;
    const fieldCount = (t.fields || []).length;
    const isMenuOpen = openMenu?.template?.id === t.id;

    return (
      <tr
        key={t.id}
        className={`sd-tr-template ${inspectedTemplateId === t.id ? 'is-inspected' : ''}`}
        onClick={(e) => {
          if (!e.target.closest('a, button')) {
            setInspectedTemplateId(t.id);
            setShowInspector(true);
          }
        }}
      >
        <td>
          <div className="sd-table-name-cell">
            {isPdf ? (
              <FileText size={17} className="sd-icon-doc sd-text-danger" />
            ) : isImage ? (
              <ImageIcon size={17} className="sd-icon-doc sd-text-info" />
            ) : (
              <FileText size={17} className="sd-icon-doc" />
            )}
            <span className="sd-font-medium">{t.title}</span>
            {isArchived && <span className="sd-tpl-status-pill is-warn">Archived</span>}
            {!isArchived && t.isDraft && <span className="sd-tpl-status-pill is-warn">Draft</span>}
          </div>
        </td>
        <td>
          <span className="sd-muted">
            {!isNonEditable
              ? `v${t.version || 1} · ${fieldCount} field${fieldCount === 1 ? '' : 's'} · ${stepCount} step${stepCount === 1 ? '' : 's'}`
              : `${(t.fileType || 'DOC').toUpperCase()} · Read-only`}
          </span>
        </td>
        <td>
          <span className="sd-muted">{formatDate(t.createdAt)} · <span className="sd-mono">{formatSize(t.fileSize)}</span></span>
        </td>
        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
          <div className="sd-btn-row sd-justify-end" style={{ gap: '6px' }}>
            {isArchived ? (
              canManageTpl && (
                <button
                  id={`btn-tbl-tpl-restore-${t.id}`}
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => restoreTemplate(t.id)}
                >
                  Restore
                </button>
              )
            ) : isNonEditable ? (
              <a
                className="btn btn-primary btn-xs"
                {...tabLinkProps(tplUrl('view', t), () => openPreview(t))}
              >
                View
              </a>
            ) : (
              <>
                {canManageTpl && (
                  <a
                    className="sd-icon-btn sd-icon-btn-xs"
                    title="Open in Word Form Studio"
                    {...tabLinkProps(tplUrl('edit', t), () => openEditor(t))}
                  >
                    <Edit3 size={13} />
                  </a>
                )}
                {t.isDraft ? (
                  canManageTpl ? (
                    <a
                      className="btn btn-primary btn-xs"
                      {...tabLinkProps(tplUrl('edit', t), () => openEditor(t))}
                    >
                      Publish
                    </a>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-xs" disabled>
                      Draft
                    </button>
                  )
                ) : stepCount > 0 ? (
                  <a
                    className="btn btn-primary btn-xs"
                    {...tabLinkProps(tplUrl('fill', t), () => handleStartFill(t))}
                  >
                    Fill Form
                  </a>
                ) : canManageTpl ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={() => setRouteModalTemplate(t)}
                  >
                    Set Route
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-xs" disabled>
                    No Route
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              className={`sd-tpl-more-btn ${isMenuOpen ? 'is-active' : ''}`}
              title="More actions"
              aria-label="More template actions"
              onClick={(e) => handleToggleTemplateMenu(e, t)}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="sd-page animate-fade-in sd-explorer-page">
      <PageHeader
        title="Forms &amp; Documents Explorer"
        subtitle="Browse department drives, form templates, and approval workflows."
        actions={
          <div className="sd-btn-row">
            <button
              id="btn-explorer-guide"
              type="button"
              className={`btn ${showExplorerGuide ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowExplorerGuide(v => !v)}
              title="Show step-by-step guide on how to use Forms & Documents"
            >
              <Compass size={15} /> Guide Me
            </button>
            {isAdmin && (
              <>
                <button
                  id="btn-explorer-upload-doc"
                  className="btn btn-secondary"
                  onClick={() => setShowUpload(true)}
                  title="Upload Word template, PDF, or image document"
                >
                  <Upload size={15} /> Upload
                </button>
                <button
                  id="btn-explorer-bulk-import"
                  className="btn btn-secondary"
                  onClick={() => setShowBulkImport(true)}
                  title="Bulk import multiple Word templates, PDFs, or image files at once"
                >
                  <FolderInput size={15} /> Bulk Import
                </button>
                <button
                  id="btn-explorer-new-folder"
                  className="btn btn-secondary"
                  onClick={() => handleOpenNewFolder()}
                  title="Create a new folder"
                >
                  <FolderPlus size={15} /> New Folder
                </button>
                <a
                  id="btn-explorer-word-studio"
                  className="btn btn-primary"
                  {...tabLinkProps(newStudioUrl(), openNewStudio)}
                  title="Open Word Form Studio to design or customize Word form templates"
                >
                  <FileText size={15} /> Word Studio
                </a>
              </>
            )}
          </div>
        }
      />

      {/* Interactive Goal-Driven Explorer Guided Concierge */}
      {showExplorerGuide && (
        <div className="sd-guided-copilot-card sd-explorer-concierge animate-fade-in">
          <div className="sd-copilot-top">
            <div className="sd-copilot-brand">
              <span className="sd-copilot-icon-orb">
                <Sparkles size={14} />
              </span>
              <span className="sd-copilot-title">Interactive Forms &amp; Documents Guide</span>
              <span className="sd-muted sd-xs">Choose what you want to do below:</span>
            </div>

            <div className="sd-pill-toggle sd-pill-toggle-sm" role="tablist">
              <button
                type="button"
                className={`sd-pill-btn ${explorerGuideTab === 'fill' ? 'active' : ''}`}
                onClick={() => setExplorerGuideTab('fill')}
              >
                <PenSquare size={12} />
                <span>1. Fill &amp; Submit a Form</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={`sd-pill-btn ${explorerGuideTab === 'create' ? 'active' : ''}`}
                  onClick={() => setExplorerGuideTab('create')}
                >
                  <FileEdit size={12} />
                  <span>2. Create / Upload Template</span>
                </button>
              )}
              <button
                type="button"
                className={`sd-pill-btn ${explorerGuideTab === 'manage' ? 'active' : ''}`}
                onClick={() => setExplorerGuideTab('manage')}
              >
                <GitMerge size={12} />
                <span>{isAdmin ? '3.' : '2.'} Browse &amp; Inspect Routes</span>
              </button>
            </div>

            <button
              type="button"
              className="sd-icon-btn sd-form-guide-close"
              onClick={() => setShowExplorerGuide(false)}
              title="Close guide"
            >
              <X size={14} />
            </button>
          </div>

          {explorerGuideTab === 'fill' && (
            <div className="sd-concierge-body">
              <div className="sd-concierge-intro">
                <strong>How to fill &amp; submit a form:</strong> Pick any ready template below (or click <em>Fill</em> on a card in the Explorer). The <strong>Guided Form Copilot</strong> will walk you through every required field, attach your PKI signature, and route it to department approvers.
              </div>
              <div className="sd-concierge-chips">
                {formTemplates
                  .filter(t => !t.isDraft && t.fileType !== 'pdf' && t.fileType !== 'image' && (t.workflow?.length > 0))
                  .slice(0, 5)
                  .map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="sd-concierge-tpl-btn"
                      onClick={() => {
                        try { localStorage.setItem('smartdoc_show_form_guide', 'true'); } catch {}
                        handleStartFill(t);
                      }}
                    >
                      <FileText size={14} className="sd-text-accent" />
                      <div className="sd-concierge-tpl-text">
                        <span className="sd-concierge-tpl-title">{t.title}</span>
                        <span className="sd-concierge-tpl-sub">
                          {t.department} · {(t.fields || []).length} fields · {(t.workflow || []).length} steps
                        </span>
                      </div>
                      <span className="sd-concierge-tpl-cta">
                        Guided Fill <ArrowRight size={11} />
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {explorerGuideTab === 'create' && isAdmin && (
            <div className="sd-concierge-body">
              <div className="sd-concierge-grid-3">
                <div className="sd-concierge-action-card" onClick={openNewStudio}>
                  <div className="sd-concierge-action-icon"><FileEdit size={17} /></div>
                  <div>
                    <div className="sd-concierge-action-title">Design in Word Studio</div>
                    <div className="sd-concierge-action-sub">Create a rich template from scratch with interactive <code>{'{{Field}}'}</code> placeholders and signature slots.</div>
                  </div>
                  <ArrowRight size={14} className="sd-text-accent" />
                </div>

                <div className="sd-concierge-action-card" onClick={() => setShowUpload(true)}>
                  <div className="sd-concierge-action-icon"><Upload size={17} /></div>
                  <div>
                    <div className="sd-concierge-action-title">Upload Word / PDF / Image</div>
                    <div className="sd-concierge-action-sub">Import an existing <code>.docx</code> file (auto-extracts fields) or store a reference PDF/image.</div>
                  </div>
                  <ArrowRight size={14} className="sd-text-accent" />
                </div>

                <div className="sd-concierge-action-card" onClick={() => setShowBulkImport(true)}>
                  <div className="sd-concierge-action-icon"><FolderInput size={17} /></div>
                  <div>
                    <div className="sd-concierge-action-title">Bulk Import Package</div>
                    <div className="sd-concierge-action-sub">Upload multiple department templates at once and assign a shared approval route.</div>
                  </div>
                  <ArrowRight size={14} className="sd-text-accent" />
                </div>
              </div>
            </div>
          )}

          {explorerGuideTab === 'manage' && (
            <div className="sd-concierge-body">
              <div className="sd-concierge-grid-3">
                <div
                  className="sd-concierge-action-card"
                  onClick={() => navigateTo(currentUser?.department || departments[0]?.name || null, null)}
                >
                  <div className="sd-concierge-action-icon"><Building2 size={17} /></div>
                  <div>
                    <div className="sd-concierge-action-title">Open My Department Drive</div>
                    <div className="sd-concierge-action-sub">Jump directly to <strong>{currentUser?.department || 'your department'}</strong> folders and templates.</div>
                  </div>
                  <ArrowRight size={14} className="sd-text-accent" />
                </div>

                <div
                  className="sd-concierge-action-card"
                  onClick={() => setFilterType('templates')}
                >
                  <div className="sd-concierge-action-icon"><FileText size={17} /></div>
                  <div>
                    <div className="sd-concierge-action-title">Show All Templates Only</div>
                    <div className="sd-concierge-action-sub">Flatten the folder hierarchy to view and search every template in one place.</div>
                  </div>
                  <ArrowRight size={14} className="sd-text-accent" />
                </div>

                <div
                  className="sd-concierge-action-card"
                  onClick={() => {
                    setShowInspector(true);
                    if (!selectedItem && formTemplates.length > 0) {
                      setSelectedItem({ type: 'template', data: formTemplates[0] });
                    }
                  }}
                >
                  <div className="sd-concierge-action-icon"><Eye size={17} /></div>
                  <div>
                    <div className="sd-concierge-action-title">Inspect Approval Chains</div>
                    <div className="sd-concierge-action-sub">Open the right-hand Inspector drawer to see live usage telemetry, fields, and approval stages.</div>
                  </div>
                  <ArrowRight size={14} className="sd-text-accent" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Explorer Container */}
      <div className="sd-explorer-container sd-card">
        {/* Top Explorer Address & Tool Bar */}
        <div className="sd-explorer-topbar">
          <div className="sd-explorer-nav-buttons">
            <button className="sd-icon-btn" disabled={historyIdx <= 0} onClick={goBack} title="Back">
              <ArrowLeft size={16} />
            </button>
            <button className="sd-icon-btn" disabled={historyIdx >= navHistory.length - 1} onClick={goForward} title="Forward">
              <ArrowRight size={16} />
            </button>
            <button className="sd-icon-btn" disabled={!currentDept} onClick={goUp} title="Up to parent">
              <ArrowUp size={16} />
            </button>
          </div>

          {/* Breadcrumb Path Address Bar */}
          <div className="sd-explorer-address-bar">
            {breadcrumbs.map((b, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="sd-address-sep"><ChevronRight size={13} /></span>}
                <a
                  className={`sd-address-crumb ${idx === breadcrumbs.length - 1 ? 'is-current' : ''}`}
                  {...tabLinkProps(locUrl(b.dept, b.folderId), () => navigateTo(b.dept, b.folderId))}
                >
                  {idx === 0 ? <HardDrive size={13} /> : idx === 1 ? <Building2 size={13} /> : <Folder size={13} />}
                  <span>{b.label}</span>
                </a>
              </React.Fragment>
            ))}

            {currentFolderObj && canManageCurrent && (
              <div className="sd-folder-current-actions">
                <button
                  type="button"
                  className="sd-icon-btn sd-icon-btn-xs"
                  title="Rename this folder"
                  onClick={() => setFolderModal({ mode: 'rename', dept: currentDept, folderId: currentFolderId, name: currentFolderObj.name })}
                >
                  <Edit2 size={13} />
                </button>
                <button
                  type="button"
                  className="sd-icon-btn sd-icon-btn-xs sd-danger-hover"
                  title="Delete this folder"
                  onClick={() => setDeleteFolderTarget(currentFolderObj)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            <div className="sd-address-rights">
              <span className="sd-muted sd-mono" style={{ fontSize: '0.74rem' }} title="Total storage in current view">
                {formatSize(currentTotalStorageSize)}
              </span>
              {currentDept ? (
                canManageCurrent ? (
                  <span className="sd-badge sd-badge-green" title="You have Admin rights in this department">
                    <ShieldCheck size={12} /> Admin
                  </span>
                ) : (
                  <span className="sd-badge sd-badge-gray" title="You have read-only access to this department">
                    <Lock size={12} /> Read-only
                  </span>
                )
              ) : (
                <span className="sd-badge sd-badge-accent">
                  <HardDrive size={12} /> All Departments
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Explorer Filter / Search Toolbar */}
        <div className="sd-explorer-toolbar">
          <div className="sd-toolbar-left-group">
            <div className="sd-search sd-explorer-search">
              <Search size={14} />
              <input
                id="input-explorer-search"
                placeholder={currentDept ? `Search in ${currentDept}…` : 'Search departments…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="sd-toolbar-right-group">
            <div className="sd-explorer-filters">
              <button
                className={`sd-filter-pill ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All
              </button>
              {currentFolders.length > 0 && (
                <button
                  className={`sd-filter-pill ${filterType === 'folders' ? 'active' : ''}`}
                  onClick={() => setFilterType('folders')}
                >
                  Folders ({currentFolders.length})
                </button>
              )}
              <button
                className={`sd-filter-pill ${filterType === 'templates' ? 'active' : ''}`}
                onClick={() => setFilterType('templates')}
              >
                Templates ({currentTemplates.length})
              </button>
              <button
                id="btn-filter-archived-files"
                className={`sd-filter-pill ${filterType === 'archived' ? 'active' : ''}`}
                onClick={() => setFilterType('archived')}
                title="View archived forms and documents"
              >
                <Archive size={12} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                Archived ({currentArchivedTemplates.length})
              </button>
            </div>

            <div className="sd-explorer-view-toggle">
              <button
                className={`sd-icon-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                title="Tiles / Grid View"
                onClick={() => toggleViewMode('grid')}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                className={`sd-icon-btn ${viewMode === 'details' ? 'is-active' : ''}`}
                title="Details View"
                onClick={() => toggleViewMode('details')}
              >
                <List size={16} />
              </button>
              <button
                id="btn-toggle-explorer-inspector"
                type="button"
                className={`sd-icon-btn ${showInspector && inspectedTemplate ? 'is-active' : ''}`}
                title="Toggle Right-Hand Document Inspector"
                onClick={() => {
                  if (!inspectedTemplate && filteredTemplates.length > 0) {
                    setInspectedTemplateId(filteredTemplates[0].id);
                    setShowInspector(true);
                  } else {
                    setShowInspector(v => !v);
                  }
                }}
              >
                <Layers size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Explorer Body: Two-pane layout */}
        <div className="sd-explorer-body">
          {/* Left Navigation Tree Pane */}
          <aside className="sd-explorer-tree-pane">
            <div className="sd-tree-section-title">Navigation</div>

            {/* Quick Access Root */}
            <div
              className={`sd-tree-item ${currentDept === null && filterType !== 'archived' ? 'active' : ''}`}
              {...tabOpenProps(locUrl(null, null), () => { setFilterType('all'); navigateTo(null, null); })}
            >
              <span className="sd-tree-icon"><HardDrive size={15} /></span>
              <span className="sd-tree-label">All Departments</span>
              <span className="sd-tree-badge">{departments.length}</span>
            </div>

            {/* Department Nodes */}
            <div className="sd-tree-group">
              {departments.map(dept => {
                const isDeptSelected = currentDept === dept.name && currentFolderId === null && filterType !== 'archived';
                const isExpanded = !!expandedDepts[dept.name];
                const deptRootFolders = folders.filter(f => f.department === dept.name && !f.parentId);
                const hasFolders = deptRootFolders.length > 0;
                const deptTemplatesCount = formTemplates.filter(t => t.department === dept.name).length;
                const canManageDept = canManageDepartment(dept.name);

                return (
                  <div key={dept.id} className="sd-tree-dept-node">
                    <div
                      className={`sd-tree-item ${isDeptSelected ? 'active' : ''}`}
                      {...tabOpenProps(locUrl(dept.name, null), () => navigateTo(dept.name, null))}
                    >
                      <button
                        type="button"
                        className={`sd-tree-caret ${hasFolders ? '' : 'invisible'}`}
                        onClick={(e) => toggleDept(dept.name, e)}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="sd-tree-icon"><Building2 size={15} /></span>
                      <span className="sd-tree-label" title={dept.name}>{dept.name}</span>
                      {deptTemplatesCount > 0 && (
                        <span
                          className="sd-tree-badge"
                          title={`${deptTemplatesCount} template${deptTemplatesCount === 1 ? '' : 's'} (${formatSize(getDepartmentStorageSize(dept.name))})`}
                        >
                          {deptTemplatesCount}
                        </span>
                      )}

                      {canManageDept && (
                        <div className="sd-tree-actions" onClick={e => e.stopPropagation()}>
                          <button
                            className="sd-tree-btn"
                            title={`Create New Folder in ${dept.name}`}
                            onClick={() => handleOpenNewFolder(dept.name, null)}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Department Root Folders */}
                    {hasFolders && isExpanded && (
                      <div className="sd-tree-children">
                        {deptRootFolders.map(f => renderTreeFolder(f, 1))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Archived Files Node */}
            <div className="sd-tree-section-title" style={{ marginTop: '12px' }}>Archive</div>
            <div
              id="tree-node-archived-files"
              className={`sd-tree-item ${filterType === 'archived' ? 'active' : ''}`}
              onClick={() => {
                navigateTo(null, null, true);
                setFilterType('archived');
              }}
              title="View archived forms and documents across your departments"
            >
              <span className="sd-tree-icon"><Archive size={15} /></span>
              <span className="sd-tree-label">Archived Files</span>
              <span className="sd-tree-badge">{(archivedTemplates || []).length}</span>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <main className="sd-explorer-main-pane">
            {/* VIEW 0: ARCHIVED FILES VIEW */}
            {filterType === 'archived' ? (
              <div className="sd-explorer-root-view">
                <div className="sd-explorer-section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Archive size={18} className="sd-text-accent" />
                    <h3>Archived Forms &amp; Files{currentDept ? ` — ${currentDept}` : ''}</h3>
                  </div>
                  <span className="sd-muted">
                    {filteredArchivedTemplates.length} archived item{filteredArchivedTemplates.length === 1 ? '' : 's'}
                  </span>
                </div>

                {filteredArchivedTemplates.length === 0 ? (
                  <EmptyState
                    icon={Archive}
                    title="No archived forms or files"
                    text={q
                      ? `No archived items matched "${q}".`
                      : 'Forms and documents that are archived remain preserved here so you can preview, download, or restore them to your drive at any time.'}
                  />
                ) : viewMode === 'grid' ? (
                  <div className="sd-card-grid">
                    {filteredArchivedTemplates.map(renderTemplateCard)}
                  </div>
                ) : (
                  <div className="sd-table-wrap">
                    <table className="sd-table sd-table-explorer">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Details</th>
                          <th>Modified</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredArchivedTemplates.map(renderTemplateRow)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : currentDept === null ? (
              <div className="sd-explorer-root-view">
                {filterType === 'templates' ? (
                  <>
                    <div className="sd-explorer-section-header">
                      <h3>Word Form Templates</h3>
                      <span className="sd-muted">{filteredTemplates.length} template{filteredTemplates.length === 1 ? '' : 's'}</span>
                    </div>

                    {filteredTemplates.length === 0 ? (
                      <EmptyState
                        icon={FileText}
                        title="No templates found"
                        text={q ? `No templates matched "${q}".` : 'No templates have been uploaded yet.'}
                      />
                    ) : viewMode === 'grid' ? (
                      <div className="sd-card-grid">
                        {filteredTemplates.map(renderTemplateCard)}
                      </div>
                    ) : (
                      <div className="sd-table-wrap">
                        <table className="sd-table sd-table-explorer">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Details</th>
                              <th>Modified</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTemplates.map(renderTemplateRow)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="sd-explorer-section-header">
                      <h3>Enterprise Departments</h3>
                      <span className="sd-muted">{filteredDepartments.length} department{filteredDepartments.length === 1 ? '' : 's'}</span>
                    </div>

                    {filteredDepartments.length === 0 ? (
                      <EmptyState
                        icon={Building2}
                        title="No matching departments"
                        text={q ? `No departments matched "${q}".` : 'No departments configured yet.'}
                      />
                    ) : viewMode === 'grid' ? (
                      <div className="sd-dept-drive-grid">
                        {filteredDepartments.map(dept => {
                          const deptFoldersCount = folders.filter(f => f.department === dept.name).length;
                          const deptTplsCount = formTemplates.filter(t => t.department === dept.name).length;
                          const hasAdmin = canManageDepartment(dept.name);

                          return (
                            <div
                              key={dept.id}
                              className="sd-card sd-dept-drive-card"
                              {...tabOpenProps(locUrl(dept.name, null), () => navigateTo(dept.name, null))}
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(dept.name, null); }}
                            >
                              <div className="sd-dept-drive-top">
                                <div className="sd-dept-drive-icon">
                                  <Building2 size={26} />
                                </div>
                                {hasAdmin ? (
                                  <span className="sd-badge sd-badge-green"><ShieldCheck size={11} /> Admin</span>
                                ) : (
                                  <span className="sd-badge sd-badge-gray"><Lock size={11} /> Read-only</span>
                                )}
                              </div>

                              <div className="sd-dept-drive-info">
                                <div className="sd-dept-drive-title-row">
                                  <h4 className="sd-dept-drive-name">{dept.name}</h4>
                                  <span className="sd-badge sd-badge-gray sd-badge-xs sd-mono">{dept.code}</span>
                                </div>
                                {dept.description && (
                                  <p className="sd-dept-drive-desc">{dept.description}</p>
                                )}
                                <div className="sd-dept-drive-stats">
                                  <span><Folder size={12} /> {deptFoldersCount} folder{deptFoldersCount === 1 ? '' : 's'}</span>
                                  <span><FileText size={12} /> {deptTplsCount} template{deptTplsCount === 1 ? '' : 's'}</span>
                                  <span title="Total Department Storage"><HardDrive size={12} /> {formatSize(getDepartmentStorageSize(dept.name))}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* DETAILS / TABLE VIEW FOR DEPARTMENTS */
                      <div className="sd-table-wrap">
                        <table className="sd-table sd-table-explorer">
                          <thead>
                            <tr>
                              <th>Department</th>
                              <th>Contents</th>
                              <th>Access</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDepartments.map(dept => {
                              const deptFoldersCount = folders.filter(f => f.department === dept.name).length;
                              const deptTplsCount = formTemplates.filter(t => t.department === dept.name).length;
                              const hasAdmin = canManageDepartment(dept.name);

                              return (
                                <tr
                                  key={dept.id}
                                  className="sd-tr-folder"
                                  {...tabOpenProps(locUrl(dept.name, null), () => navigateTo(dept.name, null))}
                                >
                                  <td>
                                    <div className="sd-table-name-cell">
                                      <Building2 size={18} className="sd-icon-folder" />
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span className="sd-font-medium">{dept.name}</span>
                                          <span className="sd-badge sd-badge-gray sd-badge-xs sd-mono">{dept.code}</span>
                                        </div>
                                        {dept.description && (
                                          <div className="sd-muted" style={{ fontSize: '0.76rem', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {dept.description}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="sd-muted">
                                      {deptFoldersCount} folder{deptFoldersCount === 1 ? '' : 's'} · {deptTplsCount} template{deptTplsCount === 1 ? '' : 's'} · {formatSize(getDepartmentStorageSize(dept.name))}
                                    </span>
                                  </td>
                                  <td>
                                    {hasAdmin ? (
                                      <span className="sd-badge sd-badge-green"><ShieldCheck size={11} /> Admin</span>
                                    ) : (
                                      <span className="sd-badge sd-badge-gray"><Lock size={11} /> Read-only</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                    <div className="sd-btn-row sd-justify-end">
                                      <a
                                        className="btn btn-secondary btn-sm"
                                        {...tabLinkProps(locUrl(dept.name, null), () => navigateTo(dept.name, null))}
                                      >
                                        Open &rarr;
                                      </a>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Matching Templates when searching across all departments */}
                    {q && filteredTemplates.length > 0 && (
                      <section className="sd-explorer-section" style={{ marginTop: '24px' }}>
                        <div className="sd-explorer-section-title">
                          <FileText size={15} />
                          <span>Matching Templates ({filteredTemplates.length})</span>
                        </div>
                        {viewMode === 'grid' ? (
                          <div className="sd-card-grid">
                            {filteredTemplates.map(renderTemplateCard)}
                          </div>
                        ) : (
                          <div className="sd-table-wrap">
                            <table className="sd-table sd-table-explorer">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Details</th>
                                  <th>Modified</th>
                                  <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredTemplates.map(renderTemplateRow)}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    )}
                  </>
                )}

              </div>
            ) : (
              /* VIEW B: INSIDE A DEPARTMENT OR FOLDER */
              <div className="sd-explorer-content-view">
                {/* Empty State */}
                {totalItemsCount === 0 ? (
                  <EmptyState
                    icon={Folder}
                    title="This folder is empty"
                    text={canManageCurrent
                      ? 'Create subfolders or upload Word (.docx) templates to organize forms for this department.'
                      : 'No forms or documents have been published in this folder yet.'}
                    action={canManageCurrent && (
                      <div className="sd-btn-row">
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleOpenNewFolder(currentDept, currentFolderId)}
                        >
                          <FolderPlus size={15} /> Create Folder
                        </button>
                        <a
                          className="btn btn-primary"
                          {...tabLinkProps(newStudioUrl(), openNewStudio)}
                        >
                          <FileText size={15} /> Word Form Studio
                        </a>
                      </div>
                    )}
                  />
                ) : viewMode === 'grid' ? (
                  /* GRID / TILES VIEW */
                  <div className="sd-explorer-grid-layout">
                    {/* Folders Section */}
                    {filteredFolders.length > 0 && (
                      <section className="sd-explorer-section">
                        <div className="sd-explorer-section-title">
                          <Folder size={15} />
                          <span>Folders ({filteredFolders.length})</span>
                        </div>
                        <div className="sd-folder-tiles-grid">
                          {filteredFolders.map(f => {
                            const subCount = folders.filter(x => x.parentId === f.id).length;
                            const tplCount = formTemplates.filter(x => x.folderId === f.id).length;
                            const itemCount = subCount + tplCount;

                            return (
                              <div
                                key={f.id}
                                className="sd-folder-tile"
                                {...tabOpenProps(locUrl(f.department, f.id), () => navigateTo(f.department, f.id))}
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(f.department, f.id); }}
                              >
                                <div className="sd-folder-tile-icon">
                                  <Folder size={28} />
                                </div>
                                <div className="sd-folder-tile-body">
                                  <span className="sd-folder-tile-name" title={f.name}>{f.name}</span>
                                  <span className="sd-folder-tile-meta">
                                    {itemCount} item{itemCount === 1 ? '' : 's'} · {formatSize(getFolderStorageSize(f.id))}
                                  </span>
                                </div>
                                {canManageCurrent && (
                                  <div className="sd-folder-tile-actions" onClick={e => e.stopPropagation()}>
                                    <button
                                      className="sd-icon-btn sd-icon-btn-xs"
                                      title="Rename folder"
                                      onClick={() => setFolderModal({ mode: 'rename', dept: f.department, folderId: f.id, name: f.name })}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      className="sd-icon-btn sd-icon-btn-xs sd-danger-hover"
                                      title="Delete folder"
                                      onClick={() => setDeleteFolderTarget(f)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Templates Section */}
                    {filteredTemplates.length > 0 && (
                      <section className="sd-explorer-section">
                        <div className="sd-explorer-section-title">
                          <FileText size={15} />
                          <span>Word Form Templates ({filteredTemplates.length})</span>
                        </div>
                        <div className="sd-card-grid">
                          {filteredTemplates.map(renderTemplateCard)}
                        </div>
                      </section>
                    )}

                  </div>
                ) : (
                  /* DETAILS / TABLE VIEW */
                  <div className="sd-table-wrap">
                    <table className="sd-table sd-table-explorer">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Details</th>
                          <th>Modified</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFolders.map(f => {
                          const subCount = folders.filter(x => x.parentId === f.id).length;
                          const tplCount = formTemplates.filter(x => x.folderId === f.id).length;
                          return (
                            <tr key={f.id} className="sd-tr-folder" {...tabOpenProps(locUrl(f.department, f.id), () => navigateTo(f.department, f.id))}>
                              <td>
                                <div className="sd-table-name-cell">
                                  <Folder size={17} className="sd-icon-folder" />
                                  <span className="sd-font-medium">{f.name}</span>
                                </div>
                              </td>
                              <td>
                                <span className="sd-muted">Folder · {subCount + tplCount} item{subCount + tplCount === 1 ? '' : 's'}</span>
                              </td>
                              <td>
                                <span className="sd-muted">
                                  {formatDate(f.createdAt)} · <span className="sd-mono">{formatSize(getFolderStorageSize(f.id))}</span>
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                {canManageCurrent && (
                                  <div className="sd-btn-row sd-justify-end">
                                    <button
                                      className="sd-icon-btn"
                                      title="Rename folder"
                                      onClick={() => setFolderModal({ mode: 'rename', dept: f.department, folderId: f.id, name: f.name })}
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button
                                      className="sd-icon-btn sd-danger-hover"
                                      title="Delete folder"
                                      onClick={() => setDeleteFolderTarget(f)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {filteredTemplates.map(renderTemplateRow)}

                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Right-Hand Live Document & Workflow Inspector Drawer */}
          {showInspector && inspectedTemplate && (() => {
            const t = inspectedTemplate;
            const isNonEditable = t.isEditable === false;
            const canManageTpl = isSuperAdmin || (t.department && canManageDepartment(t.department));
            const tplSubmissions = formSubmissions.filter(
              s => s.templateId === t.id || s.title === t.title
            );
            const approvedCount = tplSubmissions.filter(s => s.status === 'APPROVED').length;
            const inReviewCount = tplSubmissions.filter(s => s.status === 'IN_REVIEW').length;

            return (
              <aside className="sd-explorer-inspector-pane animate-fade-in" aria-label="Document Inspector">
                <header className="sd-inspector-head">
                  <div className="sd-inspector-head-title">
                    <Layers size={14} className="sd-text-accent" />
                    <span>Document Inspector</span>
                  </div>
                  <button
                    type="button"
                    className="sd-icon-btn sd-icon-btn-xs"
                    onClick={() => setShowInspector(false)}
                    title="Close inspector"
                  >
                    <X size={14} />
                  </button>
                </header>

                <div className="sd-inspector-scroll">
                  <div className="sd-inspector-hero">
                    <div className="sd-inspector-doc-icon">
                      <FileText size={22} />
                    </div>
                    <div className="sd-inspector-doc-titles">
                      <h4>{t.title}</h4>
                      <div className="sd-inspector-badges">
                        <span className="sd-badge sd-badge-accent sd-badge-xs">v{t.version || 1}</span>
                        <span className="sd-badge sd-badge-gray sd-badge-xs sd-mono">{t.code}</span>
                        <span className="sd-badge sd-badge-gray sd-badge-xs">{formatSize(t.fileSize)}</span>
                      </div>
                    </div>
                  </div>

                  {t.description && (
                    <p className="sd-inspector-desc">{t.description}</p>
                  )}

                  {/* Quick Primary Actions */}
                  <div className="sd-inspector-actions-stack">
                    {!isNonEditable && !t.isDraft && (t.workflow?.length > 0) && (
                      <a
                        className="btn btn-primary btn-sm"
                        {...tabLinkProps(tplUrl('fill', t), () => handleStartFill(t))}
                      >
                        <PenSquare size={14} /> Fill &amp; Submit Form
                      </a>
                    )}
                    <div className="sd-inspector-actions-row">
                      <a
                        className="btn btn-secondary btn-xs"
                        {...tabLinkProps(tplUrl('view', t), () => openPreview(t))}
                      >
                        <Eye size={13} /> Preview
                      </a>
                      <a
                        className="btn btn-secondary btn-xs"
                        {...tabLinkProps(tplUrl('history', t), () => setVersionHistoryTarget(t))}
                      >
                        <History size={13} /> History
                      </a>
                      {canManageTpl && !isNonEditable && (
                        <a
                          className="btn btn-secondary btn-xs"
                          {...tabLinkProps(tplUrl('edit', t), () => openEditor(t))}
                        >
                          <Edit3 size={13} /> Studio
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Live Usage Telemetry */}
                  <div className="sd-inspector-section">
                    <div className="sd-inspector-section-title">Live Usage Telemetry</div>
                    <div className="sd-inspector-kpi-row">
                      <div className="sd-inspector-kpi">
                        <strong>{tplSubmissions.length}</strong>
                        <span>Total Filled</span>
                      </div>
                      <div className="sd-inspector-kpi">
                        <strong className="sd-text-good">{approvedCount}</strong>
                        <span>Approved</span>
                      </div>
                      <div className="sd-inspector-kpi">
                        <strong className="sd-text-accent">{inReviewCount}</strong>
                        <span>In Review</span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Stage Approval Pipeline */}
                  {!isNonEditable && (
                    <div className="sd-inspector-section">
                      <div className="sd-inspector-section-title">
                        Approval Chain ({(t.workflow || []).length} stage{(t.workflow || []).length === 1 ? '' : 's'})
                      </div>
                      {(!t.workflow || t.workflow.length === 0) ? (
                        <div className="sd-inspector-empty-note">
                          <AlertTriangle size={13} className="sd-text-warn" />
                          <span>No approval stages configured yet.</span>
                        </div>
                      ) : (
                        <ol className="sd-inspector-wf-list">
                          {t.workflow.map((st, idx) => {
                            const deptName = typeof st === 'string' ? st : st?.department;
                            return (
                              <li key={idx} className="sd-inspector-wf-step">
                                <span className="sd-inspector-wf-num">{idx + 1}</span>
                                <div className="sd-inspector-wf-info">
                                  <strong>{deptName}</strong>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  )}

                  {/* Interactive Fields List */}
                  {!isNonEditable && (t.fields || []).length > 0 && (
                    <div className="sd-inspector-section">
                      <div className="sd-inspector-section-title">
                        Interactive Fields ({t.fields.length})
                      </div>
                      <div className="sd-inspector-field-chips">
                        {t.fields.slice(0, 12).map((f, idx) => (
                          <span key={f.name || idx} className="sd-inspector-field-chip" title={`Field type: ${f.type || 'text'}`}>
                            {f.label || f.name}
                          </span>
                        ))}
                        {t.fields.length > 12 && (
                          <span className="sd-inspector-field-chip is-more">
                            +{t.fields.length - 12} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata Summary */}
                  <div className="sd-inspector-section">
                    <div className="sd-inspector-section-title">Properties</div>
                    <dl className="sd-inspector-dl">
                      <div>
                        <dt>Department</dt>
                        <dd>{t.department}</dd>
                      </div>
                      <div>
                        <dt>Access Scope</dt>
                        <dd>{t.accessType === 'ALL' ? 'Everyone' : t.accessType === 'USERS' ? `${(t.allowedUsers || []).length} Users` : 'Department Scoped'}</dd>
                      </div>
                      <div>
                        <dt>Default SLA</dt>
                        <dd>{t.defaultExpiryDays || 14} Days</dd>
                      </div>
                      <div>
                        <dt>Published</dt>
                        <dd>{formatDate(t.createdAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </aside>
            );
          })()}
        </div>
      </div>

      {/* 0. Word Form Studio */}
      {showWordStudio && (
        <SmartWordStudio
          initialDepartment={currentDept || currentUser?.department}
          initialFolderId={currentFolderId}
          templateToEdit={templateToEdit}
          onClose={() => {
            setShowWordStudio(false);
            setTemplateToEdit(null);
          }}
        />
      )}

      {/* Permissions / Access Rights Assignment Modal */}
      {rightsTemplate && (
        <TemplatePermissionsModal
          template={rightsTemplate}
          onClose={() => setRightsTemplate(null)}
        />
      )}

      {/* Clean Floating Template Actions Menu (⋯) */}
      {openMenu?.template && (() => {
        const t = openMenu.template;
        const isNonEditable = t.isEditable === false;
        const isPdf = t.fileType === 'pdf';
        const isImage = t.fileType === 'image';
        const isArchived = t.status === 'ARCHIVED';
        const canManageTpl = isSuperAdmin || (t.department && canManageDepartment(t.department));
        const subCount = isArchived ? (formSubmissions || []).filter(s => s.templateId === t.id).length : 0;

        return (
          <div
            className="sd-tpl-dropdown-menu"
            role="menu"
            style={{
              position: 'fixed',
              left: openMenu.left,
              ...(openMenu.top !== undefined ? { top: openMenu.top } : {}),
              ...(openMenu.bottom !== undefined ? { bottom: openMenu.bottom } : {}),
              zIndex: 100450
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="sd-tpl-menu-item"
              onClick={() => {
                setOpenMenu(null);
                openPreview(t);
              }}
            >
              <Eye size={14} /> Preview
            </button>

            {!isNonEditable && !isArchived && (
              <button
                id={`btn-tpl-print-${t.id}`}
                type="button"
                className="sd-tpl-menu-item"
                onClick={() => {
                  setOpenMenu(null);
                  handlePrintTemplate(t);
                }}
              >
                <Printer size={14} /> Print
              </button>
            )}

            <button
              id={`btn-tpl-download-${t.id}`}
              type="button"
              className="sd-tpl-menu-item"
              onClick={() => {
                setOpenMenu(null);
                if (isNonEditable && (isPdf || isImage)) {
                  handleDirectDownload(t);
                } else {
                  setDownloadTarget(t);
                }
              }}
            >
              <Download size={14} /> Download
            </button>

            <button
              id={`btn-tpl-history-${t.id}`}
              type="button"
              className="sd-tpl-menu-item"
              onClick={() => {
                setOpenMenu(null);
                setVersionHistoryTarget(t);
              }}
            >
              <History size={14} /> Version History
            </button>

            {canManageTpl && !isArchived && (
              <>
                <div className="sd-tpl-menu-divider" />

                {!isNonEditable && (
                  <>
                    <button
                      type="button"
                      className="sd-tpl-menu-item"
                      onClick={() => {
                        setOpenMenu(null);
                        setRouteModalTemplate(t);
                      }}
                    >
                      <GitMerge size={14} /> Approval Route
                    </button>

                    <button
                      id={`btn-tpl-subforms-${t.id}`}
                      type="button"
                      className="sd-tpl-menu-item"
                      onClick={() => {
                        setOpenMenu(null);
                        openSubformsManager(t);
                      }}
                    >
                      <Layers size={14} /> Subforms
                    </button>

                    <button
                      type="button"
                      className="sd-tpl-menu-item"
                      onClick={() => {
                        setOpenMenu(null);
                        setSendForReviewTarget(t);
                      }}
                    >
                      <Send size={14} /> Send for Review
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="sd-tpl-menu-item"
                  onClick={() => {
                    setOpenMenu(null);
                    setRightsTemplate(t);
                  }}
                >
                  <ShieldCheck size={14} /> Permissions
                </button>

                <button
                  type="button"
                  className="sd-tpl-menu-item"
                  onClick={() => {
                    setOpenMenu(null);
                    setMoveTemplateTarget(t);
                  }}
                >
                  <FolderInput size={14} /> Move to Folder
                </button>
              </>
            )}

            {canManageTpl && (!isArchived || subCount === 0) && (
              <>
                <div className="sd-tpl-menu-divider" />
                <button
                  type="button"
                  className="sd-tpl-menu-item is-danger"
                  onClick={() => {
                    setOpenMenu(null);
                    setConfirmRemoveTemplate(t);
                  }}
                >
                  <Trash2 size={14} /> {isArchived ? 'Delete Permanently' : 'Archive / Delete'}
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Approval Route Studio Modal */}
      {routeModalTemplate && (
        <ApprovalRouteModal
          template={routeModalTemplate}
          governingMainForm={parentMainFormBySubformId.get(routeModalTemplate.id) || null}
          onClose={() => setRouteModalTemplate(null)}
        />
      )}

      {/* Git Version History Modal */}
      {versionHistoryTarget && (
        <VersionHistoryModal
          item={versionHistoryTarget}
          target={versionHistoryTarget}
          kind="template"
          onClose={() => setVersionHistoryTarget(null)}
        />
      )}

      {/* 1. Template Upload Modal */}
      {showUpload && (
        <TemplateUploadModal
          initialDepartment={currentDept || currentUser?.department}
          initialFolderId={currentFolderId}
          onClose={() => setShowUpload(false)}
          onOpenBulkImport={() => {
            setShowUpload(false);
            setShowBulkImport(true);
          }}
        />
      )}

      {/* 1b. Bulk Import Documents Modal */}
      {showBulkImport && (
        <BulkImportModal
          initialDepartment={currentDept || currentUser?.department}
          initialFolderId={currentFolderId}
          onClose={() => setShowBulkImport(false)}
          onDone={() => {
            setShowBulkImport(false);
            if (refreshTemplates) refreshTemplates();
            if (refreshFolders) refreshFolders();
          }}
        />
      )}

      {/* 2. Fill Form Modal */}
      {fillTemplate && (
        <FillFormModal
          template={fillTemplate}
          isViewOnly={viewOnlyFill}
          initialPrint={printDirect}
          initialDownload={downloadDirect}
          onClose={() => {
            setFillTemplate(null);
            setViewOnlyFill(false);
            setPrintDirect(false);
            setDownloadDirect(false);
          }}
          onDone={() => {
            setFillTemplate(null);
            setViewOnlyFill(false);
            setPrintDirect(false);
            setDownloadDirect(false);
          }}
        />
      )}

      {/* 3. Submission Detail Modal */}
      {detailSubmissionId && (
        <SubmissionDetailModal
          submissionId={detailSubmissionId}
          onClose={() => setDetailSubmissionId(null)}
        />
      )}

      {/* 4. Create / Rename Folder Modal */}
      {folderModal && (
        <div className="sd-modal-backdrop">
          <div className="sd-modal sd-modal-sm" role="dialog">
            <header className="sd-modal-header">
              <h2 className="sd-modal-title">
                {folderModal.mode === 'create' ? 'Create New Folder' : 'Rename Folder'}
              </h2>
            </header>
            <form onSubmit={handleFolderModalSubmit}>
              <div className="sd-modal-body">
                <div className="sd-form-group">
                  {folderModal.mode === 'create' && isSuperAdmin && !currentDept ? (
                    <label className="sd-field sd-mb-sm">
                      <span className="sd-label">Department *</span>
                      <select
                        className="sd-input"
                        value={folderModal.dept}
                        onChange={e => setFolderModal(prev => ({ ...prev, dept: e.target.value }))}
                      >
                        {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="sd-muted sd-small sd-mb-sm" style={{ padding: '6px 10px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      Department: <strong>{folderModal.dept}</strong>
                      {folderModal.parentId && (
                        <> &gt; Inside: <strong>{folders.find(x => x.id === folderModal.parentId)?.name || 'Parent Folder'}</strong></>
                      )}
                    </div>
                  )}

                  <label className="sd-field">
                    <span className="sd-label">Folder Name *</span>
                    <input
                      id="input-folder-modal-name"
                      className="sd-input"
                      autoFocus
                      required
                      maxLength={100}
                      value={folderModal.name || ''}
                      onChange={e => setFolderModal(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Recruitment, Medical Claims, NDAs…"
                    />
                  </label>
                </div>
              </div>
              <footer className="sd-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setFolderModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {folderModal.mode === 'create' ? 'Create Folder' : 'Save Name'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* 5. Delete Folder Modal */}
      {deleteFolderTarget && (
        <div className="sd-modal-backdrop">
          <div className="sd-modal sd-modal-sm" role="alertdialog">
            <header className="sd-modal-header">
              <h2 className="sd-modal-title">Delete Folder?</h2>
            </header>
            <div className="sd-modal-body">
              <p>Are you sure you want to delete folder <strong>{deleteFolderTarget.name}</strong>?</p>
              <p className="sd-muted sd-small" style={{ marginTop: '8px', lineHeight: '1.4' }}>
                Any forms or subfolders inside this folder will automatically be moved to the parent location so no documents are deleted.
              </p>
            </div>
            <footer className="sd-modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteFolderTarget(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await deleteFolder(deleteFolderTarget.id);
                  if (currentFolderId === deleteFolderTarget.id) {
                    setCurrentFolderId(deleteFolderTarget.parentId || null);
                  }
                  setDeleteFolderTarget(null);
                }}
              >
                Delete Folder
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 6. Move Template Modal */}
      {moveTemplateTarget && (
        <div className="sd-modal-backdrop">
          <div className="sd-modal sd-modal-sm" role="dialog">
            <header className="sd-modal-header">
              <h2 className="sd-modal-title">Move Template</h2>
            </header>
            <div className="sd-modal-body">
              <p className="sd-muted sd-small sd-mb-sm">
                Move <strong>{moveTemplateTarget.title}</strong> to a folder inside <strong>{moveTemplateTarget.department}</strong>:
              </p>
              <div className="sd-move-folder-list">
                {(() => {
                  const cleanT = (moveTemplateTarget.title || '').trim().toLowerCase();
                  const cleanFn = (moveTemplateTarget.fileName || '').trim().toLowerCase();
                  const rootConflict = formTemplates.find(t => {
                    if (t.id === moveTemplateTarget.id) return false;
                    if (t.department !== moveTemplateTarget.department) return false;
                    if (t.status === 'ARCHIVED') return false;
                    if (t.folderId) return false;
                    return (cleanT && t.title?.trim().toLowerCase() === cleanT) || (cleanFn && t.fileName?.trim().toLowerCase() === cleanFn);
                  });
                  const isCurrentRoot = !moveTemplateTarget.folderId;
                  return (
                    <button
                      type="button"
                      className={`sd-move-folder-item ${isCurrentRoot ? 'is-current' : ''} ${rootConflict ? 'has-conflict' : ''}`}
                      disabled={isCurrentRoot || !!rootConflict}
                      onClick={() => handleMoveTemplateSubmit(null)}
                      title={rootConflict ? `A file named "${rootConflict.title || rootConflict.fileName}" already exists in root` : undefined}
                    >
                      <Building2 size={16} />
                      <span>(Department Root - {moveTemplateTarget.department})</span>
                      {rootConflict && (
                        <span className="sd-badge sd-badge-danger" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                          Name Conflict
                        </span>
                      )}
                    </button>
                  );
                })()}
                {folders
                  .filter(f => f.department === moveTemplateTarget.department)
                  .map(f => {
                    const isCurrentFolder = moveTemplateTarget.folderId === f.id;
                    const cleanT = (moveTemplateTarget.title || '').trim().toLowerCase();
                    const cleanFn = (moveTemplateTarget.fileName || '').trim().toLowerCase();
                    const folderConflict = formTemplates.find(t => {
                      if (t.id === moveTemplateTarget.id) return false;
                      if (t.department !== moveTemplateTarget.department) return false;
                      if (t.status === 'ARCHIVED') return false;
                      if (t.folderId !== f.id) return false;
                      return (cleanT && t.title?.trim().toLowerCase() === cleanT) || (cleanFn && t.fileName?.trim().toLowerCase() === cleanFn);
                    });
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`sd-move-folder-item ${isCurrentFolder ? 'is-current' : ''} ${folderConflict ? 'has-conflict' : ''}`}
                        disabled={isCurrentFolder || !!folderConflict}
                        onClick={() => handleMoveTemplateSubmit(f.id)}
                        title={folderConflict ? `A file named "${folderConflict.title || folderConflict.fileName}" already exists in "${f.name}"` : undefined}
                      >
                        <Folder size={16} />
                        <span>{f.name}</span>
                        {folderConflict && (
                          <span className="sd-badge sd-badge-danger" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                            Name Conflict
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
            <footer className="sd-modal-footer">
              <button className="btn btn-secondary" onClick={() => setMoveTemplateTarget(null)}>Cancel</button>
            </footer>
          </div>
        </div>
      )}

      {/* 7. Confirm Remove / Archive Template Modal */}
      {confirmRemoveTemplate && (() => {
        const submissionCount = (formSubmissions || []).filter(s => s.templateId === confirmRemoveTemplate.id).length;
        const hasSubmissions = submissionCount > 0;
        const isAlreadyArchived = confirmRemoveTemplate.status === 'ARCHIVED';
        return (
          <div className="sd-modal-backdrop">
            <div className="sd-modal sd-modal-sm" role="alertdialog">
              <header className="sd-modal-header">
                <h2 className="sd-modal-title">
                  {isAlreadyArchived ? 'Delete archived document permanently?' : hasSubmissions ? 'Archive template?' : 'Archive or delete template?'}
                </h2>
              </header>
              <div className="sd-modal-body">
                {isAlreadyArchived ? (
                  <p>
                    Are you sure you want to permanently delete <strong>{confirmRemoveTemplate.title}</strong> from physical storage and the database? This cannot be undone.
                  </p>
                ) : hasSubmissions ? (
                  <p>
                    <strong>{confirmRemoveTemplate.title}</strong> has <strong>{submissionCount}</strong> filled submission{submissionCount === 1 ? '' : 's'} on record.
                    It will be moved to <strong>Archived Files</strong> so existing submissions and audit records remain intact, and you can restore it at any time.
                  </p>
                ) : (
                  <p>
                    No user has filled or submitted a form for <strong>{confirmRemoveTemplate.title}</strong> yet.
                    You can move it to <strong>Archived Files</strong> (so you can view or restore it later) or <strong>permanently delete</strong> it from storage.
                  </p>
                )}
              </div>
              <footer className="sd-modal-footer">
                <button className="btn btn-secondary" onClick={() => setConfirmRemoveTemplate(null)}>Cancel</button>
                {!isAlreadyArchived && !hasSubmissions && (
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      await archiveTemplate(confirmRemoveTemplate.id, 'archive');
                      setConfirmRemoveTemplate(null);
                    }}
                  >
                    <Archive size={14} /> Move to Archive
                  </button>
                )}
                <button
                  className={hasSubmissions && !isAlreadyArchived ? 'btn btn-primary' : 'btn btn-danger'}
                  onClick={async () => {
                    await archiveTemplate(confirmRemoveTemplate.id, hasSubmissions && !isAlreadyArchived ? 'archive' : 'delete');
                    setConfirmRemoveTemplate(null);
                  }}
                >
                  {hasSubmissions && !isAlreadyArchived ? 'Move to Archive' : 'Delete permanently'}
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
      {/* 8. Send Template for Review Modal */}
      {sendForReviewTarget && (
        <SendForReviewModal
          title={sendForReviewTarget.title}
          onClose={() => setSendForReviewTarget(null)}
          onSend={handleSendTemplateForReview}
        />
      )}

      {/* 9. Download Document Options Modal */}
      {downloadTarget && (
        <Modal
          id="download-document-modal"
          size="sm"
          title="Download Document"
          subtitle={downloadTarget.title}
          onClose={() => {
            if (!downloadingFormat) setDownloadTarget(null);
          }}
          footer={
            <button
              className="btn btn-secondary"
              disabled={!!downloadingFormat}
              onClick={() => setDownloadTarget(null)}
            >
              Cancel
            </button>
          }
        >
          <div className="sd-download-dialog-body">
            <p className="sd-muted sd-small sd-mb-md">
              Select your preferred format to download. You can download the editable Microsoft Word document or save it converted as an authentic PDF.
            </p>

            <div className="sd-download-options-grid">
              <div className="sd-download-option-card">
                <div className="sd-download-card-icon sd-text-accent">
                  <FileText size={26} />
                </div>
                <div className="sd-download-card-info">
                  <div className="sd-download-card-title">Microsoft Word</div>
                  <div className="sd-download-card-desc">Original .docx format. Compatible with Word, LibreOffice, and SmartDoc Studio.</div>
                </div>
                <button
                  id="btn-confirm-download-docx"
                  className="btn btn-secondary btn-sm sd-btn-flex"
                  disabled={!!downloadingFormat}
                  onClick={() => handleDownloadWordFromModal(downloadTarget)}
                  title="Download editable Microsoft Word document"
                >
                  {downloadingFormat === 'docx' ? <Loader2 size={13} className="sd-spin" /> : <Download size={13} />}
                  <span>{downloadingFormat === 'docx' ? 'Downloading…' : 'Download .docx'}</span>
                </button>
              </div>

              <div className="sd-download-option-card sd-download-option-highlight">
                <div className="sd-download-card-icon sd-text-good">
                  <FileDown size={26} />
                </div>
                <div className="sd-download-card-info">
                  <div className="sd-download-card-title">PDF Document</div>
                  <div className="sd-download-card-desc">Standard A4 .pdf file. Print-ready, high-resolution layout with client-side conversion.</div>
                </div>
                <button
                  id="btn-confirm-download-pdf"
                  className="btn btn-primary btn-sm sd-btn-flex"
                  disabled={!!downloadingFormat}
                  onClick={() => handleDownloadPdfFromModal(downloadTarget)}
                  title="Save document as PDF"
                >
                  {downloadingFormat === 'pdf' ? <Loader2 size={13} className="sd-spin" /> : <FileDown size={13} />}
                  <span>{downloadingFormat === 'pdf' ? (downloadPdfProgress || 'Generating PDF…') : 'Save as PDF'}</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 10. Tag / Manage Subforms Modal */}
      {subformsModalTarget && (
        <Modal
          id="modal-manage-subforms"
          size="md"
          title={`Tag Subforms to "${subformsModalTarget.title}"`}
          subtitle={`${subformsModalTarget.department} · ${subformsModalTarget.code} — Combined Pre-Publication Review, Publishing & Multi-Tab Filling`}
          onClose={() => {
            if (!savingSubforms) setSubformsModalTarget(null);
          }}
          footer={
            <>
              <span className="sd-muted" style={{ marginRight: 'auto', fontSize: '0.82rem' }}>
                {subformsSelection.length} subform{subformsSelection.length === 1 ? '' : 's'} selected
              </span>
              {subformsSelection.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={savingSubforms}
                  onClick={() => setSubformsSelection([])}
                >
                  Clear All
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={savingSubforms}
                onClick={() => setSubformsModalTarget(null)}
              >
                Cancel
              </button>
              <button
                id="btn-save-tagged-subforms"
                type="button"
                className="btn btn-primary btn-sm"
                disabled={savingSubforms}
                onClick={handleSaveSubformsModal}
              >
                {savingSubforms ? <Loader2 size={14} className="sd-spin" /> : <Check size={14} />}
                <span>{savingSubforms ? 'Syncing Bundle…' : 'Save & Sync Approval Chain'}</span>
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="sd-alert sd-alert-info" style={{ fontSize: '0.82rem' }}>
              <Layers size={16} />
              <div>
                <strong>Same-Department Bundle (Forms, PDFs &amp; Images):</strong> Subforms must belong to <strong>{subformsModalTarget.department}</strong> and can be any uploaded item (Word Form, PDF, or Image). Tagging subforms syncs <strong>{subformsModalTarget.title}</strong>&apos;s sequential approval chain ({(subformsModalTarget.workflow || []).map(w => typeof w === 'string' ? w : w.department).join(' → ') || 'None'}) across all selected subforms.
              </div>
            </div>

            <div className="sd-search">
              <Search size={14} />
              <input
                type="text"
                placeholder={`Search forms, PDFs, or images in ${subformsModalTarget.department}…`}
                value={subformsSearch}
                onChange={e => setSubformsSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const sameDeptCandidates = (formTemplates || []).filter(c => {
                  if (c.id === subformsModalTarget.id) return false;
                  if (c.status === 'ARCHIVED') return false;
                  if (c.department !== subformsModalTarget.department) return false;
                  const q = subformsSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (c.title || '').toLowerCase().includes(q) ||
                    (c.code || '').toLowerCase().includes(q) ||
                    (c.fileName || '').toLowerCase().includes(q)
                  );
                });

                if (sameDeptCandidates.length === 0) {
                  return (
                    <p className="sd-muted" style={{ textAlign: 'center', padding: '20px 0' }}>
                      No other forms, PDFs, or images found in {subformsModalTarget.department}.
                    </p>
                  );
                }

                return sameDeptCandidates.map(c => {
                  const isTagged = subformsSelection.includes(c.id);
                  const orderIdx = subformsSelection.indexOf(c.id);
                  const fType = (c.fileType || 'docx').toLowerCase();
                  const isPdf = fType === 'pdf';
                  const isImage = fType === 'image';
                  const typeBadgeLabel = isPdf ? 'PDF' : isImage ? 'IMAGE' : 'WORD FORM';
                  return (
                    <div
                      key={c.id}
                      className="sd-card"
                      onClick={() => {
                        setSubformsSelection(prev =>
                          prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                        );
                      }}
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        borderColor: isTagged ? 'var(--primary)' : 'var(--border-subtle)',
                        background: isTagged ? 'var(--primary-soft)' : 'var(--bg-surface)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isTagged ? 'var(--primary)' : 'var(--bg-elevated)',
                            color: isTagged ? '#000' : 'var(--text-muted)',
                            fontWeight: 700,
                            fontSize: '0.75rem'
                          }}
                        >
                          {isTagged ? `S${orderIdx + 1}` : isImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {c.title}
                            <span className="sd-badge sd-badge-gray sd-badge-xs">{typeBadgeLabel}</span>
                            {c.isDraft && <span className="sd-badge sd-badge-warn sd-badge-xs">Draft</span>}
                          </div>
                          <div className="sd-muted" style={{ fontSize: '0.76rem' }}>
                            {c.department} · {c.code} · {isPdf ? 'Static PDF Document' : isImage ? 'Static Image Attachment' : `${(c.fields || []).length} field${(c.fields || []).length === 1 ? '' : 's'}`}
                          </div>
                        </div>
                      </div>
                      <span className={`sd-badge ${isTagged ? 'sd-badge-green' : 'sd-badge-gray'}`}>
                        {isTagged ? `Tagged (#${orderIdx + 1})` : '+ Tag'}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
