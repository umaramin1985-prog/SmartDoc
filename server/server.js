import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPostgresDatabase, query, wipeAllData, wipeFormsOnly } from './pgDb.js';
import {
  parseTemplate,
  parseWordDocument,
  convertDocTextToHtml,
  renderFilledDocument,
  repairDocxBuffer,
  compileHtmlToValidDocx,
  renderTemplateAsWordDocx,
  SYSTEM_TAGS
} from './docxEngine.js';
import { generateUserCertificate, parseCertificateInfo, signPayload, verifySignatureBundle } from './pkiEngine.js';
import mammoth from 'mammoth';
import htmlToDocx from 'html-to-docx';
import { generateFormWithAi, getOllamaStatus, getOllamaLogs, clearOllamaLogs } from './aiFormEngine.js';
import {
  initStorage,
  saveTemplateFile,
  getTemplateBuffer,
  getTemplateBase64,
  streamTemplateFile,
  deleteTemplateFile,
  saveSubmissionFile,
  purgeStorage,
  migrateDatabaseTemplatesToDisk,
  getMimeType
} from './storageEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================
// Application Version & Cache Invalidation
// ============================================================
let appVersion = '1.4.0';
try {
  const pkgData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkgData && pkgData.version) appVersion = pkgData.version;
} catch (_) { }

app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    version: process.env.APP_VERSION || appVersion,
    app: 'SmartDoc',
    timestamp: Date.now()
  });
});

// ============================================================
// Helpers
// ============================================================
const parseJson = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

// Roles: 'superadmin' (system owner) | 'admin' (department admin) | 'user'
const normalizeRole = (r) => (r === 'superadmin' || r === 'admin') ? r : 'user';
const isSuper = (u) => u && normalizeRole(u.system_role) === 'superadmin';
const isAdmin = (u) => u && ['admin', 'superadmin'].includes(normalizeRole(u.system_role));
const isDeptAdmin = (u, dept) => u && (isSuper(u) || (normalizeRole(u.system_role) === 'admin' && u.department === dept));

function sanitizeUser(u, { includeSignature = false } = {}) {
  if (!u) return null;
  const out = {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email || '',
    role: u.role,
    systemRole: normalizeRole(u.system_role),
    department: u.department,
    status: u.status,
    hasSignature: !!u.signature_image,
    avatar: u.avatar || null,
    createdAt: u.created_at,
    lastLogin: u.last_login,
    hasPkiCertificate: !!u.pki_certificate_pem,
    pkiSerialNumber: u.pki_serial_number || null,
    pkiFingerprint: u.pki_fingerprint || null,
    pkiIssuedAt: u.pki_issued_at || null,
    pkiExpiresAt: u.pki_expires_at || null
  };
  if (includeSignature) out.signatureImage = u.signature_image || null;
  return out;
}

async function getUserById(id) {
  if (!id) return null;
  const r = await query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// The client sends the logged-in user id in the X-User-Id header.
// NOTE: there are no session tokens yet, so this header is trusted as-is.
async function requireActor(req, res) {
  const actor = await getUserById(req.get('x-user-id'));
  if (!actor || actor.status === 'SUSPENDED') {
    res.status(401).json({ error: 'Your session is not valid. Please sign in again.' });
    return null;
  }
  return actor;
}

async function audit(action, actor, resource, department) {
  try {
    const sha256 = crypto.createHash('sha256').update(`${action}|${actor}|${resource}|${Date.now()}`).digest('hex');
    await query(
      `INSERT INTO audit_logs (id, timestamp, action_type, actor_email, resource_name, department, sha256, verified)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, TRUE)`,
      [`AUD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, action, actor || 'system', resource, department || 'General', sha256]
    );
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

const mapDepartment = (d) => ({ id: d.id, name: d.name, code: d.code, description: d.description, status: d.status, createdAt: d.created_at });

function cleanDoubleEncodedAmp(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/&(amp;){2,}/gi, '&amp;');
}

function decodeHtmlAmp(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/&(amp;)+/gi, '&');
}

function mapTemplate(t) {
  const fileType = t.file_type || 'docx';
  const cleanBase64 = String(t.docx_base64 || '').replace(/^data:[^;]+;base64,/, '');
  const fileSize = t.file_size ? parseInt(t.file_size, 10) : (cleanBase64 ? Buffer.byteLength(cleanBase64, 'base64') : 0);
  const rawSigSlots = parseJson(t.signature_slots, []);
  return {
    id: t.id,
    code: t.unique_code,
    title: t.title,
    description: t.description || '',
    department: t.department,
    folderId: t.folder_id || null,
    audience: t.audience || 'DEPARTMENT',
    accessType: t.access_type || (t.audience === 'ALL' ? 'ALL' : 'DEPARTMENTS'),
    allowedDepartments: parseJson(t.allowed_departments, []),
    allowedUsers: parseJson(t.allowed_users, []),
    fileName: t.docx_filename,
    fileType,
    fileSize,
    filePath: t.file_path || null,
    fileHash: t.file_hash || null,
    isEditable: t.is_editable !== false && (fileType === 'docx' || fileType === 'doc'),
    version: t.version || '1.0',
    versionHistory: parseJson(t.version_history, []),
    comments: parseJson(t.comments, []),
    fields: parseJson(t.fields, []),
    signatureSlots: Array.isArray(rawSigSlots) ? rawSigSlots.map(s => decodeHtmlAmp(String(s || ''))) : [],
    systemTags: parseJson(t.system_tags, []),
    workflow: parseJson(t.workflow, []),
    defaultExpiryDays: t.default_expiry_days || 14,
    createdBy: t.created_by,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    htmlContent: t.html_content ? cleanDoubleEncodedAmp(t.html_content) : null,
    fontFamily: t.font_family || null,
    fontSize: t.font_size || null,
    status: t.status || 'ACTIVE',
    isDraft: t.status === 'DRAFT'
  };
}

function mapSubmission(s) {
  let status = s.status;
  if (status === 'IN_REVIEW' && s.expiry_date && s.expiry_date < todayStr()) status = 'EXPIRED';
  const workflow = parseJson(s.workflow, []).map((step) => ({
    ...step,
    signature: step.signature || null,
    signatureImage: step.signature || null,
    signed: !!step.signature,
    hasPkiSignature: !!step.pkiSignature
  }));
  const pkiSig = parseJson(s.pki_signature, null);
  return {
    id: s.id,
    templateId: s.template_id,
    folderId: s.folder_id || null,
    uniqueNumber: s.unique_number,
    title: s.title,
    department: s.department,
    submittedById: s.submitted_by_id,
    submittedByName: s.submitted_by_name,
    submittedByUsername: s.submitted_by_username,
    version: s.version,
    versionHistory: parseJson(s.version_history, []),
    comments: parseJson(s.comments, []),
    formData: parseJson(s.form_data, {}),
    expiryDate: s.expiry_date,
    status,
    currentWorkflowStep: s.current_workflow_step,
    workflow,
    objectionNotes: s.objection_notes,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    signature: s.signature || null,
    signedAt: s.signed_at || null,
    pkiSignature: pkiSig,
    hasPkiSignature: !!pkiSig
  };
}

function canSeeTemplate(actor, t) {
  if (isSuper(actor)) return true;
  if (isDeptAdmin(actor, t.department)) return true;
  // If it's an unpublished DRAFT, only admins of that department (or superadmin) can view/manage it
  if (t.status === 'DRAFT') return false;
  const accessType = t.access_type || (t.audience === 'ALL' ? 'ALL' : 'DEPARTMENTS');
  if (accessType === 'ALL') return true;
  if (accessType === 'DEPARTMENTS') {
    const allowedDepts = parseJson(t.allowed_departments, []);
    if (allowedDepts.length === 0) return t.department === actor.department;
    return allowedDepts.includes(actor.department) || t.department === actor.department;
  }
  if (accessType === 'USERS') {
    const allowedUsers = parseJson(t.allowed_users, []);
    return allowedUsers.some(u => {
      if (typeof u === 'string') return u === actor.id || u.toLowerCase() === (actor.username || '').toLowerCase();
      return u.id === actor.id || (u.username && u.username.toLowerCase() === (actor.username || '').toLowerCase());
    });
  }
  return t.department === actor.department;
}

function canSeeSubmission(actor, s) {
  if (!actor || !s) return false;
  // Super admin can see all submissions
  if (isSuper(actor)) return true;
  // Originator / Submitter can always see their own submission
  if (s.submitted_by_id === actor.id) return true;
  // Department members (both admins and users) can see submissions originating from their department
  if (s.department && s.department === actor.department) return true;
  // Members of any department along the approval workflow chain can see the submission
  const wf = parseJson(s.workflow, []);
  if (wf.some(st => st.department === actor.department)) return true;
  // Department admins have visibility into submitted forms across departments
  if (normalizeRole(actor.system_role) === 'admin') return true;
  return false;
}

function bumpVersion(v) {
  const [maj, min] = String(v || '1.0').split('.');
  return `${maj || '1'}.${(parseInt(min || '0', 10) || 0) + 1}`;
}

const freshWorkflow = (tmplWorkflow) => tmplWorkflow.map((st, i) => ({
  step: i + 1,
  department: st.department,
  status: i === 0 ? 'PENDING' : 'WAITING',
  actedById: null, actedByName: null, actedAt: null, notes: null, signature: null
}));

// Notification helpers
async function sendNotification({ userId, type, title, message, linkType, linkId }) {
  if (!userId) return;
  try {
    const id = `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await query(
      `INSERT INTO notifications (id, user_id, type, title, message, link_type, link_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NOW())`,
      [id, userId, type, title, message, linkType || null, linkId || null]
    );
  } catch (err) {
    console.error('[sendNotification]', err.message);
  }
}

async function notifyDepartmentAdmins(department, { type, title, message, linkType, linkId, excludeUserId = null }) {
  try {
    const admins = await query(
      `SELECT id FROM users WHERE (system_role = 'superadmin' OR (system_role = 'admin' AND department = $1)) AND status = 'ACTIVE'`,
      [department]
    );
    for (const u of admins.rows) {
      if (excludeUserId && u.id === excludeUserId) continue;
      await sendNotification({ userId: u.id, type, title, message, linkType, linkId });
    }
  } catch (err) {
    console.error('[notifyDepartmentAdmins]', err.message);
  }
}

// ============================================================
// Health & Auth
// ============================================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const { password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const r = await query('SELECT * FROM users WHERE LOWER(username) = $1', [username]);
    const user = r.rows[0];
    if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid username or password' });
    if (user.status === 'SUSPENDED') return res.status(403).json({ error: 'This account has been suspended' });

    const now = new Date().toISOString();
    await query('UPDATE users SET last_login = $1 WHERE id = $2', [now, user.id]);
    await audit('USER_LOGIN', user.username, 'Session', user.department);
    res.json({ success: true, user: sanitizeUser({ ...user, last_login: now }, { includeSignature: true }) });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Login failed due to a server error' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const actor = await requireActor(req, res);
  if (!actor) return;
  res.json(sanitizeUser(actor, { includeSignature: true }));
});

// ============================================================
// System Administration (superadmin only)
// ============================================================
app.post('/api/system/wipe-data', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) {
      return res.status(403).json({ error: 'Only the Super Administrator can wipe system data' });
    }
    const mode = req.body?.mode || req.body?.target || 'everything';
    if (mode === 'forms') {
      await wipeFormsOnly(actor.name || actor.username);
      res.json({ success: true, message: 'All forms, templates, folders and submissions wiped successfully.' });
    } else {
      await wipeAllData(actor.name || actor.username);
      res.json({ success: true, message: 'All system data wiped successfully.' });
    }
  } catch (err) {
    console.error('[POST /api/system/wipe-data]', err);
    res.status(500).json({ error: 'Failed to wipe data: ' + (err.message || 'Unknown error') });
  }
});

