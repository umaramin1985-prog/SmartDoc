import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base disk storage directory (configurable via environment variable)
export const STORAGE_BASE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
export const TEMPLATES_DIR = path.join(STORAGE_BASE_DIR, 'templates');
export const SUBMISSIONS_DIR = path.join(STORAGE_BASE_DIR, 'submissions');
export const TEMP_DIR = path.join(STORAGE_BASE_DIR, 'temp');

/**
 * Ensure all storage subdirectories exist on disk.
 */
export function initStorage() {
  try {
    if (!fs.existsSync(STORAGE_BASE_DIR)) fs.mkdirSync(STORAGE_BASE_DIR, { recursive: true });
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    if (!fs.existsSync(SUBMISSIONS_DIR)) fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`[StorageEngine] Initialized disk storage directory at: ${STORAGE_BASE_DIR}`);
  } catch (err) {
    console.error('[StorageEngine] Error initializing storage directories:', err);
  }
}

/**
 * Determine MIME content-type from filename and fileType.
 */
export function getMimeType(filename = '', fileType = 'docx') {
  const fn = String(filename || '').toLowerCase();
  const ft = String(fileType || '').toLowerCase();

  if (ft === 'pdf' || fn.endsWith('.pdf')) return 'application/pdf';
  if (ft === 'image' || fn.endsWith('.png')) return 'image/png';
  if (fn.endsWith('.jpg') || fn.endsWith('.jpeg')) return 'image/jpeg';
  if (fn.endsWith('.webp')) return 'image/webp';
  if (fn.endsWith('.doc')) return 'application/msword';
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

/**
 * Determine target file extension.
 */
export function getFileExtension(filename = '', fileType = 'docx') {
  const fn = String(filename || '').toLowerCase();
  const ft = String(fileType || '').toLowerCase();
  if (fn.includes('.')) {
    const ext = fn.slice(fn.lastIndexOf('.')).replace(/[^a-z0-9.]/gi, '');
    if (ext.length >= 2) return ext;
  }
  if (ft === 'pdf') return '.pdf';
  if (ft === 'image') return '.png';
  if (ft === 'doc') return '.doc';
  return '.docx';
}

/**
 * Convert buffer or base64 data to binary Buffer.
 */
function toBinaryBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') {
    const clean = data.replace(/^data:[^;]+;base64,/, '').trim();
    return Buffer.from(clean, 'base64');
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  throw new Error('Unsupported file data format for storage');
}

/**
 * Save a template binary to disk storage.
 *
 * @param {string} templateId - Unique template ID
 * @param {Buffer|string} fileData - Binary buffer or base64 string
 * @param {string} [filename] - Original filename
 * @param {string} [fileType='docx'] - File type category ('docx', 'pdf', 'image')
 * @returns {{ filePath: string, absolutePath: string, fileSize: number, fileHash: string, mimeType: string }}
 */
export function saveTemplateFile(templateId, fileData, filename = 'template.docx', fileType = 'docx') {
  initStorage();
  const buf = toBinaryBuffer(fileData);
  const ext = getFileExtension(filename, fileType);
  const safeFilename = `${templateId}${ext}`;
  const absolutePath = path.join(TEMPLATES_DIR, safeFilename);
  const relativePath = path.posix.join('templates', safeFilename);

  fs.writeFileSync(absolutePath, buf);

  const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
  const mimeType = getMimeType(filename, fileType);

  return {
    filePath: relativePath,
    absolutePath,
    fileSize: buf.length,
    fileHash,
    mimeType
  };
}

/**
 * Resolve absolute path from stored relative path or templateId.
 */
