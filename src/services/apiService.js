// SmartDoc API client — talks to the Express/PostgreSQL backend at /api
const API_BASE = '/api';
const SESSION_KEY = 'smartdoc_session_user_id';

export const session = {
  get: () => localStorage.getItem(SESSION_KEY),
  set: (id) => localStorage.setItem(SESSION_KEY, id),
  clear: () => localStorage.removeItem(SESSION_KEY)
};

async function request(endpoint, options = {}) {
  const userId = session.get();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': userId } : {}),
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function requestBlob(endpoint, options = {}) {
  const userId = session.get();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...(userId ? { 'X-User-Id': userId } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || `Download failed (${res.status})`);
  }
  return await res.blob();
}

const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body || {}) });
const put = (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body || {}) });

export const apiService = {
  // Auth
  login: (username, password) => post('/auth/login', { username, password }),
  me: () => request('/auth/me'),

  // Users
  getUsers: () => request('/users'),
  createUser: (data) => post('/users', data),
  updateUser: (id, data) => put(`/users/${id}`, data),
  toggleUserStatus: (id) => request(`/users/${id}/status`, { method: 'PATCH' }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  saveSignature: (id, signature) => put(`/users/${id}/signature`, { signature }),
  saveAvatar: (id, avatar) => put(`/users/${id}/avatar`, { avatar }),
  getPkiCertificate: (id) => request(`/users/${id}/pki-certificate`),
  generatePkiCertificate: (id) => post(`/users/${id}/pki-certificate/generate`, {}),
  downloadPkiCertificateUrl: (id) => `/api/users/${id}/pki-certificate/download`,

  // Departments
  getDepartments: () => request('/departments'),
  createDepartment: (data) => post('/departments', data),
  deleteDepartment: (id) => request(`/departments/${id}`, { method: 'DELETE' }),

  // Folders (Windows Explorer structure)
  getFolders: (department) => request(`/folders${department ? `?department=${encodeURIComponent(department)}` : ''}`),
  createFolder: (data) => post('/folders', data),
  updateFolder: (id, data) => put(`/folders/${id}`, data),
  deleteFolder: (id) => request(`/folders/${id}`, { method: 'DELETE' }),

  // Word templates & Word Form Studio (.docx and .doc)
  parseTemplate: (fileBase64) => post('/forms/templates/parse', { fileBase64 }),
  parseDocx: (fileBase64) => post('/forms/templates/parse-docx', { fileBase64 }),
  parseWord: (fileBase64) => post('/forms/templates/parse-docx', { fileBase64 }),
  htmlToDocx: (html, title) => post('/forms/templates/html-to-docx', { html, title }),
  getTemplates: () => request('/forms/templates'),
  createTemplate: (data) => post('/forms/templates', data),
  updateTemplate: (id, data) => put(`/forms/templates/${id}`, data),
  updateTemplatePermissions: (id, data) => put(`/forms/templates/${id}/permissions`, data),
  addTemplateComment: (id, data) => post(`/forms/templates/${id}/comments`, data),
  updateTemplateComment: (id, commentId, data) => put(`/forms/templates/${id}/comments/${commentId}`, data),
  moveTemplate: (id, folderId) => put(`/forms/templates/${id}/move`, { folderId }),
  archiveTemplate: (id) => request(`/forms/templates/${id}`, { method: 'DELETE' }),
  getTemplateFile: (id) => requestBlob(`/forms/templates/${id}/file`),
  renderPrintDocument: (id, data) => requestBlob(`/forms/templates/${id}/render-print-document`, { method: 'POST', body: JSON.stringify(data || {}) }),
  bulkImportTemplates: (data) => post('/forms/templates/bulk-import', data),
  generateAiForm: (data) => post('/ai/generate-form', data),
  getOllamaStatus: () => request('/ai/ollama-status'),
  getOllamaLogs: () => request('/ai/ollama-logs'),
  clearOllamaLogs: () => request('/ai/ollama-logs', { method: 'DELETE' }),

  // Submissions
  getSubmissions: () => request('/forms/submissions'),
  submitForm: (data) => post('/forms/submissions', data),
  resubmitForm: (id, data) => put(`/forms/submissions/${id}/modify`, data),
  workflowAction: (id, action, notes) => post(`/forms/submissions/${id}/workflow-action`, { action, notes }),
  getSubmissionDocument: (id) => requestBlob(`/forms/submissions/${id}/document`),
  verifySubmissionSignatures: (id) => post(`/forms/submissions/${id}/verify-signatures`, {}),
  addSubmissionComment: (id, data) => post(`/forms/submissions/${id}/comments`, data),
  updateSubmissionComment: (id, commentId, data) => put(`/forms/submissions/${id}/comments/${commentId}`, data),

  // Notifications
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) => put(`/notifications/${id}/read`),
  markAllNotificationsRead: () => put('/notifications/read-all'),

  // Template reviews (reviewers edit a draft form; the initiator accepts / rejects changes)
  getReviews: () => request('/template-reviews'),
  getReview: (id) => request(`/template-reviews/${id}`),
  startReview: (data) => post('/template-reviews', data),
  submitReview: (id, data) => post(`/template-reviews/${id}/submit`, data),
  saveReviewDecisions: (id, decisions) => put(`/template-reviews/${id}/decisions`, { decisions }),
  finalizeReview: (id, data) => post(`/template-reviews/${id}/finalize`, data),
  cancelReview: (id) => post(`/template-reviews/${id}/cancel`),

  // Department messaging
  getDepartmentMessages: (department) =>
    request(`/departments/messages${department ? `?department=${encodeURIComponent(department)}` : ''}`),
  sendDepartmentMessage: (data) => post('/departments/messages', data),

  // System maintenance (superadmin only)
  wipeAllData: () => post('/system/wipe-data', { mode: 'everything' }),
  wipeFormsOnly: () => post('/system/wipe-data', { mode: 'forms' }),

  // Activity & Audit Logs
  getActivityLogs: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.department && params.department !== 'ALL') qs.set('department', params.department);
    if (params.actionType && params.actionType !== 'ALL') qs.set('actionType', params.actionType);
    if (params.category && params.category !== 'ALL') qs.set('category', params.category);
    if (params.actor) qs.set('actor', params.actor);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.exportAll) qs.set('exportAll', 'true');
    const q = qs.toString();
    return request(`/audit-logs${q ? `?${q}` : ''}`);
  }
};