// ============================================================
// Users (super admin manages; everyone can list)
// ============================================================
app.get('/api/users', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM users ORDER BY name ASC');
    res.json(r.rows.map(u => sanitizeUser(u, { includeSignature: true })));
  } catch (err) {
    console.error('[GET users]', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can create users' });

    const { username, name, password, department, systemRole, email } = req.body;
    const cleanUsername = String(username || '').trim().toLowerCase();
    if (!cleanUsername || !name?.trim() || !password || !department) {
      return res.status(400).json({ error: 'Username, full name, password and department are required' });
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, dot, dash or underscore' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const dept = await query('SELECT 1 FROM departments WHERE name = $1', [department]);
    if (dept.rowCount === 0) return res.status(400).json({ error: 'Selected department does not exist' });

    const cleanEmail = email?.trim() ? email.trim().toLowerCase() : null;
    const existing = await query(
      'SELECT id FROM users WHERE LOWER(username) = $1 OR ($2::text IS NOT NULL AND LOWER(email) = $2)',
      [cleanUsername, cleanEmail]
    );
    if (existing.rowCount > 0) return res.status(409).json({ error: 'A user with this username or email already exists' });

    const role = systemRole === 'admin' ? 'admin' : 'user';
    const id = `user.${Date.now()}`;
    const pkiData = generateUserCertificate({ id, name: name.trim(), username: cleanUsername, email: cleanEmail, department });
    await query(
      `INSERT INTO users (id, username, name, email, password, role, system_role, department, ad_group, avatar, status, allowed_tabs, created_at, last_login,
         pki_certificate_pem, pki_public_key_pem, pki_private_key_pem, pki_serial_number, pki_fingerprint, pki_issued_at, pki_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, 'ACTIVE', '[]'::jsonb, NOW(), 'Never', $9, $10, $11, $12, $13, $14, $15)`,
      [id, cleanUsername, name.trim(), cleanEmail, password, role === 'admin' ? 'Department Admin' : 'User', role, department,
        pkiData.certificatePem, pkiData.publicKeyPem, pkiData.privateKeyPem, pkiData.serialNumber, pkiData.fingerprint, pkiData.issuedAt, pkiData.expiresAt]
    );
    await audit('USER_CREATED', actor.username, cleanUsername, department);
    res.status(201).json(sanitizeUser(await getUserById(id)));
  } catch (err) {
    console.error('[POST users]', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can edit users' });
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { name, department, systemRole, password } = req.body;
    let role = normalizeRole(target.system_role);
    if (!isSuper(target) && systemRole) role = systemRole === 'admin' ? 'admin' : 'user';
    if (department) {
      const dept = await query('SELECT 1 FROM departments WHERE name = $1', [department]);
      if (dept.rowCount === 0) return res.status(400).json({ error: 'Selected department does not exist' });
    }
    await query(
      `UPDATE users SET name = COALESCE($1, name), department = COALESCE($2, department),
         system_role = $3, role = $4, password = COALESCE($5, password) WHERE id = $6`,
      [name?.trim() || null, department || null, role,
      role === 'superadmin' ? 'Super Administrator' : role === 'admin' ? 'Department Admin' : 'User',
      password || null, target.id]
    );
    await audit('USER_UPDATED', actor.username, target.username, department || target.department);
    res.json(sanitizeUser(await getUserById(target.id)));
  } catch (err) {
    console.error('[PUT users]', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.patch('/api/users/:id/status', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can change account status' });
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === actor.id || isSuper(target)) return res.status(400).json({ error: 'The Super Administrator account cannot be suspended' });

    const next = target.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await query('UPDATE users SET status = $1 WHERE id = $2', [next, target.id]);
    await audit(next === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_SUSPENDED', actor.username, target.username, target.department);
    res.json({ id: target.id, status: next });
  } catch (err) {
    console.error('[PATCH users status]', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can delete users' });
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === actor.id || isSuper(target)) return res.status(400).json({ error: 'The Super Administrator account cannot be deleted' });

    await query('DELETE FROM users WHERE id = $1', [target.id]);
    await audit('USER_DELETED', actor.username, target.username, target.department);
    res.json({ success: true, id: target.id });
  } catch (err) {
    console.error('[DELETE users]', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Each user manages only their own signature
app.put('/api/users/:id/signature', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (actor.id !== req.params.id) return res.status(403).json({ error: 'You can only change your own signature' });
    const { signature } = req.body;
    if (signature && !/^data:image\/png;base64,/.test(signature)) {
      return res.status(400).json({ error: 'Signature must be a PNG image' });
    }
    await query('UPDATE users SET signature_image = $1 WHERE id = $2', [signature || null, actor.id]);
    await audit(signature ? 'SIGNATURE_SAVED' : 'SIGNATURE_CLEARED', actor.username, 'Personal signature', actor.department);
    res.json(sanitizeUser(await getUserById(actor.id), { includeSignature: true }));
  } catch (err) {
    console.error('[PUT signature]', err);
    res.status(500).json({ error: 'Failed to save signature' });
  }
});

// Profile picture / avatar (user updates their own; superadmin can update any)
app.put('/api/users/:id/avatar', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (actor.id !== req.params.id && !isSuper(actor)) {
      return res.status(403).json({ error: 'You can only change your own profile picture' });
    }
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { avatar } = req.body;
    if (avatar && typeof avatar === 'string' && !avatar.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Profile picture must be a valid image' });
    }
    if (avatar && typeof avatar === 'string' && avatar.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image file is too large (maximum 5MB)' });
    }

    const cleanAvatar = avatar && typeof avatar === 'string' && avatar.trim() ? avatar.trim() : null;
    await query('UPDATE users SET avatar = $1 WHERE id = $2', [cleanAvatar, target.id]);
    await audit(cleanAvatar ? 'AVATAR_UPDATED' : 'AVATAR_CLEARED', actor.username, target.username, target.department);
    const updated = await getUserById(target.id);
    res.json(sanitizeUser(updated, { includeSignature: actor.id === target.id }));
  } catch (err) {
    console.error('[PUT avatar]', err);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
});

// ============================================================
// PKI Digital Certificates (X.509 v3 & RSA 2048-bit Key Pair)
// ============================================================
app.get('/api/users/:id/pki-certificate', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    let target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // If user lacks certificate, provision on the fly
    if (!target.pki_certificate_pem || !target.pki_private_key_pem) {
      const pkiData = generateUserCertificate(target);
      await query(`
        UPDATE users
        SET pki_certificate_pem = $1, pki_public_key_pem = $2, pki_private_key_pem = $3,
            pki_serial_number = $4, pki_fingerprint = $5, pki_issued_at = $6, pki_expires_at = $7
        WHERE id = $8
      `, [pkiData.certificatePem, pkiData.publicKeyPem, pkiData.privateKeyPem, pkiData.serialNumber, pkiData.fingerprint, pkiData.issuedAt, pkiData.expiresAt, target.id]);
      target = await getUserById(target.id);
    }

    const parsed = parseCertificateInfo(target.pki_certificate_pem);
    res.json({
      userId: target.id,
      username: target.username,
      name: target.name,
      department: target.department,
      serialNumber: target.pki_serial_number,
      fingerprint: target.pki_fingerprint,
      issuedAt: target.pki_issued_at,
      expiresAt: target.pki_expires_at,
      certificatePem: target.pki_certificate_pem,
      publicKeyPem: target.pki_public_key_pem,
      parsed
    });
  } catch (err) {
    console.error('[GET pki-certificate]', err);
    res.status(500).json({ error: 'Failed to retrieve certificate details' });
  }
});

// Re-issue / renew PKI certificate
app.post('/api/users/:id/pki-certificate/generate', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (actor.id !== req.params.id && !isSuper(actor)) {
      return res.status(403).json({ error: 'You can only renew your own PKI certificate' });
    }
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const pkiData = generateUserCertificate(target);
    await query(`
      UPDATE users
      SET pki_certificate_pem = $1, pki_public_key_pem = $2, pki_private_key_pem = $3,
          pki_serial_number = $4, pki_fingerprint = $5, pki_issued_at = $6, pki_expires_at = $7
      WHERE id = $8
    `, [pkiData.certificatePem, pkiData.publicKeyPem, pkiData.privateKeyPem, pkiData.serialNumber, pkiData.fingerprint, pkiData.issuedAt, pkiData.expiresAt, target.id]);

    await audit('PKI_CERTIFICATE_ISSUED', actor.username, `Certificate renewed for ${target.username} (${pkiData.serialNumber})`, target.department);

    res.json({
      success: true,
      serialNumber: pkiData.serialNumber,
      fingerprint: pkiData.fingerprint,
      issuedAt: pkiData.issuedAt,
      expiresAt: pkiData.expiresAt,
      certificatePem: pkiData.certificatePem,
      publicKeyPem: pkiData.publicKeyPem,
      parsed: parseCertificateInfo(pkiData.certificatePem)
    });
  } catch (err) {
    console.error('[POST pki-certificate/generate]', err);
    res.status(500).json({ error: 'Failed to generate PKI certificate' });
  }
});

// Download public X.509 certificate (.crt file)
app.get('/api/users/:id/pki-certificate/download', async (req, res) => {
  try {
    const target = await getUserById(req.params.id);
    if (!target || !target.pki_certificate_pem) return res.status(404).json({ error: 'Certificate not found' });
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', `attachment; filename="${target.username}_smartdoc.crt"`);
    res.send(target.pki_certificate_pem);
  } catch (err) {
    console.error('[GET pki-certificate/download]', err);
    res.status(500).json({ error: 'Failed to download certificate' });
  }
});

// ============================================================
// Departments
// ============================================================
app.get('/api/departments', async (req, res) => {
  try {
    const r = await query('SELECT * FROM departments ORDER BY name ASC');
    res.json(r.rows.map(mapDepartment));
  } catch (err) {
    console.error('[GET departments]', err);
    res.status(500).json({ error: 'Failed to load departments' });
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can create departments' });
    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!name || !code) return res.status(400).json({ error: 'Department name and code are required' });

    const existing = await query('SELECT id FROM departments WHERE UPPER(code) = $1 OR LOWER(name) = LOWER($2)', [code, name]);
    if (existing.rowCount > 0) return res.status(409).json({ error: 'Department name or code already exists' });

    const id = `dept-${code.toLowerCase()}-${Date.now()}`;
    await query(
      `INSERT INTO departments (id, name, code, manager, sla_hours, description, status, created_at)
       VALUES ($1, $2, $3, NULL, 48, $4, 'ACTIVE', NOW())`,
      [id, name, code, String(req.body.description || '').trim()]
    );
    await audit('DEPARTMENT_CREATED', actor.username, name, name);
    const created = await query('SELECT * FROM departments WHERE id = $1', [id]);
    res.status(201).json(mapDepartment(created.rows[0]));
  } catch (err) {
    console.error('[POST departments]', err);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

app.put('/api/departments/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can edit departments' });

    const d = await query('SELECT * FROM departments WHERE id = $1', [req.params.id]);
    if (d.rowCount === 0) return res.status(404).json({ error: 'Department not found' });
    const dept = d.rows[0];

    const name = String(req.body.name ?? dept.name).trim();
    const code = String(req.body.code ?? dept.code).trim().toUpperCase();
    const description = req.body.description !== undefined ? String(req.body.description || '').trim() : (dept.description || '');
    if (!name || !code) return res.status(400).json({ error: 'Department name and code are required' });

    const duplicate = await query(
      'SELECT id FROM departments WHERE id != $1 AND (UPPER(code) = $2 OR LOWER(name) = LOWER($3))',
      [dept.id, code, name]
    );
    if (duplicate.rowCount > 0) {
      return res.status(409).json({ error: 'Another department with this name or code already exists' });
    }

    const oldName = dept.name;
    const oldCode = dept.code;

    await query(
      `UPDATE departments SET name = $1, code = $2, description = $3 WHERE id = $4`,
      [name, code, description, dept.id]
    );

    // Cascade department rename / code update across all referencing records
    if (oldName !== name || oldCode !== code) {
      await query(
        `UPDATE users SET department = $1, ad_group = $2 WHERE department = $3`,
        [name, `AD_${code}`, oldName]
      );
    }

    if (oldName !== name) {
      await query(`UPDATE folders SET department = $1, updated_at = NOW() WHERE department = $2`, [name, oldName]);
      await query(`UPDATE form_templates SET department = $1, updated_at = NOW() WHERE department = $2`, [name, oldName]);
      await query(`UPDATE form_submissions SET department = $1, updated_at = NOW() WHERE department = $2`, [name, oldName]);
      await query(`UPDATE department_messages SET department = $1 WHERE department = $2`, [name, oldName]);
      await query(`UPDATE template_reviews SET department = $1, updated_at = NOW() WHERE department = $2`, [name, oldName]);
      await query(`UPDATE template_review_reviewers SET department = $1 WHERE department = $2`, [name, oldName]);
      await query(`UPDATE audit_logs SET department = $1 WHERE department = $2`, [name, oldName]);

      // Update JSONB workflow steps and allowed_departments in form_templates
      const tmpls = await query(`SELECT id, workflow, allowed_departments, signature_slots FROM form_templates`);
      for (const row of tmpls.rows) {
        const wf = parseJson(row.workflow, []);
        const allowedDepts = parseJson(row.allowed_departments, []);
        const sigSlots = parseJson(row.signature_slots, []);
        let changed = false;

        const nextWf = wf.map(step => {
          if (step && step.department === oldName) {
            changed = true;
            return { ...step, department: name };
          }
          return step;
        });
        const nextAllowed = allowedDepts.map(dn => {
          if (dn === oldName) {
            changed = true;
            return name;
          }
          return dn;
        });
        const nextSigSlots = sigSlots.map(sl => {
          if (sl === oldName) {
            changed = true;
            return name;
          }
          return sl;
        });

        if (changed) {
          await query(
            `UPDATE form_templates SET workflow = $1::jsonb, allowed_departments = $2::jsonb, signature_slots = $3::jsonb WHERE id = $4`,
            [JSON.stringify(nextWf), JSON.stringify(nextAllowed), JSON.stringify(nextSigSlots), row.id]
          );
        }
      }

      // Update JSONB workflow steps in form_submissions
      const subs = await query(`SELECT id, workflow FROM form_submissions`);
      for (const row of subs.rows) {
        const wf = parseJson(row.workflow, []);
        let changed = false;
        const nextWf = wf.map(step => {
          if (step && step.department === oldName) {
            changed = true;
            return { ...step, department: name };
          }
          return step;
        });
        if (changed) {
          await query(`UPDATE form_submissions SET workflow = $1::jsonb WHERE id = $2`, [JSON.stringify(nextWf), row.id]);
        }
      }
    }

    await audit(
      'DEPARTMENT_UPDATED',
      actor.username,
      oldName !== name ? `${oldName} → ${name} (${code})` : `${name} (${code})`,
      name
    );

    const updated = await query('SELECT * FROM departments WHERE id = $1', [dept.id]);
    res.json(mapDepartment(updated.rows[0]));
  } catch (err) {
    console.error('[PUT departments]', err);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

app.delete('/api/departments/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isSuper(actor)) return res.status(403).json({ error: 'Only the Super Administrator can delete departments' });
    const d = await query('SELECT * FROM departments WHERE id = $1', [req.params.id]);
    if (d.rowCount === 0) return res.status(404).json({ error: 'Department not found' });
    const dept = d.rows[0];
    const members = await query('SELECT COUNT(*)::int AS c FROM users WHERE department = $1', [dept.name]);
    if (members.rows[0].c > 0) {
      return res.status(409).json({ error: `Move or delete the ${members.rows[0].c} user(s) in ${dept.name} first` });
    }
    await query('DELETE FROM departments WHERE id = $1', [dept.id]);
    await audit('DEPARTMENT_DELETED', actor.username, dept.name, dept.name);
    res.json({ success: true, id: dept.id });
  } catch (err) {
    console.error('[DELETE departments]', err);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// ============================================================
// Explorer Folders (Windows Explorer hierarchical department structure)
// ============================================================
function mapFolder(f) {
  return {
    id: f.id,
    name: f.name,
    department: f.department,
    parentId: f.parent_id || null,
    createdById: f.created_by_id,
    createdByName: f.created_by_name,
    createdAt: f.created_at,
    updatedAt: f.updated_at
  };
}

app.get('/api/folders', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const { department } = req.query;
    let r;
    if (department) {
      r = await query('SELECT * FROM folders WHERE department = $1 ORDER BY name ASC', [department]);
    } else {
      r = await query('SELECT * FROM folders ORDER BY department ASC, name ASC');
    }
    res.json(r.rows.map(mapFolder));
  } catch (err) {
    console.error('[GET folders]', err);
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

app.post('/api/folders', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const { name, department, parentId } = req.body;
    const targetDept = String(department || actor.department || '').trim();

    if (!isDeptAdmin(actor, targetDept)) {
      return res.status(403).json({ error: `You do not have permission to create folders in ${targetDept}` });
    }
    const dept = targetDept;

    const cleanName = String(name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Folder name is required' });
    if (cleanName.length > 100) return res.status(400).json({ error: 'Folder name must be under 100 characters' });

    const deptCheck = await query('SELECT name FROM departments WHERE name = $1', [dept]);
    if (deptCheck.rowCount === 0) return res.status(400).json({ error: 'Department does not exist' });

    if (parentId) {
      const parentCheck = await query('SELECT id, department FROM folders WHERE id = $1', [parentId]);
      if (parentCheck.rowCount === 0) return res.status(400).json({ error: 'Parent folder not found' });
      if (parentCheck.rows[0].department !== dept) {
        return res.status(400).json({ error: 'Parent folder belongs to a different department' });
      }
    }

    const dupCheck = await query(
      'SELECT id FROM folders WHERE department = $1 AND COALESCE(parent_id, \'\') = $2 AND LOWER(name) = LOWER($3)',
      [dept, parentId || '', cleanName]
    );
    if (dupCheck.rowCount > 0) {
      return res.status(400).json({ error: 'A folder with this name already exists in this location' });
    }

    const id = `fld_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await query(
      `INSERT INTO folders (id, name, department, parent_id, created_by_id, created_by_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [id, cleanName, dept, parentId || null, actor.id, actor.name]
    );

    await audit('FOLDER_CREATED', actor.username, cleanName, dept);
    const created = await query('SELECT * FROM folders WHERE id = $1', [id]);
    res.status(201).json(mapFolder(created.rows[0]));
  } catch (err) {
    console.error('[POST folders]', err);
    res.status(400).json({ error: err.message || 'Failed to create folder' });
  }
});

app.put('/api/folders/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM folders WHERE id = $1', [req.params.id]);
    const folder = r.rows[0];
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    if (!isDeptAdmin(actor, folder.department)) {
      return res.status(403).json({ error: 'You do not have permission to modify folders in this department' });
    }

    const cleanName = String(req.body.name || '').trim();
    if (!cleanName) return res.status(400).json({ error: 'Folder name is required' });
    if (cleanName.length > 100) return res.status(400).json({ error: 'Folder name must be under 100 characters' });

    const dupCheck = await query(
      'SELECT id FROM folders WHERE department = $1 AND COALESCE(parent_id, \'\') = $2 AND LOWER(name) = LOWER($3) AND id != $4',
      [folder.department, folder.parent_id || '', cleanName, folder.id]
    );
    if (dupCheck.rowCount > 0) {
      return res.status(400).json({ error: 'A folder with this name already exists in this location' });
    }

    await query('UPDATE folders SET name = $1, updated_at = NOW() WHERE id = $2', [cleanName, folder.id]);
    await audit('FOLDER_RENAMED', actor.username, `${folder.name} -> ${cleanName}`, folder.department);

    const updated = await query('SELECT * FROM folders WHERE id = $1', [folder.id]);
    res.json(mapFolder(updated.rows[0]));
  } catch (err) {
    console.error('[PUT folders]', err);
    res.status(400).json({ error: err.message || 'Failed to rename folder' });
  }
});