export function resolveTemplatePath(templateId, relativePath = null) {
  if (relativePath) {
    const clean = String(relativePath).replace(/\\/g, '/');
    const abs = path.resolve(STORAGE_BASE_DIR, clean);
    if (fs.existsSync(abs)) return abs;
  }
  // Fallbacks: check templates directory for templateId
  const candidateExtensions = ['.docx', '.doc', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
  for (const ext of candidateExtensions) {
    const candidate = path.join(TEMPLATES_DIR, `${templateId}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Read template binary from disk into a Buffer.
 *
 * @param {string} templateId
 * @param {string} [relativePath]
 * @returns {Buffer|null}
 */
export function getTemplateBuffer(templateId, relativePath = null) {
  const absPath = resolveTemplatePath(templateId, relativePath);
  if (!absPath || !fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath);
}

/**
 * Read template binary from disk as a base64 string.
 *
 * @param {string} templateId
 * @param {string} [relativePath]
 * @returns {string|null}
 */
export function getTemplateBase64(templateId, relativePath = null) {
  const buf = getTemplateBuffer(templateId, relativePath);
  if (!buf) return null;
  return buf.toString('base64');
}

/**
 * Stream a template file directly from disk to an Express response with minimal RAM overhead.
 *
 * @param {string} templateId
 * @param {string} relativePath
 * @param {object} res - Express response object
 * @param {string} [filename]
 * @param {string} [fileType='docx']
 * @returns {boolean} True if streamed, false if not found
 */
export function streamTemplateFile(templateId, relativePath, res, filename = 'template.docx', fileType = 'docx') {
  const absPath = resolveTemplatePath(templateId, relativePath);
  if (!absPath || !fs.existsSync(absPath)) return false;

  const stat = fs.statSync(absPath);
  const mime = getMimeType(filename, fileType);
  const disposition = (fileType === 'pdf' || fileType === 'image') ? 'inline' : 'attachment';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);

  const stream = fs.createReadStream(absPath);
  stream.pipe(res);
  return true;
}

/**
 * Delete a template file from disk.
 *
 * @param {string} templateId
 * @param {string} [relativePath]
 */
export function deleteTemplateFile(templateId, relativePath = null) {
  const absPath = resolveTemplatePath(templateId, relativePath);
  if (absPath && fs.existsSync(absPath)) {
    try {
      fs.unlinkSync(absPath);
      return true;
    } catch (err) {
      console.error(`[StorageEngine] Failed to delete template file ${absPath}:`, err);
    }
  }
  return false;
}

/**
 * Save a filled submission document or PDF to disk storage.
 *
 * @param {string} submissionId
 * @param {Buffer|string} fileData
 * @param {string} [filename='document.docx']
 * @returns {{ filePath: string, absolutePath: string, fileSize: number, fileHash: string }}
 */
export function saveSubmissionFile(submissionId, fileData, filename = 'document.docx') {
  initStorage();
  const buf = toBinaryBuffer(fileData);
  const ext = getFileExtension(filename);
  const safeFilename = `${submissionId}${ext}`;
  const absolutePath = path.join(SUBMISSIONS_DIR, safeFilename);
  const relativePath = path.posix.join('submissions', safeFilename);

  fs.writeFileSync(absolutePath, buf);
  const fileHash = crypto.createHash('sha256').update(buf).digest('hex');

  return {
    filePath: relativePath,
    absolutePath,
    fileSize: buf.length,
    fileHash
  };
}

/**
 * Purge all files in disk storage (used during factory reset / database wipe).
 */
export function purgeStorage() {
  try {
    const purgeDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        try {
          if (fs.statSync(full).isDirectory()) {
            purgeDir(full);
            fs.rmdirSync(full);
          } else {
            fs.unlinkSync(full);
          }
        } catch (_) {}
      }
    };

    purgeDir(TEMPLATES_DIR);
    purgeDir(SUBMISSIONS_DIR);
    purgeDir(TEMP_DIR);
    console.log('[StorageEngine] Disk storage purged successfully.');
  } catch (err) {
    console.error('[StorageEngine] Error purging disk storage:', err);
  }
}

/**
 * Migration helper: Scans PostgreSQL form_templates table.
 * If any template has base64 data in the database but no file on disk,
 * writes the file to disk, calculates hash and size, and updates the database row.
 *
 * @param {function} queryFn - PostgreSQL query function
 */
export async function migrateDatabaseTemplatesToDisk(queryFn) {
  initStorage();
  try {
    const res = await queryFn('SELECT id, docx_base64, docx_filename, file_type, file_path, file_size FROM form_templates');
    let migratedCount = 0;

    for (const t of res.rows) {
      const hasDiskFile = resolveTemplatePath(t.id, t.file_path);
      if (!hasDiskFile && t.docx_base64 && String(t.docx_base64).trim().length > 10) {
        const cleanBase64 = String(t.docx_base64).replace(/^data:[^;]+;base64,/, '').trim();
        const buf = Buffer.from(cleanBase64, 'base64');
        const filename = t.docx_filename || 'template.docx';
        const fileType = t.file_type || 'docx';

        const saved = saveTemplateFile(t.id, buf, filename, fileType);

        // Update database with file_path, file_size, file_hash and release docx_base64
        await queryFn(
          `UPDATE form_templates
           SET file_path = $1, file_size = $2, file_hash = $3, mime_type = $4, docx_base64 = NULL
           WHERE id = $5`,
          [saved.filePath, saved.fileSize, saved.fileHash, saved.mimeType, t.id]
        );
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      console.log(`[StorageEngine] Successfully migrated ${migratedCount} template(s) from database to disk storage.`);
    }
  } catch (err) {
    console.error('[StorageEngine] Error during database to disk migration:', err);
  }
}