app.delete('/api/folders/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM folders WHERE id = $1', [req.params.id]);
    const folder = r.rows[0];
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    if (!isDeptAdmin(actor, folder.department)) {
      return res.status(403).json({ error: 'You do not have permission to delete folders in this department' });
    }

    // Set templates and submissions in this folder to the parent folder so they are not orphaned
    await query('UPDATE form_templates SET folder_id = $1 WHERE folder_id = $2', [folder.parent_id || null, folder.id]);
    await query('UPDATE form_submissions SET folder_id = $1 WHERE folder_id = $2', [folder.parent_id || null, folder.id]);
    // Re-parent subfolders
    await query('UPDATE folders SET parent_id = $1 WHERE parent_id = $2', [folder.parent_id || null, folder.id]);

    await query('DELETE FROM folders WHERE id = $1', [folder.id]);
    await audit('FOLDER_DELETED', actor.username, folder.name, folder.department);

    res.json({ success: true, id: folder.id });
  } catch (err) {
    console.error('[DELETE folders]', err);
    res.status(500).json({ error: err.message || 'Failed to delete folder' });
  }
});

// ============================================================
// Word Templates (Word Form Studio & docx upload)
// ============================================================
app.post('/api/forms/templates/parse', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isAdmin(actor)) return res.status(403).json({ error: 'Only department admins can upload templates' });
    if (!req.body.fileBase64) return res.status(400).json({ error: 'No file uploaded' });
    const parsed = await parseTemplate(req.body.fileBase64);
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Full docx/doc-to-HTML parser for in-browser Word Form Studio
const handleParseWord = async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isAdmin(actor)) return res.status(403).json({ error: 'Only department admins can upload templates' });
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file uploaded' });

    const result = await parseWordDocument(fileBase64);
    res.json(result);
  } catch (err) {
    console.error('[POST parse-word / parse-docx]', err);
    res.status(400).json({ error: err.message || 'Failed to parse Word document (.doc / .docx)' });
  }
};
app.post('/api/forms/templates/parse-docx', handleParseWord);
app.post('/api/forms/templates/parse-word', handleParseWord);

// Converts HTML from Word Form Studio into a valid .docx binary
app.post('/api/forms/templates/html-to-docx', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const { html, title, fontFamily, fontSize } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML content required' });

    const docxBuffer = await compileHtmlToValidDocx(html, {
      title: title || 'SmartDoc Form Template',
      fontFamily,
      fontSize
    });
    res.json({ fileBase64: docxBuffer.toString('base64') });
  } catch (err) {
    console.error('[POST html-to-docx]', err);
    res.status(500).json({ error: err.message || 'Failed to generate Word document from editor' });
  }
});

// ============================================================
// AI Form Generator (Dual Offline: Instant NLP + Local Ollama)
// ============================================================
app.get('/api/ai/ollama-status', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const status = await getOllamaStatus();
    res.json(status);
  } catch (err) {
    res.json({ online: false, models: [], defaultModel: '', error: err.message });
  }
});

app.get('/api/ai/ollama-logs', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    res.json({ logs: getOllamaLogs() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load Ollama logs' });
  }
});

app.delete('/api/ai/ollama-logs', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    res.json(clearOllamaLogs());
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to clear Ollama logs' });
  }
});

app.post('/api/ai/generate-form', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isAdmin(actor)) return res.status(403).json({ error: 'Only department admins can generate forms with AI' });

    const { prompt, department, style, complexity, sections, engineMode, ollamaModel } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await generateFormWithAi({
      prompt: prompt.trim(),
      department: department || actor.department,
      style: style || 'form',
      complexity: complexity || 'standard',
      sections: sections || {},
      engineMode: engineMode || 'builtin',
      ollamaModel: ollamaModel || ''
    });

    res.json(result);
  } catch (err) {
    console.error('[POST /api/ai/generate-form]', err);
    res.status(500).json({ error: err.message || 'Failed to generate form with AI' });
  }
});

app.get('/api/forms/templates', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query(
      `SELECT * FROM form_templates WHERE status IN ('ACTIVE', 'DRAFT') ORDER BY created_at DESC`
    );
    res.json(r.rows.filter(t => canSeeTemplate(actor, t)).map(mapTemplate));
  } catch (err) {
    console.error('[GET templates]', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

app.get('/api/forms/templates/:id/file', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template file not found' });
    if (!canSeeTemplate(actor, t)) return res.status(403).json({ error: 'You do not have access to this template' });

    const fileType = t.file_type || 'docx';
    const filename = t.docx_filename || (fileType === 'pdf' ? 'document.pdf' : fileType === 'image' ? 'document.png' : 'template.docx');
    const isWordDoc = (fileType === 'docx' || fileType === 'doc') && t.is_editable !== false;

    // For Word templates:
    // - When ?download=1 or ?rendered=1 is requested, render a Filling-Form-style .docx
    //   (same fonts, header mark, resolved system tags, field labels, and '—' instead of placeholders).
    // - Otherwise, ensure the raw .docx package passes OpenXML/OPC repair before sending.
    if (isWordDoc) {
      const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const downloadFilename = filename.replace(/\.doc$/i, '.docx');

      if ((req.query.download === '1' || req.query.rendered === '1') && t.html_content) {
        const renderedBuf = await renderTemplateAsWordDocx(t, actor);
        res.setHeader('Content-Type', docxMime);
        res.setHeader('Content-Length', renderedBuf.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
        return res.send(renderedBuf);
      }

      let rawBuf = getTemplateBuffer(t.id, t.file_path);
      if (!rawBuf && t.docx_base64) {
        const clean = String(t.docx_base64).replace(/^data:[^;]+;base64,/, '').trim();
        rawBuf = Buffer.from(clean, 'base64');
      }
      if (!rawBuf && t.html_content) {
        rawBuf = await compileHtmlToValidDocx(t.html_content, {
          title: t.title || 'SmartDoc Form Template',
          fontFamily: t.font_family,
          fontSize: t.font_size
        });
      }
      if (rawBuf) {
        const repairedBuf = repairDocxBuffer(rawBuf, {
          fontFamily: t.font_family,
          fontSize: t.font_size
        });
        res.setHeader('Content-Type', docxMime);
        res.setHeader('Content-Length', repairedBuf.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
        return res.send(repairedBuf);
      }
    }

    // 1. Try direct streaming from disk storage (PDF / image)
    const streamed = streamTemplateFile(t.id, t.file_path, res, filename, fileType);
    if (streamed) return;

    // 2. Fallback to database docx_base64
    if (t.docx_base64) {
      const mime = getMimeType(filename, fileType);
      const disposition = (fileType === 'pdf' || fileType === 'image') ? 'inline' : 'attachment';
      const clean = String(t.docx_base64).replace(/^data:[^;]+;base64,/, '').trim();
      const buf = Buffer.from(clean, 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);
      return res.send(buf);
    }

    res.status(404).json({ error: 'Template file not found on disk or database' });
  } catch (err) {
    console.error('[GET template file]', err);
    res.status(500).json({ error: 'Failed to load template file' });
  }
});

// Render a template for high-fidelity Word printing (blank or with filled answers & user signature)
app.post('/api/forms/templates/:id/render-print-document', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });
    if (!canSeeTemplate(actor, t)) return res.status(403).json({ error: 'You do not have access to this template' });

    const fileType = t.file_type || 'docx';
    if (fileType === 'pdf') {
      const streamed = streamTemplateFile(t.id, t.file_path, res, t.docx_filename || 'document.pdf', 'pdf');
      if (streamed) return;
      if (t.docx_base64) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(t.docx_filename || 'document.pdf')}"`);
        return res.send(Buffer.from(t.docx_base64, 'base64'));
      }
    }
    if (fileType === 'image') {
      const streamed = streamTemplateFile(t.id, t.file_path, res, t.docx_filename || 'image.png', 'image');
      if (streamed) return;
      if (t.docx_base64) {
        const fn = (t.docx_filename || '').toLowerCase();
        const mime = fn.endsWith('.png') ? 'image/png' : fn.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(t.docx_filename || 'image.png')}"`);
        return res.send(Buffer.from(t.docx_base64, 'base64'));
      }
    }

    const { values = {}, blank = false, customHtml = null } = req.body || {};

    let templateBase64 = getTemplateBase64(t.id, t.file_path) || t.docx_base64;
    if (!templateBase64 && (customHtml || t.html_content)) {
      const docxBuf = await compileHtmlToValidDocx(customHtml || t.html_content, {
        title: t.title || 'SmartDoc Form',
        fontFamily: t.font_family,
        fontSize: t.font_size
      });
      templateBase64 = docxBuf.toString('base64');
    }

    if (!templateBase64) {
      return res.status(400).json({ error: 'Word template data not available' });
    }

    const system = {
      'Form ID': blank ? '________________' : (t.unique_code || `DRAFT-${todayStr().replace(/-/g, '')}`),
      'Submitted By': blank ? '________________' : actor.name,
      'Submitted Date': blank ? '________________' : todayStr(),
      'Version': t.version_history ? `v${t.version || '1.0'}` : 'v1.0',
      'Department': t.department
    };

    const signatures = [];
    const userSig = actor.signature_image || actor.signature || actor.signatureImage;
    if (!blank && userSig) {
      const sigData = {
        name: actor.name,
        date: todayStr(),
        image: userSig,
        pkiFingerprint: actor.pki_fingerprint,
        pkiSerial: actor.pki_serial_number
      };
      signatures.push({ slot: 'Submitter', label: 'Submitter Signature', ...sigData });
      signatures.push({ slot: 'Applicant', label: 'Applicant Signature', ...sigData });
      signatures.push({ slot: 'Originator', label: 'Originator Signature', ...sigData });
    }

    const templateFields = parseJson(t.fields, []);

    const buf = renderFilledDocument(templateBase64, {
      values: parseJson(values, values),
      system,
      signatures,
      fields: templateFields,
      blank: !!blank
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(t.title || 'document')}_${blank ? 'Blank' : 'Filled'}.docx"`);
    res.send(buf);
  } catch (err) {
    console.error('[POST render-print-document]', err);
    res.status(500).json({ error: err.message || 'Failed to render Word document for printing' });
  }
});

// Helper to check for duplicate templates/documents in the same folder or root
async function findDuplicateTemplateInFolder({ department, folderId, title, fileName, excludeId = null }) {
  const cleanTitle = String(title || '').trim().toLowerCase();
  const cleanFileName = String(fileName || '').trim().toLowerCase();
  if (!cleanTitle && !cleanFileName) return null;

  let sql = `
    SELECT id, title, docx_filename FROM form_templates
    WHERE department = $1
      AND status != 'ARCHIVED'
  `;
  const params = [department];

  const cleanFolderId = folderId ? String(folderId).trim() : '';
  if (cleanFolderId) {
    sql += ` AND folder_id = $${params.length + 1}`;
    params.push(cleanFolderId);
  } else {
    sql += ` AND folder_id IS NULL`;
  }

  if (excludeId) {
    sql += ` AND id != $${params.length + 1}`;
    params.push(excludeId);
  }

  const conditions = [];
  if (cleanTitle) {
    params.push(cleanTitle);
    conditions.push(`LOWER(TRIM(title)) = $${params.length}`);
  }
  if (cleanFileName) {
    params.push(cleanFileName);
    conditions.push(`LOWER(TRIM(COALESCE(docx_filename, ''))) = $${params.length}`);
  }

  if (conditions.length > 0) {
    sql += ` AND (${conditions.join(' OR ')})`;
  }

  sql += ` LIMIT 1`;

  const res = await query(sql, params);
  return res.rows[0] || null;
}

app.post('/api/forms/templates', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isAdmin(actor)) return res.status(403).json({ error: 'Only department admins can create templates' });

    const {
      title, description, department, audience, fileName,
      fileBase64: rawFileBase64, htmlContent, fontFamily, fontSize, fields, workflow,
      defaultExpiryDays, folderId, fileType: rawFileType,
      accessType, allowedDepartments, allowedUsers
    } = req.body;

    const targetDept = String(department || actor.department || '').trim();
    if (!isDeptAdmin(actor, targetDept)) {
      return res.status(403).json({ error: `You do not have permission to create templates in ${targetDept}` });
    }
    const dept = targetDept;
    if (!title?.trim()) return res.status(400).json({ error: 'Template title is required' });

    // Determine file type
    const fn = String(fileName || '').toLowerCase();
    let detectedType = rawFileType;
    if (!detectedType) {
      if (fn.endsWith('.pdf')) detectedType = 'pdf';
      else if (/\.(png|jpe?g|webp)$/i.test(fn)) detectedType = 'image';
      else if (fn.endsWith('.doc')) detectedType = 'doc';
      else detectedType = 'docx';
    }
    const fileType = detectedType;
    const isEditable = fileType === 'docx' || fileType === 'doc';

    let finalHtmlContent = htmlContent || null;
    let fileBase64 = rawFileBase64;
    // If created via Word Form Studio, generate valid .docx binary from HTML
    if (htmlContent && !fileBase64 && (fileType === 'docx' || fileType === 'doc')) {
      const docxBuffer = await compileHtmlToValidDocx(htmlContent, {
        title: title.trim(),
        fontFamily,
        fontSize
      });
      fileBase64 = docxBuffer.toString('base64');
    } else if (fileBase64 && (fileType === 'docx' || /\.docx$/i.test(fileName || ''))) {
      try {
        const clean = String(fileBase64).replace(/^data:[^;]+;base64,/, '').trim();
        const repaired = repairDocxBuffer(Buffer.from(clean, 'base64'), { fontFamily, fontSize });
        fileBase64 = repaired.toString('base64');
      } catch (_) {}
    }

    if (!fileBase64) return res.status(400).json({ error: 'Please upload a file or design a form in Word Studio' });

    if (folderId) {
      const fCheck = await query('SELECT id, department FROM folders WHERE id = $1', [folderId]);
      if (fCheck.rowCount === 0) return res.status(400).json({ error: 'Folder not found' });
      if (fCheck.rows[0].department !== dept) return res.status(400).json({ error: 'Folder belongs to a different department' });
    }

    const duplicate = await findDuplicateTemplateInFolder({
      department: dept,
      folderId,
      title: title.trim(),
      fileName
    });
    if (duplicate) {
      return res.status(409).json({
        error: `A document named "${duplicate.title || duplicate.docx_filename}" already exists in this folder. Duplicate files are not allowed in the same folder.`
      });
    }

    let cleanFields = [];
    let parsedSigSlots = [];
    let parsedSysTags = [];
    const isWord = fileType === 'docx' || fileType === 'doc' || /\.(docx|doc)$/i.test(fileName || '');

    if (isWord) {
      let parsed = { fields: [], signatureSlots: [], systemTags: [] };
      try {
        parsed = await parseTemplate(fileBase64);
      } catch (err) {
        console.warn('[POST templates] parseTemplate note:', err.message);
      }

      // Convert docx/doc binary to HTML so Word Form Studio can immediately open it if needed
      if (!finalHtmlContent && fileBase64) {
        try {
          const wordRes = await parseWordDocument(fileBase64);
          finalHtmlContent = wordRes.html || null;
        } catch (err) {
          console.warn('[POST templates] parseWordDocument warning:', err.message);
        }
      }

      // If the template was uploaded as a legacy .doc, compile finalHtmlContent into a valid .docx
      // binary so docxtemplater and docx-preview can process it seamlessly as a .docx
      if ((fileType === 'doc' || /\.doc$/i.test(fileName || '')) && finalHtmlContent) {
        try {
          const docxBuffer = await compileHtmlToValidDocx(finalHtmlContent, {
            title: title || 'SmartDoc Form Template',
            fontFamily,
            fontSize
          });
          fileBase64 = docxBuffer.toString('base64');
        } catch (err) {
          console.warn('[POST templates] compileHtmlToValidDocx conversion for .doc note:', err.message);
        }
      }

      const settings = new Map();
      (Array.isArray(fields) ? fields : []).forEach(f => {
        if (!f) return;
        if (f.key) settings.set(String(f.key).toLowerCase(), f);
        if (f.label) settings.set(String(f.label).toLowerCase(), f);
      });
      const allowedTypes = ['text', 'textarea', 'number', 'date', 'select', 'dropdown', 'checkbox'];
      const allowedWidths = [25, 33, 50, 66, 75, 100];

      // Combine detected fields with any explicitly provided custom fields
      const allFieldKeys = Array.from(new Set([
        ...parsed.fields,
        ...(Array.isArray(fields) ? fields.map(f => f.key) : [])
      ])).filter(Boolean);

      cleanFields = allFieldKeys.map(key => {
        const s = settings.get(key.toLowerCase()) || {};
        const w = parseInt(s.width, 10);
        return {
          key,
          label: s.label || key,
          required: !!s.required,
          type: allowedTypes.includes(s.type) ? s.type : 'text',
          mode: s.mode === 'input' ? 'input' : 'placeholder',
          bold: !!(s.bold || s.isBold),
          options: Array.isArray(s.options) ? s.options : (typeof s.options === 'string' ? s.options.split(',').map(x => x.trim()).filter(Boolean) : []),
          placeholder: String(s.placeholder || '').trim(),
          description: String(s.description || '').trim(),
          width: allowedWidths.includes(w) ? w : null
        };
      });
      parsedSigSlots = parsed.signatureSlots || [];
      parsedSysTags = parsed.systemTags || [];
    }

    const deptRows = await query('SELECT name FROM departments');
    const deptNames = new Set(deptRows.rows.map(d => d.name));
    if (!deptNames.has(dept)) return res.status(400).json({ error: 'Template department does not exist' });

    const steps = (Array.isArray(workflow) ? workflow : [])
      .map(w => (typeof w === 'string' ? w : w?.department))
      .filter(Boolean);
    const cleanWorkflow = steps.map((department, i) => ({ step: i + 1, department }));
    const isDraft = !!(req.body.isDraft || req.body.status === 'DRAFT');
    const finalStatus = isDraft ? 'DRAFT' : 'ACTIVE';
    if (isEditable && !isDraft && cleanWorkflow.length === 0) {
      return res.status(400).json({ error: 'At least one department in the sequential approval workflow is required to publish' });
    }

    const codeRow = await query('SELECT code FROM departments WHERE name = $1', [dept]);
    const deptCode = codeRow.rows[0]?.code || 'GEN';
    const seqRow = await query('SELECT COUNT(*)::int AS c FROM form_templates WHERE unique_code LIKE $1', [`TPL-${deptCode}-%`]);
    const code = `TPL-${deptCode}-${String(seqRow.rows[0].c + 1).padStart(3, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const id = `TMPL-${Date.now()}`;
    const expiryDays = Math.min(Math.max(parseInt(defaultExpiryDays, 10) || 14, 1), 365);

    const initialCommit = [{
      commitId: crypto.randomBytes(3).toString('hex'),
      version: '1.0',
      author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
      timestamp: new Date().toISOString(),
      summary: !isEditable ? `Uploaded static ${fileType.toUpperCase()} document (non-editable)` : (isDraft ? 'Saved as draft template (unpublished)' : 'Initial form template creation'),
      changeType: isDraft ? 'DRAFT' : 'CREATE',
      details: !isEditable ? 'Non-editable static document' : (isDraft ? `${cleanFields.length} fields, saved as draft` : `${cleanFields.length} fields, ${cleanWorkflow.length} approval steps`),
      changes: {
        addedFields: cleanFields.map(f => ({ label: f.label || f.key, type: f.type || 'text', required: !!f.required, mode: f.mode || 'direct', bold: !!f.bold })),
        workflow: cleanWorkflow.map(w => w.department)
      },
      fields: cleanFields,
      workflow: cleanWorkflow,
      htmlContent: finalHtmlContent || null
    }];

    const finalAccessType = accessType || (audience === 'ALL' ? 'ALL' : 'DEPARTMENTS');
    const cleanB64 = String(fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
    const actualFilename = fileName || (fileType === 'pdf' ? 'document.pdf' : fileType === 'image' ? 'document.png' : 'template.docx');

    let savedFile = null;
    if (cleanB64 && cleanB64.length > 10) {
      savedFile = saveTemplateFile(id, cleanB64, actualFilename, fileType);
    }
    const computedFileSize = savedFile ? savedFile.fileSize : (cleanB64 ? Buffer.byteLength(cleanB64, 'base64') : 0);

    await query(
      `INSERT INTO form_templates (id, unique_code, title, department, description, category, version, created_by, created_by_username,
         fields, subforms, workflow, default_expiry_days, status, docx_base64, docx_filename, audience, signature_slots, system_tags, folder_id, html_content,
         file_type, is_editable, access_type, allowed_departments, allowed_users, version_history, comments, font_family, font_size, file_size,
         file_path, file_hash, mime_type)
       VALUES ($1, $2, $3, $4, $5, 'Word Template', '1.0', $6, $7, $8::jsonb, '[]'::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18,
         $19, $20, $21, $22::jsonb, $23::jsonb, $24::jsonb, '[]'::jsonb, $25, $26, $27, $28, $29, $30)`,
      [id, code, title.trim(), dept, String(description || '').trim(), actor.name, actor.username,
        JSON.stringify(cleanFields), JSON.stringify(cleanWorkflow), expiryDays, finalStatus,
        null, actualFilename,
        finalAccessType === 'ALL' ? 'ALL' : 'DEPARTMENT', JSON.stringify(parsedSigSlots), JSON.stringify(parsedSysTags), folderId || null,
        finalHtmlContent || null,
        fileType, isEditable, finalAccessType, JSON.stringify(allowedDepartments || []), JSON.stringify(allowedUsers || []), JSON.stringify(initialCommit),
        fontFamily || null, fontSize || null, computedFileSize,
        savedFile ? savedFile.filePath : null, savedFile ? savedFile.fileHash : null, savedFile ? savedFile.mimeType : null]
    );

    await audit(isDraft ? 'TEMPLATE_DRAFT_CREATED' : 'TEMPLATE_CREATED', actor.username, `${code} ${title.trim()}`, dept);

    // Publishing the outcome of a finished review closes that review
    if (req.body.reviewId) {
      await query(
        `UPDATE template_reviews SET status = 'PUBLISHED', published_template_id = $1, updated_at = NOW()
         WHERE id = $2 AND initiator_id = $3 AND status IN ('DECIDED', 'IN_REVIEW')`,
        [id, String(req.body.reviewId), actor.id]
      );
    }
    const created = await query('SELECT * FROM form_templates WHERE id = $1', [id]);
    res.status(201).json(mapTemplate(created.rows[0]));
  } catch (err) {
    console.error('[POST templates]', err);
    res.status(400).json({ error: err.message || 'Failed to create template' });
  }
});

// Bulk Import multiple templates and documents (.docx, .doc, .pdf, images) at once
app.post('/api/forms/templates/bulk-import', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isAdmin(actor)) return res.status(403).json({ error: 'Only department admins can import documents' });

    const {
      department,
      folderId,
      audience = 'DEPARTMENT',
      defaultExpiryDays = 14,
      workflow = [],
      files = [],
      isDraft = false,
      status
    } = req.body;
    // All bulk imports are saved as unpublished drafts (status: 'DRAFT')
    const isBulkDraft = true;
    const finalBulkStatus = 'DRAFT';

    const targetDept = String(department || actor.department || '').trim();
    if (!targetDept) {
      return res.status(400).json({ error: 'Target department is required' });
    }
    if (!isDeptAdmin(actor, targetDept)) {
      return res.status(403).json({ error: `You do not have permission to import templates into ${targetDept}` });
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided for bulk import' });
    }

    const deptRows = await query('SELECT name, code FROM departments WHERE name = $1', [targetDept]);
    if (deptRows.rowCount === 0) {
      return res.status(400).json({ error: `Department ${targetDept} does not exist` });
    }
    const deptCode = deptRows.rows[0].code || 'GEN';

    if (folderId) {
      const fCheck = await query('SELECT id, department FROM folders WHERE id = $1', [folderId]);
      if (fCheck.rowCount === 0) return res.status(400).json({ error: 'Target folder not found' });
      if (fCheck.rows[0].department !== targetDept) {
        return res.status(400).json({ error: 'Folder belongs to a different department' });
      }
    }

    // Workflows are empty for drafts until an admin configures and publishes them
    let cleanWorkflow = (Array.isArray(workflow) ? workflow : [])
      .map(w => (typeof w === 'string' ? w : w?.department))
      .filter(Boolean)
      .map((deptName, i) => ({ step: i + 1, department: deptName }));

    const expiryDays = Math.min(Math.max(parseInt(defaultExpiryDays, 10) || 14, 1), 365);
    const finalAccessType = audience === 'ALL' ? 'ALL' : 'DEPARTMENTS';

    const results = [];
    let successCount = 0;
    const seenBatchTitles = new Set();
    const seenBatchFileNames = new Set();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = String(file.fileName || `document_${i + 1}`).trim();
      const fn = fileName.toLowerCase();

      try {
        let detectedType = file.fileType;
        if (!detectedType) {
          if (fn.endsWith('.pdf')) detectedType = 'pdf';
          else if (/\.(png|jpe?g|webp)$/i.test(fn)) detectedType = 'image';
          else if (fn.endsWith('.doc')) detectedType = 'doc';
          else detectedType = 'docx';
        }
        const fileType = detectedType;
        const isEditable = fileType === 'docx' || fileType === 'doc';

        // Title defaults to clean filename without extension
        let fileTitle = String(file.title || '').trim();
        if (!fileTitle) {
          fileTitle = fileName.replace(/\.[^.]+$/i, '').replace(/[_-]+/g, ' ').trim();
        }
        if (!fileTitle) fileTitle = `Document ${i + 1}`;

        const cleanT = fileTitle.toLowerCase();
        const cleanFn = fileName.toLowerCase();

        // Disallow duplicates within the same bulk import batch
        if (seenBatchFileNames.has(cleanFn) || seenBatchTitles.has(cleanT)) {
          results.push({
            fileName,
            title: fileTitle,
            status: 'failed',
            error: `Duplicate file "${fileName}" in bulk import batch. Duplicate files are not allowed in the same folder.`
          });
          continue;
        }

        // Disallow duplicates against files already existing in the target folder
        const duplicateInFolder = await findDuplicateTemplateInFolder({
          department: targetDept,
          folderId,
          title: fileTitle,
          fileName
        });
        if (duplicateInFolder) {
          results.push({
            fileName,
            title: fileTitle,
            status: 'failed',
            error: `A document named "${duplicateInFolder.title || duplicateInFolder.docx_filename}" already exists in this folder.`
          });
          continue;
        }

        seenBatchFileNames.add(cleanFn);
        seenBatchTitles.add(cleanT);

        let fileBase64 = String(file.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
        if (!fileBase64) {
          throw new Error('File payload data is empty');
        }

        let cleanFields = [];
        let parsedSigSlots = [];
        let parsedSysTags = [];
        let finalHtmlContent = null;

        if (isEditable) {
          try {
            const parsedWord = await parseWordDocument(fileBase64);
            finalHtmlContent = parsedWord.html || null;

            // If legacy .doc, compile into valid .docx
            if ((fileType === 'doc' || /\.doc$/i.test(fileName)) && finalHtmlContent) {
              const docxBuffer = await compileHtmlToValidDocx(finalHtmlContent, {
                title: fileTitle
              });
              fileBase64 = docxBuffer.toString('base64');
            } else if (fileBase64 && (fileType === 'docx' || /\.docx$/i.test(fileName))) {
              try {
                const clean = String(fileBase64).replace(/^data:[^;]+;base64,/, '').trim();
                fileBase64 = repairDocxBuffer(Buffer.from(clean, 'base64')).toString('base64');
              } catch (_) {}
            }

            cleanFields = (parsedWord.fields || []).map(key => ({
              key,
              label: key,
              required: false,
              type: 'text',
              mode: 'placeholder',
              bold: false,
              options: [],
              placeholder: '',
              description: '',
              width: null
            }));
            parsedSigSlots = parsedWord.signatureSlots || [];
            parsedSysTags = parsedWord.systemTags || [];
          } catch (parseErr) {
            console.warn(`[bulk-import] parse note for ${fileName}:`, parseErr.message);
          }
        }

        const seqRow = await query('SELECT COUNT(*)::int AS c FROM form_templates WHERE unique_code LIKE $1', [`TPL-${deptCode}-%`]);
        const code = `TPL-${deptCode}-${String(seqRow.rows[0].c + 1).padStart(3, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const id = `TMPL-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        let computedFileSize = Buffer.byteLength(fileBase64, 'base64');

        const initialCommit = [{
          commitId: crypto.randomBytes(3).toString('hex'),
          version: '1.0',
          author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
          timestamp: new Date().toISOString(),
          summary: !isEditable ? `Bulk imported static ${fileType.toUpperCase()} document` : (isBulkDraft ? `Bulk imported draft Word template (${cleanFields.length} fields)` : `Bulk imported Word template (${cleanFields.length} fields detected)`),
          changeType: isBulkDraft ? 'DRAFT' : 'CREATE',
          details: !isEditable ? 'Non-editable static document' : (isBulkDraft ? `${cleanFields.length} fields, saved as draft` : `${cleanFields.length} fields, ${cleanWorkflow.length} approval steps`),
          changes: {
            addedFields: cleanFields.map(f => ({ label: f.label || f.key, type: f.type || 'text', required: false, mode: f.mode || 'placeholder' })),
            workflow: cleanWorkflow.map(w => w.department)
          },
          fields: cleanFields,
          workflow: isEditable ? cleanWorkflow : [],
          htmlContent: finalHtmlContent
        }];

        const actualFileName = fileName || (fileType === 'pdf' ? 'document.pdf' : fileType === 'image' ? 'document.png' : 'template.docx');
        let savedFile = null;
        if (fileBase64 && String(fileBase64).trim().length > 10) {
          savedFile = saveTemplateFile(id, fileBase64, actualFileName, fileType);
        }
        if (savedFile) {
          computedFileSize = savedFile.fileSize;
        }

        await query(
          `INSERT INTO form_templates (id, unique_code, title, department, description, category, version, created_by, created_by_username,
             fields, subforms, workflow, default_expiry_days, status, docx_base64, docx_filename, audience, signature_slots, system_tags, folder_id, html_content,
             file_type, is_editable, access_type, allowed_departments, allowed_users, version_history, comments, file_size,
             file_path, file_hash, mime_type)
           VALUES ($1, $2, $3, $4, $5, 'Word Template', '1.0', $6, $7, $8::jsonb, '[]'::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18,
             $19, $20, $21, '[]'::jsonb, '[]'::jsonb, $22::jsonb, '[]'::jsonb, $23, $24, $25, $26)`,
          [
            id, code, fileTitle, targetDept, String(file.description || '').trim(), actor.name, actor.username,
            JSON.stringify(cleanFields), JSON.stringify(isEditable ? cleanWorkflow : []), expiryDays, finalBulkStatus,
            null, actualFileName,
            finalAccessType === 'ALL' ? 'ALL' : 'DEPARTMENT', JSON.stringify(parsedSigSlots), JSON.stringify(parsedSysTags), folderId || null,
            finalHtmlContent,
            fileType, isEditable, finalAccessType, JSON.stringify(initialCommit), computedFileSize,
            savedFile ? savedFile.filePath : null, savedFile ? savedFile.fileHash : null, savedFile ? savedFile.mimeType : null
          ]
        );

        await audit(isBulkDraft ? 'BULK_TEMPLATE_DRAFTS_IMPORTED' : 'BULK_TEMPLATE_IMPORTED', actor.username, `${code} ${fileTitle}`, targetDept);
        successCount++;
        results.push({
          id,
          fileName,
          title: fileTitle,
          fileType,
          status: 'success',
          fieldsCount: cleanFields.length,
          fileSize: computedFileSize
        });
      } catch (fileErr) {
        console.error(`[bulk-import] Error processing file "${fileName}":`, fileErr);
        results.push({
          fileName,
          status: 'failed',
          error: fileErr.message || 'Processing failed'
        });
      }
    }

    res.status(201).json({
      success: true,
      importedCount: successCount,
      totalCount: files.length,
      department: targetDept,
      results
    });
  } catch (err) {
    console.error('[POST bulk-import]', err);
    res.status(400).json({ error: err.message || 'Failed to bulk import files' });
  }
});

// Update / Edit an existing Form Template (seperate process from viewing/filling)
app.put('/api/forms/templates/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });

    if (!isDeptAdmin(actor, t.department)) {
      return res.status(403).json({ error: 'Only admins of the owning department can edit this form' });
    }

    if (t.is_editable === false || (t.file_type && t.file_type !== 'docx')) {
      return res.status(400).json({ error: 'PDF and image documents are static and non-editable' });
    }

    const {
      title, description, fields, workflow, htmlContent, fontFamily, fontSize,
      defaultExpiryDays, folderId, changeSummary, accessType, allowedDepartments, allowedUsers
    } = req.body;

    const nextTitle = title?.trim() || t.title;
    const nextDesc = description !== undefined ? String(description || '').trim() : t.description;
    const nextExpiry = defaultExpiryDays ? Math.min(Math.max(parseInt(defaultExpiryDays, 10) || 14, 1), 365) : t.default_expiry_days;

    const targetFolderId = folderId !== undefined ? (folderId ? String(folderId).trim() : null) : t.folder_id;
    const duplicate = await findDuplicateTemplateInFolder({
      department: t.department,
      folderId: targetFolderId,
      title: nextTitle,
      fileName: t.docx_filename,
      excludeId: t.id
    });
    if (duplicate) {
      return res.status(409).json({
        error: `A document named "${duplicate.title || duplicate.docx_filename}" already exists in this folder. Duplicate files are not allowed in the same folder.`
      });
    }

    let fileBase64 = req.body.fileBase64 || getTemplateBase64(t.id, t.file_path) || t.docx_base64;
    let cleanFields = parseJson(t.fields, []);
    let parsedSigSlots = parseJson(t.signature_slots, []);
    let parsedSysTags = parseJson(t.system_tags, []);

    const allowedTypes = ['text', 'textarea', 'number', 'date', 'select', 'dropdown', 'checkbox'];
    const allowedWidths = [25, 33, 50, 66, 75, 100];

    const mapSingleField = (key, s = {}) => {
      const w = parseInt(s.width, 10);
      return {
        key: s.key || key,
        label: s.label || s.key || key,
        required: !!s.required,
        type: allowedTypes.includes(s.type) ? s.type : 'text',
        mode: s.mode === 'input' ? 'input' : 'placeholder',
        bold: !!(s.bold || s.isBold),
        options: Array.isArray(s.options) ? s.options : (typeof s.options === 'string' ? s.options.split(',').map(x => x.trim()).filter(Boolean) : []),
        placeholder: String(s.placeholder || '').trim(),
        description: String(s.description || '').trim(),
        width: allowedWidths.includes(w) ? w : null
      };
    };

    if (htmlContent) {
      const docxBuffer = await compileHtmlToValidDocx(htmlContent, {
        title: nextTitle,
        fontFamily: fontFamily || t.font_family,
        fontSize: fontSize || t.font_size
      });
      fileBase64 = docxBuffer.toString('base64');
      const parsed = await parseTemplate(fileBase64);
      const settings = new Map();
      (Array.isArray(fields) ? fields : []).forEach(f => {
        if (!f) return;
        if (f.key) settings.set(String(f.key).toLowerCase(), f);
        if (f.label) settings.set(String(f.label).toLowerCase(), f);
      });

      const allFieldKeys = Array.from(new Set([
        ...parsed.fields,
        ...(Array.isArray(fields) ? fields.map(f => f.key) : [])
      ])).filter(Boolean);

      cleanFields = allFieldKeys.map(key => {
        const s = settings.get(key.toLowerCase()) || {};
        return mapSingleField(key, s);
      });
      parsedSigSlots = parsed.signatureSlots;
      parsedSysTags = parsed.systemTags;
    } else if (Array.isArray(fields)) {
      cleanFields = fields.map(f => mapSingleField(f.key, f));
    }

    const steps = (Array.isArray(workflow) ? workflow : parseJson(t.workflow, []))
      .map(w => (typeof w === 'string' ? w : w?.department))
      .filter(Boolean);
    const cleanWorkflow = steps.map((department, i) => ({ step: i + 1, department }));
    const isDraftUpdate = req.body.isDraft === true || req.body.status === 'DRAFT';
    const nextStatus = isDraftUpdate ? 'DRAFT' : (req.body.status === 'ACTIVE' ? 'ACTIVE' : (t.status === 'DRAFT' && cleanWorkflow.length > 0 ? 'ACTIVE' : (t.status || 'ACTIVE')));
    if (t.is_editable && nextStatus !== 'DRAFT' && cleanWorkflow.length === 0) {
      return res.status(400).json({ error: 'At least one department in the sequential approval workflow is required to publish' });
    }

    const nextVersion = bumpVersion(t.version || '1.0');
    const existingHistory = parseJson(t.version_history, []);

    const resolvedSummary = String(changeSummary || req.body.commitMessage || req.body.summary || (nextStatus === 'DRAFT' ? 'Saved draft template' : 'Updated form template definition and layout')).trim();

    // Compute granular diffs
    const prevFields = parseJson(t.fields, []);
    const prevWorkflow = parseJson(t.workflow, []);
    const prevFieldMap = new Map(prevFields.map(f => [String(f.key || f.label || f.name).toLowerCase(), f]));
    const nextFieldMap = new Map(cleanFields.map(f => [String(f.key || f.label || f.name).toLowerCase(), f]));

    const addedFields = cleanFields.filter(f => !prevFieldMap.has(String(f.key || f.label || f.name).toLowerCase()));
    const removedFields = prevFields.filter(f => !nextFieldMap.has(String(f.key || f.label || f.name).toLowerCase()));
    const modifiedFields = [];
    cleanFields.forEach(f => {
      const p = prevFieldMap.get(String(f.key || f.label || f.name).toLowerCase());
      if (p) {
        const changesList = [];
        if (p.label !== f.label) changesList.push(`Label: "${p.label}" → "${f.label}"`);
        if (p.type !== f.type) changesList.push(`Type: ${p.type} → ${f.type}`);
        if (!!p.required !== !!f.required) changesList.push(f.required ? 'Marked required' : 'Marked optional');
        if (p.mode !== f.mode && (p.mode || f.mode)) changesList.push(`Fill format: ${f.mode || 'direct'}`);
        if (p.bold !== f.bold && (p.bold || f.bold)) changesList.push(`Text weight: ${f.bold ? 'Bold' : 'Normal'}`);
        if (p.description !== f.description && (p.description || f.description)) changesList.push('Description updated');
        if ((p.width || null) !== (f.width || null)) changesList.push(`Width: ${p.width ? `${p.width}%` : 'Auto'} → ${f.width ? `${f.width}%` : 'Auto'}`);
        if (JSON.stringify(p.options || []) !== JSON.stringify(f.options || [])) changesList.push('Dropdown options updated');
        if (changesList.length > 0) {
          modifiedFields.push({ label: f.label || f.key, changes: changesList });
        }
      }
    });

    const prevSteps = prevWorkflow.map(w => typeof w === 'string' ? w : w.department);
    const nextSteps = cleanWorkflow.map(w => typeof w === 'string' ? w : w.department);
    const workflowChanged = JSON.stringify(prevSteps) !== JSON.stringify(nextSteps);

    const titleChanged = nextTitle !== t.title ? { from: t.title, to: nextTitle } : null;
    const descChanged = nextDesc !== (t.description || '') ? { from: t.description || '', to: nextDesc } : null;

    const commit = {
      commitId: crypto.randomBytes(3).toString('hex'),
      version: nextVersion,
      author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
      timestamp: new Date().toISOString(),
      summary: resolvedSummary,
      changeType: nextStatus === 'DRAFT' ? 'DRAFT' : 'UPDATE',
      details: `${cleanFields.length} fields, ${cleanWorkflow.length} approval steps`,
      changes: {
        addedFields: addedFields.map(f => ({ label: f.label || f.key, type: f.type || 'text', required: !!f.required, mode: f.mode || 'direct', bold: !!f.bold })),
        removedFields: removedFields.map(f => ({ label: f.label || f.key, type: f.type || 'text' })),
        modifiedFields,
        workflowChanged,
        prevWorkflow: prevSteps,
        nextWorkflow: nextSteps,
        titleChanged,
        descChanged
      },
      fields: cleanFields,
      workflow: cleanWorkflow,
      htmlContent: htmlContent || t.html_content
    };
    const nextHistory = [...existingHistory, commit];

    let updateFilePath = t.file_path || null;
    let updateFileHash = t.file_hash || null;
    let updateMime = t.mime_type || null;
    let updateFileSize = t.file_size || 0;

    const cleanUpdateB64 = String(fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (cleanUpdateB64 && cleanUpdateB64.length > 10) {
      const saved = saveTemplateFile(t.id, cleanUpdateB64, t.docx_filename || 'template.docx', t.file_type || 'docx');
      updateFilePath = saved.filePath;
      updateFileHash = saved.fileHash;
      updateMime = saved.mimeType;
      updateFileSize = saved.fileSize;
    }

    await query(
      `UPDATE form_templates SET title = $1, description = $2, fields = $3::jsonb, workflow = $4::jsonb,
         default_expiry_days = $5, folder_id = $6, docx_base64 = NULL, html_content = $7, signature_slots = $8::jsonb,
         system_tags = $9::jsonb, version = $10, version_history = $11::jsonb,
         access_type = COALESCE($12, access_type), allowed_departments = COALESCE($13::jsonb, allowed_departments),
         allowed_users = COALESCE($14::jsonb, allowed_users),
         font_family = COALESCE($15, font_family), font_size = COALESCE($16, font_size),
         file_size = $17, status = $18, file_path = $19, file_hash = $20, mime_type = $21, updated_at = NOW()
       WHERE id = $22`,
      [nextTitle, nextDesc, JSON.stringify(cleanFields), JSON.stringify(cleanWorkflow), nextExpiry,
        targetFolderId, htmlContent || t.html_content,
        JSON.stringify(parsedSigSlots), JSON.stringify(parsedSysTags), nextVersion, JSON.stringify(nextHistory),
        accessType || null, allowedDepartments ? JSON.stringify(allowedDepartments) : null,
        allowedUsers ? JSON.stringify(allowedUsers) : null,
        fontFamily || null, fontSize || null, updateFileSize, nextStatus, updateFilePath, updateFileHash, updateMime, t.id]
    );

    const auditAction = (t.status === 'DRAFT' && nextStatus === 'ACTIVE')
      ? 'TEMPLATE_PUBLISHED'
      : (nextStatus === 'DRAFT' ? 'TEMPLATE_DRAFT_SAVED' : 'TEMPLATE_EDITED');
    await audit(auditAction, actor.username, `${t.unique_code} v${nextVersion}`, t.department);

    // Publishing the outcome of a finished review closes that review
    if (req.body.reviewId) {
      await query(
        `UPDATE template_reviews SET status = 'PUBLISHED', published_template_id = $1, updated_at = NOW()
         WHERE id = $2 AND initiator_id = $3 AND status IN ('DECIDED', 'IN_REVIEW')`,
        [t.id, String(req.body.reviewId), actor.id]
      );
    }

    const updated = await query('SELECT * FROM form_templates WHERE id = $1', [t.id]);
    res.json(mapTemplate(updated.rows[0]));
  } catch (err) {
    console.error('[PUT edit template]', err);
    res.status(400).json({ error: err.message || 'Failed to update template' });
  }
});

// Assign Rights / Permissions screen for a specific form
app.put('/api/forms/templates/:id/permissions', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });
    if (!isDeptAdmin(actor, t.department)) {
      return res.status(403).json({ error: 'Only admins of the owning department can configure rights' });
    }

    const { accessType, allowedDepartments, allowedUsers } = req.body;
    if (!['ALL', 'DEPARTMENTS', 'USERS'].includes(accessType)) {
      return res.status(400).json({ error: 'Valid access type required (ALL, DEPARTMENTS, or USERS)' });
    }

    await query(
      `UPDATE form_templates SET access_type = $1, allowed_departments = $2::jsonb, allowed_users = $3::jsonb,
         audience = $4, updated_at = NOW() WHERE id = $5`,
      [accessType, JSON.stringify(allowedDepartments || []), JSON.stringify(allowedUsers || []),
        accessType === 'ALL' ? 'ALL' : 'DEPARTMENT', t.id]
    );

    await audit('TEMPLATE_PERMISSIONS_UPDATED', actor.username, `${t.title} (${accessType})`, t.department);
    const updated = await query('SELECT * FROM form_templates WHERE id = $1', [t.id]);
    res.json(mapTemplate(updated.rows[0]));
  } catch (err) {
    console.error('[PUT template permissions]', err);
    res.status(400).json({ error: err.message || 'Failed to update permissions' });
  }
});

// Form Comments / Track changes acceptance or rejection (MS Word style)
app.post('/api/forms/templates/:id/comments', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT id, comments, title, department FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });

    const { text, targetField, status = 'OPEN', proposedChange = '' } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Comment text is required' });

    const comments = parseJson(t.comments, []);
    const newComment = {
      id: `cmt_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      text: text.trim(),
      proposedChange: String(proposedChange || '').trim(),
      targetField: targetField || null,
      status, // 'OPEN', 'ACCEPTED', 'REJECTED', 'RESOLVED'
      author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
      timestamp: new Date().toISOString()
    };
    comments.push(newComment);

    await query('UPDATE form_templates SET comments = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(comments), t.id]);
    await audit('COMMENT_ADDED', actor.username, `Comment on ${t.title}`, t.department);
    res.status(201).json(newComment);
  } catch (err) {
    console.error('[POST template comment]', err);
    res.status(400).json({ error: err.message || 'Failed to add comment' });
  }
});

app.put('/api/forms/templates/:id/comments/:commentId', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT id, comments, title, department FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });

    const { status, decisionNotes } = req.body;
    if (!['OPEN', 'ACCEPTED', 'REJECTED', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const comments = parseJson(t.comments, []);
    const comment = comments.find(c => c.id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.status = status;
    comment.decidedBy = { id: actor.id, name: actor.name, username: actor.username, department: actor.department };
    comment.decidedAt = new Date().toISOString();
    if (decisionNotes) comment.decisionNotes = decisionNotes.trim();

    await query('UPDATE form_templates SET comments = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(comments), t.id]);
    await audit(`COMMENT_${status}`, actor.username, `Comment ${status} on ${t.title}`, t.department);
    res.json(comment);
  } catch (err) {
    console.error('[PUT template comment]', err);
    res.status(400).json({ error: err.message || 'Failed to update comment' });
  }
});

// Notifications Endpoints
app.get('/api/notifications', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [actor.id]
    );
    const unreadCountRes = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [actor.id]
    );
    res.json({
      notifications: r.rows.map(n => ({
        id: n.id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        message: n.message,
        linkType: n.link_type,
        linkId: n.link_id,
        isRead: !!n.is_read,
        createdAt: n.created_at
      })),
      unreadCount: unreadCountRes.rows[0]?.count || 0
    });
  } catch (err) {
    console.error('[GET notifications]', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, [req.params.id, actor.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT notification read]', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    await query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1`, [actor.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT notifications read-all]', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Move template to a folder within its department (or null for department root)
app.put('/api/forms/templates/:id/move', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT id, title, department, folder_id, docx_filename FROM form_templates WHERE id = $1', [req.params.id]);
    const template = r.rows[0];
    if (!template) return res.status(404).json({ error: 'Template not found' });

    if (!isDeptAdmin(actor, template.department)) {
      return res.status(403).json({ error: 'Only admins of the owning department can move this template' });
    }

    const { folderId } = req.body;
    const targetFolderId = folderId ? String(folderId).trim() : null;
    if (targetFolderId) {
      const fCheck = await query('SELECT id, department FROM folders WHERE id = $1', [targetFolderId]);
      if (fCheck.rowCount === 0) return res.status(400).json({ error: 'Target folder not found' });
      if (fCheck.rows[0].department !== template.department) {
        return res.status(400).json({ error: 'Target folder belongs to a different department' });
      }
    }

    const duplicate = await findDuplicateTemplateInFolder({
      department: template.department,
      folderId: targetFolderId,
      title: template.title,
      fileName: template.docx_filename,
      excludeId: template.id
    });
    if (duplicate) {
      return res.status(409).json({
        error: `Cannot move document: a file named "${duplicate.title || duplicate.docx_filename}" already exists in the destination folder.`
      });
    }

    await query('UPDATE form_templates SET folder_id = $1, updated_at = NOW() WHERE id = $2', [targetFolderId, template.id]);
    await audit('TEMPLATE_MOVED', actor.username, template.title, template.department);

    const updated = await query('SELECT * FROM form_templates WHERE id = $1', [template.id]);
    res.json(mapTemplate(updated.rows[0]));
  } catch (err) {
    console.error('[PUT template move]', err);
    res.status(400).json({ error: err.message || 'Failed to move template' });
  }
});

// Delete or archive template:
// If ANY user has filled or submitted a form against this template (count > 0),
// preserve it as ARCHIVED so existing submissions, signatures, and audit trails remain intact.
// If NO user has filled or submitted a form (count === 0), permanently delete the file
// from disk storage and delete the record from PostgreSQL.
app.delete('/api/forms/templates/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT id, title, department, file_path FROM form_templates WHERE id = $1', [req.params.id]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });
    if (!isDeptAdmin(actor, t.department)) return res.status(403).json({ error: 'Only admins of the owning department can remove this template' });

    // Check if any user has filled or submitted a form for this template
    const subRes = await query('SELECT COUNT(*)::int AS count FROM form_submissions WHERE template_id = $1', [t.id]);
    const submissionCount = subRes.rows[0]?.count || 0;

    if (submissionCount > 0) {
      // Submissions exist on record: soft-archive so past submissions can still render and verify PKI signatures
      await query(`UPDATE form_templates SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`, [t.id]);
      await audit('TEMPLATE_ARCHIVED', actor.username, t.title, t.department);
      return res.json({
        success: true,
        id: t.id,
        action: 'archived',
        submissionCount,
        message: `Template has ${submissionCount} submission(s) on record and was archived to preserve audit integrity.`
      });
    }

    // No user has filled or submitted a form: permanently delete file from disk drive and database
    deleteTemplateFile(t.id, t.file_path);
    await query('UPDATE template_reviews SET published_template_id = NULL WHERE published_template_id = $1', [t.id]);
    await query('DELETE FROM form_templates WHERE id = $1', [t.id]);
    await audit('TEMPLATE_DELETED', actor.username, t.title, t.department);

    res.json({
      success: true,
      id: t.id,
      action: 'deleted',
      submissionCount: 0,
      message: 'Template and document file were permanently deleted from drive.'
    });
  } catch (err) {
    console.error('[DELETE templates]', err);
    res.status(500).json({ error: 'Failed to remove template' });
  }
});

// ============================================================
// Submissions (fill -> sign -> department approval chain)
// ============================================================
function validateFormData(fields, formData) {
  const data = {};
  for (const f of fields) {
    const v = formData?.[f.key];
    const val = v === undefined || v === null ? '' : String(v).trim();
    if (f.required) {
      if (f.type === 'checkbox') {
        if (!['yes', 'true', 'checked', '1', 'on'].includes(val.toLowerCase())) {
          return { error: `"${f.label}" must be checked` };
        }
      } else if (!val) {
        return { error: `"${f.label}" is required` };
      }
    }
    if (val && f.type === 'number' && Number.isNaN(Number(val))) return { error: `"${f.label}" must be a number` };
    data[f.key] = val;
  }
  return { data };
}

app.get('/api/forms/submissions', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query('SELECT * FROM form_submissions ORDER BY created_at DESC');
    res.json(r.rows.filter(s => canSeeSubmission(actor, s)).map(mapSubmission));
  } catch (err) {
    console.error('[GET submissions]', err);
    res.status(500).json({ error: 'Failed to load submissions' });
  }
});

app.post('/api/forms/submissions', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const { templateId, formData, expiryDate } = req.body;

    const tr = await query(`SELECT * FROM form_templates WHERE id = $1`, [templateId]);
    const t = tr.rows[0];
    if (!t) return res.status(404).json({ error: 'Template not found' });
    if (t.status === 'DRAFT') {
      return res.status(400).json({ error: 'This form template is currently an unpublished draft and cannot be filled or submitted yet.' });
    }
    if (t.status !== 'ACTIVE') return res.status(404).json({ error: 'Template is not active' });
    if (!canSeeTemplate(actor, t)) return res.status(403).json({ error: 'You do not have access to this template' });
    if (!actor.signature_image) return res.status(400).json({ error: 'Please draw and save your signature (My Signature) before submitting' });
    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || expiryDate <= todayStr()) {
      return res.status(400).json({ error: 'Please choose a decision deadline in the future' });
    }

    const { data, error } = validateFormData(parseJson(t.fields, []), formData);
    if (error) return res.status(400).json({ error });

    const tmplWorkflow = parseJson(t.workflow, []);
    if (tmplWorkflow.length === 0) return res.status(400).json({ error: 'This template has no approval workflow' });

    const year = new Date().getFullYear();
    const seqRow = await query(
      `SELECT COALESCE(MAX(CAST(SPLIT_PART(unique_number, '-', 3) AS INTEGER)), 0) AS m
       FROM form_submissions WHERE unique_number ~ $1`, [`^FRM-${year}-[0-9]+$`]
    );
    const uniqueNumber = `FRM-${year}-${String(seqRow.rows[0].m + 1).padStart(4, '0')}`;
    const id = `SUBM-${Date.now()}`;

    let submitter = actor;
    if (!submitter.pki_certificate_pem || !submitter.pki_private_key_pem) {
      const pkiData = generateUserCertificate(submitter);
      await query(`UPDATE users SET pki_certificate_pem = $1, pki_public_key_pem = $2, pki_private_key_pem = $3,
                   pki_serial_number = $4, pki_fingerprint = $5, pki_issued_at = $6, pki_expires_at = $7 WHERE id = $8`,
        [pkiData.certificatePem, pkiData.publicKeyPem, pkiData.privateKeyPem, pkiData.serialNumber, pkiData.fingerprint, pkiData.issuedAt, pkiData.expiresAt, submitter.id]);
      submitter = await getUserById(actor.id);
    }

    const payloadToSign = {
      templateId: t.id,
      uniqueNumber,
      title: t.title,
      department: t.department,
      formData: data,
      expiryDate
    };

    const pkiSignature = signPayload(
      submitter.pki_private_key_pem,
      payloadToSign,
      submitter,
      submitter.pki_certificate_pem,
      submitter.pki_fingerprint,
      submitter.pki_serial_number
    );

    const history = [{
      version: '1.0',
      timestamp: new Date().toISOString(),
      modifiedBy: actor.name,
      summary: 'Submitted for approval (PKI Digitally Sealed)',
      pkiFingerprint: submitter.pki_fingerprint
    }];

    await query(
      `INSERT INTO form_submissions (id, template_id, unique_number, title, department, submitted_by_id, submitted_by_name,
         submitted_by_username, version, version_history, form_data, subforms_data, signature, signed_at, expiry_date,
         status, current_workflow_step, workflow, objection_notes, folder_id, comments, pki_signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '1.0', $9::jsonb, $10::jsonb, '{}'::jsonb, $11, NOW(), $12, 'IN_REVIEW', 1, $13::jsonb, NULL, $14, '[]'::jsonb, $15::jsonb)`,
      [id, t.id, uniqueNumber, t.title, t.department, actor.id, actor.name, actor.username,
        JSON.stringify(history), JSON.stringify(data), actor.signature_image, expiryDate, JSON.stringify(freshWorkflow(tmplWorkflow)), t.folder_id || null, JSON.stringify(pkiSignature)]
    );
    await audit('FORM_SUBMITTED', actor.username, `${uniqueNumber} ${t.title}`, t.department);

    // Notify Step 1 department admins of new form approval and signature requirement
    const firstStepDept = tmplWorkflow[0]?.department;
    if (firstStepDept) {
      await notifyDepartmentAdmins(firstStepDept, {
        type: 'FORM_APPROVAL_REQUEST',
        title: 'New Form Approval Required',
        message: `${actor.name} submitted "${t.title}" (${uniqueNumber}) requiring approval and signature.`,
        linkType: 'submission',
        linkId: id,
        excludeUserId: actor.id
      });
    }

    const created = await query('SELECT * FROM form_submissions WHERE id = $1', [id]);
    res.status(201).json(mapSubmission(created.rows[0]));
  } catch (err) {
    console.error('[POST submissions]', err);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Submitter may edit only after an objection; resubmitting bumps the version and restarts the approval chain
app.put('/api/forms/submissions/:id/modify', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const sr = await query('SELECT * FROM form_submissions WHERE id = $1', [req.params.id]);
    const s = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Submission not found' });
    if (s.submitted_by_id !== actor.id) return res.status(403).json({ error: 'Only the originator who submitted this form can modify it' });
    if (s.status !== 'OBJECTION_RAISED') return res.status(403).json({ error: 'This form is locked. You cannot modify it unless a reviewer has explicitly raised an objection requesting changes.' });
    if (!actor.signature_image) return res.status(400).json({ error: 'Please save your signature before resubmitting' });

    const { formData, changeSummary, expiryDate } = req.body;
    const tr = await query('SELECT fields, workflow FROM form_templates WHERE id = $1', [s.template_id]);
    const t = tr.rows[0];
    if (!t) return res.status(404).json({ error: 'The template for this form no longer exists' });
    const { data, error } = validateFormData(parseJson(t.fields, []), formData);
    if (error) return res.status(400).json({ error });

    const newExpiry = expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ? expiryDate : s.expiry_date;
    if (newExpiry <= todayStr()) return res.status(400).json({ error: 'Please choose a decision deadline in the future' });

    let submitter = actor;
    if (!submitter.pki_certificate_pem || !submitter.pki_private_key_pem) {
      const pkiData = generateUserCertificate(submitter);
      await query(`UPDATE users SET pki_certificate_pem = $1, pki_public_key_pem = $2, pki_private_key_pem = $3,
                   pki_serial_number = $4, pki_fingerprint = $5, pki_issued_at = $6, pki_expires_at = $7 WHERE id = $8`,
        [pkiData.certificatePem, pkiData.publicKeyPem, pkiData.privateKeyPem, pkiData.serialNumber, pkiData.fingerprint, pkiData.issuedAt, pkiData.expiresAt, submitter.id]);
      submitter = await getUserById(actor.id);
    }

    const payloadToSign = {
      templateId: s.template_id,
      uniqueNumber: s.unique_number,
      title: s.title,
      department: s.department,
      formData: data,
      expiryDate: newExpiry
    };

    const pkiSignature = signPayload(
      submitter.pki_private_key_pem,
      payloadToSign,
      submitter,
      submitter.pki_certificate_pem,
      submitter.pki_fingerprint,
      submitter.pki_serial_number
    );

    const prevData = parseJson(s.form_data, {});
    const changedAnswers = [];
    for (const [k, newVal] of Object.entries(data || {})) {
      const oldVal = prevData[k];
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changedAnswers.push({
          field: k,
          from: oldVal !== undefined && oldVal !== null && oldVal !== '' ? String(oldVal) : '(empty)',
          to: newVal !== undefined && newVal !== null && newVal !== '' ? String(newVal) : '(empty)'
        });
      }
    }

    const newVersion = bumpVersion(s.version);
    const history = [...parseJson(s.version_history, []), {
      commitId: crypto.randomBytes(3).toString('hex'),
      version: newVersion,
      timestamp: new Date().toISOString(),
      modifiedBy: actor.name,
      author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
      summary: String(changeSummary || '').trim() || 'Modified after objection and resubmitted (PKI Sealed)',
      actionType: 'RESUBMITTED',
      objectionAddressed: s.objection_notes,
      pkiFingerprint: submitter.pki_fingerprint,
      changedAnswers,
      formData: data
    }];
    const wf = freshWorkflow(parseJson(s.workflow, []));

    await query(
      `UPDATE form_submissions SET form_data = $1::jsonb, version = $2, version_history = $3::jsonb, status = 'IN_REVIEW',
         objection_notes = NULL, workflow = $4::jsonb, current_workflow_step = 1, signature = $5, signed_at = NOW(),
         expiry_date = $6, pki_signature = $7::jsonb, updated_at = NOW() WHERE id = $8`,
      [JSON.stringify(data), newVersion, JSON.stringify(history), JSON.stringify(wf), actor.signature_image, newExpiry, JSON.stringify(pkiSignature), s.id]
    );
    await audit('FORM_RESUBMITTED', actor.username, `${s.unique_number} v${newVersion}`, s.department);

    // Notify Step 1 admins of the resubmission
    const firstStepDept = wf[0]?.department;
    if (firstStepDept) {
      await notifyDepartmentAdmins(firstStepDept, {
        type: 'FORM_APPROVAL_REQUEST',
        title: 'Resubmitted Form for Approval',
        message: `${actor.name} resubmitted "${s.title}" (${s.uniqueNumber} v${newVersion}) after addressing objection.`,
        linkType: 'submission',
        linkId: s.id,
        excludeUserId: actor.id
      });
    }

    const updated = await query('SELECT * FROM form_submissions WHERE id = $1', [s.id]);
    res.json(mapSubmission(updated.rows[0]));
  } catch (err) {
    console.error('[PUT modify]', err);
    res.status(500).json({ error: 'Failed to resubmit form' });
  }
});

// Any admin of the current step's department may act; approving stamps their saved signature
app.post('/api/forms/submissions/:id/workflow-action', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const { action } = req.body;
    const notes = String(req.body.notes || '').trim();
    if (!['APPROVE', 'OBJECTION', 'REJECT'].includes(action)) return res.status(400).json({ error: 'Unknown action' });

    const sr = await query('SELECT * FROM form_submissions WHERE id = $1', [req.params.id]);
    const s = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Submission not found' });
    if (s.status !== 'IN_REVIEW') return res.status(400).json({ error: 'This form is not awaiting a decision' });
    if (s.expiry_date && s.expiry_date < todayStr()) return res.status(400).json({ error: 'The decision deadline for this form has passed' });

    const wf = parseJson(s.workflow, []);
    const idx = (s.current_workflow_step || 1) - 1;
    const step = wf[idx];
    if (!step) return res.status(400).json({ error: 'Workflow step not found' });
    if (!isDeptAdmin(actor, step.department)) {
      return res.status(403).json({ error: `Only admins of ${step.department} can act on this step` });
    }
    if (action !== 'APPROVE' && !notes) return res.status(400).json({ error: 'Please add a comment explaining your decision' });
    if (action === 'APPROVE' && !actor.signature_image) {
      return res.status(400).json({ error: 'Please draw and save your signature (My Signature) before approving' });
    }

    Object.assign(step, { actedById: actor.id, actedByName: actor.name, actedAt: new Date().toISOString(), notes: notes || null });
    let status = 'IN_REVIEW';
    let current = idx + 1;
    if (action === 'APPROVE') {
      step.status = 'APPROVED';
      step.signature = actor.signature_image;

      let approver = actor;
      if (!approver.pki_certificate_pem || !approver.pki_private_key_pem) {
        const pkiData = generateUserCertificate(approver);
        await query(`UPDATE users SET pki_certificate_pem = $1, pki_public_key_pem = $2, pki_private_key_pem = $3,
                     pki_serial_number = $4, pki_fingerprint = $5, pki_issued_at = $6, pki_expires_at = $7 WHERE id = $8`,
          [pkiData.certificatePem, pkiData.publicKeyPem, pkiData.privateKeyPem, pkiData.serialNumber, pkiData.fingerprint, pkiData.issuedAt, pkiData.expiresAt, approver.id]);
        approver = await getUserById(actor.id);
      }

      const stepPayload = {
        submissionId: s.id,
        uniqueNumber: s.unique_number,
        stepNumber: idx + 1,
        department: step.department,
        action: 'APPROVE',
        formData: parseJson(s.form_data, {}),
        notes: notes || null
      };

      step.pkiSignature = signPayload(
        approver.pki_private_key_pem,
        stepPayload,
        approver,
        approver.pki_certificate_pem,
        approver.pki_fingerprint,
        approver.pki_serial_number
      );

      if (idx + 1 < wf.length) {
        wf[idx + 1].status = 'PENDING';
        current = idx + 2;
      } else {
        status = 'APPROVED';
      }
    } else if (action === 'OBJECTION') {
      step.status = 'OBJECTION';
      status = 'OBJECTION_RAISED';
    } else {
      step.status = 'REJECTED';
      status = 'REJECTED';
    }

    // Append decision to version history like a git commit
    const history = [...parseJson(s.version_history, []), {
      commitId: crypto.randomBytes(3).toString('hex'),
      version: s.version,
      timestamp: new Date().toISOString(),
      modifiedBy: actor.name,
      author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
      actionType: action,
      summary: action === 'APPROVE'
        ? (status === 'APPROVED' ? 'Final approval granted — all PKI signatures sealed' : `Approved & PKI signed by ${step.department}`)
        : (action === 'OBJECTION' ? `Objection raised by ${step.department}: ${notes}` : `Rejected by ${step.department}: ${notes}`),
      pkiFingerprint: action === 'APPROVE' ? step.pkiSignature?.certificateFingerprint : null,
      notes: notes || null
    }];

    await query(
      `UPDATE form_submissions SET status = $1, current_workflow_step = $2, workflow = $3::jsonb, objection_notes = $4,
         version_history = $5::jsonb, updated_at = NOW() WHERE id = $6`,
      [status, current, JSON.stringify(wf), action === 'APPROVE' ? null : notes, JSON.stringify(history), s.id]
    );
    await audit(`FORM_${action}`, actor.username, `${s.unique_number} step ${idx + 1} (${step.department})`, step.department);

    // Send notifications
    if (action === 'APPROVE') {
      if (idx + 1 < wf.length) {
        const nextDept = wf[idx + 1].department;
        await notifyDepartmentAdmins(nextDept, {
          type: 'FORM_APPROVAL_REQUEST',
          title: 'Approval & Signature Required',
          message: `${step.department} approved "${s.title}". Waiting for ${nextDept} approval and signature.`,
          linkType: 'submission',
          linkId: s.id,
          excludeUserId: actor.id
        });
      } else {
        await sendNotification({
          userId: s.submitted_by_id,
          type: 'FORM_APPROVED',
          title: 'Form Fully Approved!',
          message: `Your form "${s.title}" (${s.unique_number}) has been approved by all departments.`,
          linkType: 'submission',
          linkId: s.id
        });
      }
    } else if (action === 'OBJECTION') {
      await sendNotification({
        userId: s.submitted_by_id,
        type: 'FORM_OBJECTION',
        title: 'Objection Raised on Form',
        message: `${step.department} raised an objection on "${s.title}": "${notes}". Please modify and resubmit.`,
        linkType: 'submission',
        linkId: s.id
      });
    } else if (action === 'REJECT') {
      await sendNotification({
        userId: s.submitted_by_id,
        type: 'FORM_REJECTED',
        title: 'Form Rejected',
        message: `${step.department} rejected "${s.title}": "${notes}".`,
        linkType: 'submission',
        linkId: s.id
      });
    }

    const updated = await query('SELECT * FROM form_submissions WHERE id = $1', [s.id]);
    res.json(mapSubmission(updated.rows[0]));
  } catch (err) {
    console.error('[workflow-action]', err);
    res.status(500).json({ error: 'Failed to process the decision' });
  }
});

// Cryptographic Verification of Form Submissions & Signature Integrity
app.post('/api/forms/submissions/:id/verify-signatures', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const sr = await query('SELECT * FROM form_submissions WHERE id = $1', [req.params.id]);
    const s = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Submission not found' });
    if (!canSeeSubmission(actor, s)) return res.status(403).json({ error: 'You do not have access to this form' });

    const formData = parseJson(s.form_data, {});
    const pkiSub = parseJson(s.pki_signature, null);

    // 1. Verify Submitter Signature
    let submitterVerification = null;
    if (pkiSub) {
      const submitterPayload = {
        templateId: s.template_id,
        uniqueNumber: s.unique_number,
        title: s.title,
        department: s.department,
        formData,
        expiryDate: s.expiry_date
      };
      submitterVerification = verifySignatureBundle(pkiSub, submitterPayload);
    }

    // 2. Verify Approver Signatures in workflow
    const wf = parseJson(s.workflow, []);
    const approvalVerifications = [];
    for (let i = 0; i < wf.length; i++) {
      const st = wf[i];
      if (st.status === 'APPROVED' && st.pkiSignature) {
        const stepPayload = {
          submissionId: s.id,
          uniqueNumber: s.unique_number,
          stepNumber: i + 1,
          department: st.department,
          action: 'APPROVE',
          formData,
          notes: st.notes || null
        };
        const v = verifySignatureBundle(st.pkiSignature, stepPayload);
        approvalVerifications.push({
          stepNumber: i + 1,
          department: st.department,
          actedByName: st.actedByName,
          actedAt: st.actedAt,
          ...v
        });
      }
    }

    const allSubmitterOk = !pkiSub || submitterVerification?.valid;
    const allApprovalsOk = approvalVerifications.every(a => a.valid);
    const overallValid = allSubmitterOk && allApprovalsOk;

    res.json({
      submissionId: s.id,
      uniqueNumber: s.unique_number,
      overallValid,
      hasPkiSignatures: !!pkiSub || approvalVerifications.length > 0,
      submitterVerification,
      approvalVerifications,
      verifiedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[POST verify-signatures]', err);
    res.status(500).json({ error: 'Signature verification failed: ' + (err.message || 'Unknown error') });
  }
});

// In-Form Comments on Submissions (MS Word comment system for questions/objections/notes)
app.post('/api/forms/submissions/:id/comments', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const sr = await query('SELECT id, comments, title, department, submitted_by_id FROM form_submissions WHERE id = $1', [req.params.id]);
    const s = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Submission not found' });

    const { text, targetField, status = 'OPEN', proposedChange = '', type } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Comment text is required' });

    const comments = parseJson(s.comments, []);
    const newComment = {
      id: `cmt_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      text: text.trim(),
      type: type || (status === 'OBJECTION' ? 'OBJECTION' : 'COMMENT'),
      proposedChange: String(proposedChange || '').trim(),
      targetField: targetField || null,
      status, // 'OPEN', 'ACCEPTED', 'REJECTED', 'RESOLVED'
      author: { id: actor.id, name: actor.name, username: actor.username, department: actor.department },
      timestamp: new Date().toISOString()
    };
    comments.push(newComment);

    await query('UPDATE form_submissions SET comments = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(comments), s.id]);
    await audit('COMMENT_ADDED', actor.username, `Comment on submission ${s.title}`, s.department);

    // Notify submitter if someone else commented, or notify department admins if submitter commented
    if (actor.id !== s.submitted_by_id) {
      await sendNotification({
        userId: s.submitted_by_id,
        type: 'COMMENT_ADDED',
        title: 'New Comment on Your Form',
        message: `${actor.name} commented on "${s.title}": "${text.trim().slice(0, 80)}"`,
        linkType: 'submission',
        linkId: s.id
      });
    }

    res.status(201).json(newComment);
  } catch (err) {
    console.error('[POST submission comment]', err);
    res.status(400).json({ error: err.message || 'Failed to add comment' });
  }
});

app.put('/api/forms/submissions/:id/comments/:commentId', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const sr = await query('SELECT id, comments, title, department, submitted_by_id FROM form_submissions WHERE id = $1', [req.params.id]);
    const s = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Submission not found' });

    const { status, decisionNotes } = req.body;
    if (!['OPEN', 'ACCEPTED', 'REJECTED', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const comments = parseJson(s.comments, []);
    const comment = comments.find(c => c.id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    comment.status = status;
    comment.decidedBy = { id: actor.id, name: actor.name, username: actor.username, department: actor.department };
    comment.decidedAt = new Date().toISOString();
    if (decisionNotes) comment.decisionNotes = decisionNotes.trim();

    await query('UPDATE form_submissions SET comments = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(comments), s.id]);
    await audit(`COMMENT_${status}`, actor.username, `Comment ${status} on submission ${s.title}`, s.department);
    res.json(comment);
  } catch (err) {
    console.error('[PUT submission comment]', err);
    res.status(400).json({ error: err.message || 'Failed to update comment' });
  }
});

// Filled Word document: answers merged into the original template + signatures stamped in
app.get('/api/forms/submissions/:id/document', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const sr = await query('SELECT * FROM form_submissions WHERE id = $1', [req.params.id]);
    const s = sr.rows[0];
    if (!s) return res.status(404).json({ error: 'Submission not found' });
    if (!canSeeSubmission(actor, s)) return res.status(403).json({ error: 'You do not have access to this form' });
    const tr = await query('SELECT id, file_path, docx_base64, fields FROM form_templates WHERE id = $1', [s.template_id]);
    const tmplRow = tr.rows[0];
    if (!tmplRow) return res.status(404).json({ error: 'The Word template for this form was not found' });
    const tmplBase64 = getTemplateBase64(tmplRow.id, tmplRow.file_path) || tmplRow.docx_base64;
    if (!tmplBase64) return res.status(404).json({ error: 'The Word template for this form is not available' });

    const signatures = [];
    const pkiSub = parseJson(s.pki_signature, null);
    if (s.signature?.startsWith('data:image/png')) {
      signatures.push({
        slot: 'Submitter',
        label: 'Submitted by',
        name: s.submitted_by_name,
        date: s.signed_at,
        image: s.signature,
        pkiFingerprint: pkiSub?.certificateFingerprint,
        pkiSerial: pkiSub?.certificateSerial
      });
    }
    for (const st of parseJson(s.workflow, [])) {
      if (st.status === 'APPROVED' && st.signature) {
        signatures.push({
          slot: st.department,
          label: `${st.department} approval`,
          name: st.actedByName,
          date: st.actedAt,
          image: st.signature,
          pkiFingerprint: st.pkiSignature?.certificateFingerprint,
          pkiSerial: st.pkiSignature?.certificateSerial
        });
      }
    }
    const system = {
      'Form ID': s.unique_number,
      'Submitted By': s.submitted_by_name,
      'Submitted Date': new Date(s.created_at).toISOString().slice(0, 10),
      'Version': s.version,
      'Department': s.department
    };
    const templateFields = parseJson(tmplRow.fields, []);
    const buf = renderFilledDocument(tmplBase64, {
      values: parseJson(s.form_data, {}),
      system,
      signatures,
      fields: templateFields
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${s.unique_number}_v${s.version}.docx"`);
    res.send(buf);
  } catch (err) {
    console.error('[GET document]', err);
    res.status(500).json({ error: err.message || 'Failed to generate document' });
  }
});

// ============================================================
// Department messaging
// ============================================================
app.get('/api/departments/messages', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const department = req.query.department || actor.department;
    if (!isSuper(actor) && department !== actor.department) {
      return res.status(403).json({ error: 'You can only read your own department channel' });
    }
    const r = await query(
      `SELECT m.*, u.avatar AS sender_avatar
       FROM department_messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.department = $1
       ORDER BY m.created_at ASC`,
      [department]
    );
    res.json(r.rows.map(m => ({
      id: m.id, department: m.department, senderId: m.sender_id, senderUsername: m.sender_username,
      senderName: m.sender_name, senderRole: m.sender_role, senderAvatar: m.sender_avatar || null, message: m.message,
      formRefId: m.form_ref_id, formRefTitle: m.form_ref_title, createdAt: m.created_at
    })));
  } catch (err) {
    console.error('[GET messages]', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post('/api/departments/messages', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const department = req.body.department || actor.department;
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message cannot be empty' });
    if (!isSuper(actor) && department !== actor.department) {
      return res.status(403).json({ error: 'You can only post in your own department channel' });
    }
    const id = `MSG-${Date.now()}`;
    await query(
      `INSERT INTO department_messages (id, department, sender_id, sender_username, sender_name, sender_role, message, form_ref_id, form_ref_title)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, department, actor.id, actor.username, actor.name, normalizeRole(actor.system_role), message,
        req.body.formRefId || null, req.body.formRefTitle || null]
    );
    res.status(201).json({ id });
  } catch (err) {
    console.error('[POST messages]', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ============================================================
// Template reviews (reviewers edit their own copy; the initiator accepts / rejects each change)
// ============================================================
// True when the document has no visible text and no widgets (fields, signatures, tables, images)
const htmlIsBlank = (h) => !String(h || '')
  .replace(/<br\s*\/?>/gi, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/<(?!\/?(?:span|div|table|img)\b)[^>]*>/gi, '')
  .replace(/<[^>]*>/g, 'x')
  .trim();

const mapReviewer = (v, { withHtml = false } = {}) => ({
  userId: v.user_id,
  name: v.user_name,
  department: v.department,
  status: v.status,
  hasChanges: !!v.has_changes,
  submittedAt: v.submitted_at,
  comment: v.comment || '',
  ...(withHtml ? { html: v.html || '' } : {})
});

function reviewPhase(r, reviewers) {
  if (r.status === 'IN_REVIEW' && reviewers.length > 0 && reviewers.every(v => v.status === 'SUBMITTED')) {
    return 'AWAITING_DECISION';
  }
  return r.status;
}

function mapReviewSummary(r, reviewers) {
  return {
    id: r.id,
    title: r.title,
    department: r.department,
    initiatorId: r.initiator_id,
    initiatorName: r.initiator_name,
    message: r.message || '',
    status: r.status,
    phase: reviewPhase(r, reviewers),
    publishedTemplateId: r.published_template_id || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reviewers: reviewers.map(v => mapReviewer(v))
  };
}

async function loadReview(id) {
  const r = await query('SELECT * FROM template_reviews WHERE id = $1', [id]);
  if (!r.rows[0]) return null;
  const v = await query('SELECT * FROM template_review_reviewers WHERE review_id = $1 ORDER BY user_name ASC', [id]);
  return { review: r.rows[0], reviewers: v.rows };
}

app.get('/api/template-reviews', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const r = await query(
      `SELECT id, title, department, initiator_id, initiator_name, message, status, published_template_id, created_at, updated_at
       FROM template_reviews r
       WHERE r.initiator_id = $1
          OR EXISTS (SELECT 1 FROM template_review_reviewers x WHERE x.review_id = r.id AND x.user_id = $1)
       ORDER BY r.created_at DESC`,
      [actor.id]
    );
    const ids = r.rows.map(x => x.id);
    const v = ids.length
      ? await query(
        `SELECT review_id, user_id, user_name, department, status, has_changes, submitted_at, comment
         FROM template_review_reviewers WHERE review_id = ANY($1) ORDER BY user_name ASC`, [ids])
      : { rows: [] };
    res.json(r.rows.map(row => mapReviewSummary(row, v.rows.filter(x => x.review_id === row.id))));
  } catch (err) {
    console.error('[GET template-reviews]', err);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

app.get('/api/template-reviews/:id', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const loaded = await loadReview(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Review not found' });
    const { review: r, reviewers } = loaded;
    const mine = reviewers.find(v => v.user_id === actor.id);
    const isInitiator = r.initiator_id === actor.id;
    if (!isInitiator && !mine) return res.status(403).json({ error: 'You are not part of this review' });

    const body = {
      ...mapReviewSummary(r, reviewers),
      settings: parseJson(r.settings, {}),
      baseHtml: r.base_html
    };
    if (isInitiator) {
      // The initiator sees every reviewer's edited copy plus their own earlier decisions
      body.reviewers = reviewers.map(v => mapReviewer(v, { withHtml: true }));
      body.decisions = parseJson(r.decisions, {});
      body.finalHtml = r.final_html || null;
    } else {
      // Reviewers work independently: only their own copy is returned
      body.myHtml = mine.html || r.base_html;
      body.myStatus = mine.status;
    }
    res.json(body);
  } catch (err) {
    console.error('[GET template-review]', err);
    res.status(500).json({ error: 'Failed to load review' });
  }
});

app.post('/api/template-reviews', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    if (!isAdmin(actor)) return res.status(403).json({ error: 'Only department admins can send a form for review' });

    const {
      title, description, department, folderId, audience, defaultExpiryDays,
      workflow, htmlContent, reviewerIds, message, sourceReviewId
    } = req.body;

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return res.status(400).json({ error: 'Give the form a title before sending it for review' });
    if (htmlIsBlank(htmlContent)) return res.status(400).json({ error: 'The document is empty' });

    const targetDept = String(department || actor.department || '').trim();
    if (!isDeptAdmin(actor, targetDept)) {
      return res.status(403).json({ error: `You do not have permission to create forms in ${targetDept}` });
    }

    const wanted = Array.from(new Set((Array.isArray(reviewerIds) ? reviewerIds : []).map(String))).filter(id => id !== actor.id);
    if (wanted.length === 0) return res.status(400).json({ error: 'Select at least one reviewer' });
    if (wanted.length > 25) return res.status(400).json({ error: 'You can select at most 25 reviewers' });
    const found = await query('SELECT id, name, department, status FROM users WHERE id = ANY($1)', [wanted]);
    if (found.rowCount !== wanted.length) return res.status(400).json({ error: 'One or more selected reviewers no longer exist' });
    const inactive = found.rows.find(u => u.status === 'SUSPENDED');
    if (inactive) return res.status(400).json({ error: `${inactive.name} is suspended and cannot review` });

    const settings = {
      templateId: req.body.templateId || null,
      title: cleanTitle,
      description: String(description || '').trim(),
      department: targetDept,
      folderId: folderId || null,
      audience: audience === 'ALL' ? 'ALL' : 'DEPARTMENT',
      defaultExpiryDays: Math.min(Math.max(parseInt(defaultExpiryDays, 10) || 14, 1), 365),
      workflow: (Array.isArray(workflow) ? workflow : []).map(w => (typeof w === 'string' ? w : w?.department)).filter(Boolean),
      fields: Array.isArray(req.body.fields) ? req.body.fields : []
    };

    const id = `REV-${Date.now()}`;
    await query(
      `INSERT INTO template_reviews (id, title, department, initiator_id, initiator_name, message, settings, base_html)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [id, cleanTitle, targetDept, actor.id, actor.name, String(message || '').trim(), JSON.stringify(settings), String(htmlContent)]
    );
    for (const u of found.rows) {
      await query(
        `INSERT INTO template_review_reviewers (review_id, user_id, user_name, department) VALUES ($1, $2, $3, $4)`,
        [id, u.id, u.name, u.department]
      );
    }
    // Starting a new round from a finished review retires the old one
    if (sourceReviewId) {
      await query(
        `UPDATE template_reviews SET status = 'SUPERSEDED', updated_at = NOW()
         WHERE id = $1 AND initiator_id = $2 AND status IN ('IN_REVIEW', 'DECIDED')`,
        [String(sourceReviewId), actor.id]
      );
    }
    await audit('REVIEW_STARTED', actor.username, `${cleanTitle} (${found.rowCount} reviewer${found.rowCount === 1 ? '' : 's'})`, targetDept);

    // Notify each assigned reviewer
    for (const u of found.rows) {
      await sendNotification({
        userId: u.id,
        type: 'REVIEW_REQUEST',
        title: 'Form Review Requested',
        message: `${actor.name} invited you to review draft form "${cleanTitle}".`,
        linkType: 'review',
        linkId: id
      });
    }

    const loaded = await loadReview(id);
    res.status(201).json(mapReviewSummary(loaded.review, loaded.reviewers));
  } catch (err) {
    console.error('[POST template-reviews]', err);
    res.status(400).json({ error: err.message || 'Failed to start the review' });
  }
});

// A reviewer submits their edited copy of the document
app.post('/api/template-reviews/:id/submit', async (req, res) => {
  try {
    const actor = await requireActor(req, res);
    if (!actor) return;
    const loaded = await loadReview(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Review not found' });
    const { review: r, reviewers } = loaded;
    const mine = reviewers.find(v => v.user_id === actor.id);
    if (!mine) return res.status(403).json({ error: 'You are not a reviewer of this form' });
    if (r.status !== 'IN_REVIEW') return res.status(409).json({ error: 'This review is no longer open' });
    if (mine.status === 'SUBMITTED') return res.status(409).json({ error: 'You have already submitted your review' });
    if (htmlIsBlank(req.body.htmlContent)) return res.status(400).json({ error: 'The document cannot be empty' });

    await query(
      `UPDATE template_review_reviewers
       SET status = 'SUBMITTED', html = $1, comment = $2, has_changes = $3, submitted_at = NOW()
       WHERE review_id = $4 AND user_id = $5`,
      [String(req.body.htmlContent), String(req.body.comment || '').trim(), !!req.body.hasChanges, r.id, actor.id]
    );
    await query('UPDATE template_reviews SET updated_at = NOW() WHERE id = $1', [r.id]);
    await audit('REVIEW_SUBMITTED', actor.username, `${r.title}${req.body.hasChanges ? ' (with changes)' : ' (no changes)'}`, r.department);

    // Notify review initiator
    await sendNotification({
      userId: r.initiator_id,
      type: 'REVIEW_SUBMITTED',
      title: 'Reviewer Feedback Received',
      message: `${actor.name} submitted their feedback for "${r.title}".`,
      linkType: 'review',
      linkId: r.id
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[POST template-review submit]', err);
    res.status(400).json({ error: err.message || 'Failed to submit the review' });
  }
});

// Shared guard for initiator-only actions (optionally requiring every reviewer to have submitted)
async function loadForInitiator(req, res, { needAllSubmitted = true, statuses = ['IN_REVIEW', 'DECIDED'] } = {}) {
  const actor = await requireActor(req, res);
  if (!actor) return null;
  const loaded = await loadReview(req.params.id);
  if (!loaded) { res.status(404).json({ error: 'Review not found' }); return null; }
  if (loaded.review.initiator_id !== actor.id) {
    res.status(403).json({ error: 'Only the person who started the review can do this' });
    return null;
  }
  if (!statuses.includes(loaded.review.status)) {
    res.status(409).json({ error: 'This review is closed' });
    return null;
  }
  if (needAllSubmitted && !loaded.reviewers.every(v => v.status === 'SUBMITTED')) {
    res.status(409).json({ error: 'Every reviewer must submit before changes can be decided' });
    return null;
  }
  return { actor, ...loaded };
}

const cleanDecisions = (d) => {
  const out = {};
  if (d && typeof d === 'object') {
    for (const [k, v] of Object.entries(d)) {
      if (/^[\w.-]+:\d+$/.test(k) && (v === 'accepted' || v === 'rejected')) out[k] = v;
    }
  }
  return out;
};

app.put('/api/template-reviews/:id/decisions', async (req, res) => {
  try {
    const ctx = await loadForInitiator(req, res);
    if (!ctx) return;
    const decisions = cleanDecisions(req.body.decisions);
    await query('UPDATE template_reviews SET decisions = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(decisions), ctx.review.id]);
    res.json({ success: true, decisions });
  } catch (err) {
    console.error('[PUT template-review decisions]', err);
    res.status(400).json({ error: err.message || 'Failed to save decisions' });
  }
});

// The initiator has decided on every change; the merged document is stored and can be published
app.post('/api/template-reviews/:id/finalize', async (req, res) => {
  try {
    const ctx = await loadForInitiator(req, res);
    if (!ctx) return;
    if (htmlIsBlank(req.body.finalHtml)) return res.status(400).json({ error: 'The merged document is empty' });
    await query(
      `UPDATE template_reviews SET final_html = $1, decisions = $2::jsonb, status = 'DECIDED', updated_at = NOW() WHERE id = $3`,
      [String(req.body.finalHtml), JSON.stringify(cleanDecisions(req.body.decisions)), ctx.review.id]
    );
    await audit('REVIEW_DECIDED', ctx.actor.username, ctx.review.title, ctx.review.department);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST template-review finalize]', err);
    res.status(400).json({ error: err.message || 'Failed to finish the review' });
  }
});

app.post('/api/template-reviews/:id/cancel', async (req, res) => {
  try {
    const ctx = await loadForInitiator(req, res, { needAllSubmitted: false });
    if (!ctx) return;
    await query(`UPDATE template_reviews SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [ctx.review.id]);
    await audit('REVIEW_CANCELLED', ctx.actor.username, ctx.review.title, ctx.review.department);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST template-review cancel]', err);
    res.status(400).json({ error: err.message || 'Failed to cancel the review' });
  }
});

// ============================================================
// Activity & Audit Logs (Role-Scoped Activity Viewer)
// ============================================================
app.get('/api/audit-logs', async (req, res) => {
  const actor = await requireActor(req, res);
  if (!actor) return;

  try {
    const isSuperAdmin = isSuper(actor);
    const isDeptAdmin = normalizeRole(actor.system_role) === 'admin';
    const exportAll = req.query.exportAll === 'true';

    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 5), 100);

    const search = String(req.query.search || '').trim().toLowerCase();
    const actionFilter = String(req.query.actionType || '').trim();
    const categoryFilter = String(req.query.category || '').trim();
    const deptFilter = String(req.query.department || '').trim();

    const conditions = [];
    const params = [];

    // Role-based scoping (strictly enforced):
    // 1. Super Admin: full visibility across all departments and users
    // 2. Dept Admin (Dept Head): own department activity + actions taken by users in their department
    // 3. Ordinary User: strictly own activity only
    if (isSuperAdmin) {
      if (deptFilter && deptFilter !== 'ALL') {
        params.push(deptFilter);
        conditions.push(`a.department = $${params.length}`);
      }
    } else if (isDeptAdmin) {
      params.push(actor.department);
      params.push(actor.username);
      conditions.push(
        `(a.department = $1 OR a.actor_email IN (SELECT username FROM users WHERE department = $1) OR a.actor_email = $2)`
      );
    } else {
      // Ordinary user: strictly own activity only
      params.push(actor.username);
      conditions.push(`a.actor_email = $1`);
    }

    // Category-based filter mapped to database action types
    const CATEGORY_MAP = {
      SUBMISSIONS: ['FORM_SUBMITTED', 'FORM_RESUBMITTED'],
      APPROVALS: ['FORM_APPROVE', 'FORM_OBJECT', 'FORM_OBJECTION', 'FORM_REJECT'],
      TEMPLATES: [
        'TEMPLATE_CREATED', 'TEMPLATE_DRAFT_CREATED', 'TEMPLATE_EDITED', 'TEMPLATE_DRAFT_SAVED',
        'TEMPLATE_PUBLISHED', 'TEMPLATE_PERMISSIONS_UPDATED', 'TEMPLATE_MOVED',
        'TEMPLATE_ARCHIVED', 'TEMPLATE_DELETED', 'BULK_TEMPLATE_DRAFTS_IMPORTED', 'BULK_TEMPLATE_IMPORTED',
        'FOLDER_CREATED', 'FOLDER_RENAMED', 'FOLDER_DELETED'
      ],
      REVIEWS: [
        'REVIEW_STARTED', 'REVIEW_SUBMITTED', 'REVIEW_DECIDED', 'REVIEW_CANCELLED'
      ],
      SECURITY: [
        'USER_LOGIN', 'SIGNATURE_SAVED', 'SIGNATURE_CLEARED', 'AVATAR_UPDATED', 'AVATAR_CLEARED',
        'PKI_CERTIFICATE_ISSUED', 'USER_CREATED', 'USER_UPDATED', 'USER_ACTIVATED',
        'USER_SUSPENDED', 'USER_DELETED', 'DEPARTMENT_CREATED', 'DEPARTMENT_UPDATED', 'DEPARTMENT_DELETED',
        'SYSTEM_RESET_ALL', 'SYSTEM_RESET_FORMS',
        'SYSTEM_WIPED', 'FORMS_WIPED'
      ],
      COMMENTS: [
        'COMMENT_ADDED', 'COMMENT_RESOLVED', 'COMMENT_ACCEPTED', 'COMMENT_REJECTED',
        'COMMENT_OPEN', 'COMMENT_DELETED'
      ]
    };

    if (categoryFilter && categoryFilter !== 'ALL' && CATEGORY_MAP[categoryFilter]) {
      const types = CATEGORY_MAP[categoryFilter];
      const placeholders = types.map(t => {
        params.push(t);
        return `$${params.length}`;
      }).join(', ');
      conditions.push(`a.action_type IN (${placeholders})`);
    } else if (actionFilter && actionFilter !== 'ALL') {
      params.push(actionFilter);
      conditions.push(`a.action_type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const sIdx = params.length;
      conditions.push(
        `(LOWER(a.action_type) LIKE $${sIdx} OR LOWER(a.actor_email) LIKE $${sIdx} OR LOWER(a.resource_name) LIKE $${sIdx} OR LOWER(a.department) LIKE $${sIdx} OR LOWER(COALESCE(u.name, '')) LIKE $${sIdx})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Get exact total count for pagination directly from DB
    const countSql = `
      SELECT COUNT(*) AS total
      FROM audit_logs a
      LEFT JOIN users u ON LOWER(u.username) = LOWER(a.actor_email)
      ${whereClause}
    `;
    const countResult = await query(countSql, params);
    const totalCount = parseInt(countResult.rows[0]?.total || 0, 10);

    // 2. Calculate paging offsets
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;

    // For CSV export: return up to 5000 records
    const fetchLimit = exportAll ? 5000 : pageSize;
    const fetchOffset = exportAll ? 0 : offset;

    const dataParams = [...params, fetchLimit, fetchOffset];
    const dataSql = `
      SELECT 
        a.id,
        a.timestamp,
        a.action_type,
        a.actor_email,
        a.resource_name,
        a.department,
        a.sha256,
        a.verified,
        u.name AS actor_name,
        u.avatar AS actor_avatar,
        u.system_role AS actor_role
      FROM audit_logs a
      LEFT JOIN users u ON LOWER(u.username) = LOWER(a.actor_email)
      ${whereClause}
      ORDER BY a.timestamp DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await query(dataSql, dataParams);

    const logs = result.rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      actionType: r.action_type,
      actorUsername: r.actor_email,
      actorName: r.actor_name || r.actor_email,
      actorAvatar: r.actor_avatar || null,
      actorRole: r.actor_role || 'user',
      resourceName: r.resource_name,
      department: r.department,
      sha256: r.sha256,
      verified: !!r.verified
    }));

    res.json({
      logs,
      totalCount,
      page: safePage,
      pageSize,
      totalPages,
      from: totalCount === 0 ? 0 : offset + 1,
      to: Math.min(offset + logs.length, totalCount),
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
      scope: isSuperAdmin ? 'GLOBAL_ADMIN' : isDeptAdmin ? 'DEPARTMENT_ADMIN' : 'USER_PERSONAL',
      userDepartment: actor.department
    });
  } catch (err) {
    console.error('[GET /api/audit-logs]', err);
    res.status(500).json({ error: 'Failed to retrieve activity log' });
  }
});

// ============================================================
// Static assets & SPA fallback (production)
// ============================================================
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// ============================================================
// Startup
// ============================================================
async function startServer() {
  try {
    await initPostgresDatabase();
    initStorage();
    await migrateDatabaseTemplatesToDisk(query);
    app.listen(PORT, () => console.log(`[SmartDoc Backend] Listening on port ${PORT} (system tags: ${SYSTEM_TAGS.join(', ')})`));
  } catch (err) {
    console.error('[SmartDoc Server Startup Failed]:', err);
    process.exit(1);
  }
}

startServer();
