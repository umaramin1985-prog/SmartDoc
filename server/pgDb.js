import pkg from 'pg';
const { Client, Pool } = pkg;
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
import { generateUserCertificate } from './pkiEngine.js';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const host = process.env.PGHOST || 'localhost';
const port = parseInt(process.env.PGPORT || '5432', 10);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || 'Regency1';
const targetDatabase = process.env.PGDATABASE || 'smartdoc';

let poolInstance = null;

export function getPool() {
  if (!poolInstance) {
    poolInstance = new Pool({
      host,
      port,
      user,
      password,
      database: targetDatabase,
      ssl: false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    poolInstance.on('error', (err) => {
      console.error('[PostgreSQL Pool Unexpected Error]', err);
    });
  }
  return poolInstance;
}

export async function query(text, params) {
  const p = getPool();
  return await p.query(text, params);
}

// 1. Verify if database exists; if not, create it
async function ensureDatabaseExists() {
  console.log(`[PostgreSQL Setup] Checking if database "${targetDatabase}" exists on ${host}:${port}...`);
  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: false
  });

  try {
    await adminClient.connect();
    const checkRes = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase]
    );

    if (checkRes.rowCount === 0) {
      console.log(`[PostgreSQL Setup] Database "${targetDatabase}" does not exist. Creating now...`);
      // Database names cannot be parameterized in CREATE DATABASE statement
      await adminClient.query(`CREATE DATABASE "${targetDatabase}"`);
      console.log(`[PostgreSQL Setup] Database "${targetDatabase}" created successfully.`);
    } else {
      console.log(`[PostgreSQL Setup] Database "${targetDatabase}" already exists.`);
    }
  } catch (err) {
    console.error('[PostgreSQL Setup] Error checking/creating database:', err.message);
    throw err;
  } finally {
    await adminClient.end().catch(() => { });
  }
}

// 2. Initialize tables and the single Super Admin user from .env
export async function initPostgresDatabase() {
  // Step 1: Ensure database exists
  await ensureDatabaseExists();

  // Step 2: Connect to target database
  const p = getPool();
  console.log(`[PostgreSQL Setup] Connected to "${targetDatabase}". Ensuring tables exist...`);

  // Step 3: Create Tables
  await p.query(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) UNIQUE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(255) NOT NULL,
      system_role VARCHAR(64) NOT NULL,
      department VARCHAR(255) NOT NULL,
      ad_group VARCHAR(255) NOT NULL,
      avatar TEXT,
      status VARCHAR(32) DEFAULT 'ACTIVE',
      allowed_tabs JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login VARCHAR(128)
    );

    -- Ensure username column exists if upgrading existing table
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) UNIQUE;
    -- Saved hand-drawn signature (PNG data URL), reused when submitting / approving
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_image TEXT;
    -- PKI Digital Signature (RSA 2048-bit keypair & X.509 v3 Certificate)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_certificate_pem TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_public_key_pem TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_private_key_pem TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_serial_number VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_fingerprint VARCHAR(128);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_issued_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pki_expires_at TIMESTAMPTZ;
    -- Username-based auth: email and AD group are optional
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
    ALTER TABLE users ALTER COLUMN ad_group DROP NOT NULL;

    -- 2. Departments Table
    CREATE TABLE IF NOT EXISTS departments (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      code VARCHAR(64) UNIQUE NOT NULL,
      manager VARCHAR(255),
      sla_hours INTEGER DEFAULT 48,
      description TEXT,
      status VARCHAR(32) DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 3. Audit Logs Table (server-side activity ledger)
    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      action_type VARCHAR(128) NOT NULL,
      actor_email VARCHAR(255) NOT NULL,
      resource_name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      sha256 VARCHAR(128) NOT NULL,
      verified BOOLEAN DEFAULT TRUE
    );

    -- 4. Word Form Templates (uploaded .docx with {{placeholders}}; admins only)
    CREATE TABLE IF NOT EXISTS form_templates (
      id VARCHAR(64) PRIMARY KEY,
      unique_code VARCHAR(64) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(128) DEFAULT 'Standard',
      version VARCHAR(32) DEFAULT '1.0',
      created_by VARCHAR(255),
      created_by_username VARCHAR(64),
      fields JSONB NOT NULL DEFAULT '[]',
      subforms JSONB NOT NULL DEFAULT '[]',
      workflow JSONB NOT NULL DEFAULT '[]',
      default_expiry_days INTEGER DEFAULT 14,
      status VARCHAR(32) DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 5. Form Submissions (filled by users, routed through department approval chain)
    CREATE TABLE IF NOT EXISTS form_submissions (
      id VARCHAR(64) PRIMARY KEY,
      template_id VARCHAR(64) NOT NULL,
      unique_number VARCHAR(64) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      submitted_by_id VARCHAR(64),
      submitted_by_name VARCHAR(255),
      submitted_by_username VARCHAR(64),
      version VARCHAR(32) DEFAULT '1.0',
      version_history JSONB NOT NULL DEFAULT '[]',
      form_data JSONB NOT NULL DEFAULT '{}',
      subforms_data JSONB NOT NULL DEFAULT '{}',
      signature TEXT,
      signed_at TIMESTAMPTZ,
      expiry_date VARCHAR(64) NOT NULL,
      status VARCHAR(64) DEFAULT 'SUBMITTED',
      current_workflow_step INTEGER DEFAULT 2,
      workflow JSONB NOT NULL DEFAULT '[]',
      objection_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 6. Departmental Team Communication Messages
    CREATE TABLE IF NOT EXISTS department_messages (
      id VARCHAR(64) PRIMARY KEY,
      department VARCHAR(255) NOT NULL,
      sender_id VARCHAR(64) NOT NULL,
      sender_username VARCHAR(64) NOT NULL,
      sender_name VARCHAR(255) NOT NULL,
      sender_role VARCHAR(64) NOT NULL,
      message TEXT NOT NULL,
      form_ref_id VARCHAR(64),
      form_ref_title VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 7. Explorer Folders (Department-scoped hierarchical folder structure)
    CREATE TABLE IF NOT EXISTS folders (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      parent_id VARCHAR(64) REFERENCES folders(id) ON DELETE CASCADE,
      created_by_id VARCHAR(64),
      created_by_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Word template columns (upgrade-safe)
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS docx_base64 TEXT;
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS docx_filename VARCHAR(255);
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS audience VARCHAR(16) DEFAULT 'DEPARTMENT';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS signature_slots JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS system_tags JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS folder_id VARCHAR(64) REFERENCES folders(id) ON DELETE SET NULL;
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS html_content TEXT;
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS file_type VARCHAR(16) DEFAULT 'docx';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS is_editable BOOLEAN DEFAULT TRUE;
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS access_type VARCHAR(32) DEFAULT 'ALL';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS allowed_departments JSONB DEFAULT '[]';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS allowed_users JSONB DEFAULT '[]';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]';
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS font_family VARCHAR(128);
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS font_size VARCHAR(32);
    ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS file_size INTEGER;

    ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS folder_id VARCHAR(64) REFERENCES folders(id) ON DELETE SET NULL;
    ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]';
    ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS pki_signature JSONB;

    -- 8. Template reviews: a draft form is sent to reviewers who each edit their own copy;
    --    the initiator then accepts / rejects every change before publishing.
    CREATE TABLE IF NOT EXISTS template_reviews (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL,
      initiator_id VARCHAR(64) NOT NULL,
      initiator_name VARCHAR(255),
      message TEXT,
      settings JSONB NOT NULL DEFAULT '{}',
      base_html TEXT NOT NULL,
      decisions JSONB NOT NULL DEFAULT '{}',
      final_html TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'IN_REVIEW',
      published_template_id VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS template_review_reviewers (
      review_id VARCHAR(64) NOT NULL REFERENCES template_reviews(id) ON DELETE CASCADE,
      user_id VARCHAR(64) NOT NULL,
      user_name VARCHAR(255),
      department VARCHAR(255),
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      html TEXT,
      comment TEXT,
      has_changes BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ,
      PRIMARY KEY (review_id, user_id)
    );

    -- 9. Notification System for approvals, signatures, and reviews
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      link_type VARCHAR(32),
      link_id VARCHAR(64),
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_email);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_dept ON audit_logs(department);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type);
  `);

  console.log('[PostgreSQL Setup] Tables verified.');

  // Step 4: Create default Super Admin User exclusively from .env (NO MOCK USERS, NO PICTURE)
  const adminUsername = (process.env.SUPER_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartdoc.com').trim().toLowerCase();
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.SUPER_ADMIN_NAME || 'Super Administrator';

  const userCheck = await p.query(
    'SELECT id, username, email, password FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $2',
    [adminUsername, adminEmail]
  );

  const allTabs = JSON.stringify(['dashboard', 'forms', 'approvals', 'dept-messaging', 'settings']);

  if (userCheck.rowCount === 0) {
    console.log(`[PostgreSQL Setup] Provisioning default Super Admin user (${adminUsername}) from .env...`);
    await p.query(`
      INSERT INTO users (
        id, username, name, email, password, role, system_role, department, ad_group, avatar, status, allowed_tabs, created_at, last_login
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW(), $13
      )
    `, [
      'admin.super',
      adminUsername,
      adminName,
      adminEmail,
      adminPassword,
      'Super Administrator',
      'superadmin',
      'IT & Systems',
      'AD-Executive-Board',
      null, // No fake pictures
      'ACTIVE',
      allTabs,
      'Never'
    ]);
    console.log(`[PostgreSQL Setup] Super Admin user (${adminUsername}) created successfully.`);
  } else {
    // Keep credentials in sync with .env and enforce the superadmin role
    await p.query(`
      UPDATE users 
      SET username = $1, password = $2, name = $3, allowed_tabs = $4::jsonb,
          system_role = 'superadmin', role = 'Super Administrator'
      WHERE id = $5
    `, [adminUsername, adminPassword, adminName, allTabs, userCheck.rows[0].id]);
    console.log(`[PostgreSQL Setup] Super Admin user (${adminUsername}) already exists. Credentials synced with .env.`);
  }

  // Step 5: Seed Base Departments if empty
  const deptCount = await p.query('SELECT COUNT(*) as count FROM departments');
  if (parseInt(deptCount.rows[0].count, 10) === 0) {
    console.log('[PostgreSQL Setup] Seeding standard enterprise departments...');
    const defaultDepts = [
      { id: 'dept-hr', name: 'Human Resources', code: 'HR', manager: 'HR Director', sla: 24, desc: 'People operations, talent, and vehicle/equipment requests.' },
      { id: 'dept-fin', name: 'Finance & Accounting', code: 'FIN', manager: 'Finance Controller', sla: 48, desc: 'Budgeting, financial authorizations, and vendor spend approvals.' },
      { id: 'dept-ops', name: 'Corporate Operations', code: 'OPS', manager: 'Operations VP', sla: 36, desc: 'Facilities, asset allocation, logistics, and supply chain.' },
      { id: 'dept-leg', name: 'Legal & Compliance', code: 'LEGAL', manager: 'General Counsel', sla: 48, desc: 'Regulatory filings, NDAs, and commercial governance.' },
      { id: 'dept-it', name: 'IT & Systems', code: 'IT', manager: 'Chief Information Officer', sla: 12, desc: 'Infrastructure, permissions, security, and administrative services.' }
    ];

    for (const d of defaultDepts) {
      await p.query(`
        INSERT INTO departments (id, name, code, manager, sla_hours, description, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
        ON CONFLICT (name) DO NOTHING
      `, [d.id, d.name, d.code, d.manager, d.sla, d.desc]);
    }
  }

  // No form templates are seeded: admins upload their own Word (.docx) templates.

  // Step 6: Provision PKI X.509 Certificates & RSA Key Pairs for all users lacking one
  const uncertUsers = await p.query(
    'SELECT id, username, name, email, department FROM users WHERE pki_certificate_pem IS NULL OR pki_private_key_pem IS NULL'
  );
  if (uncertUsers.rowCount > 0) {
    console.log(`[PostgreSQL Setup] Provisioning enterprise PKI certificates for ${uncertUsers.rowCount} user(s)...`);
    for (const u of uncertUsers.rows) {
      try {
        const certData = generateUserCertificate(u);
        await p.query(`
          UPDATE users 
          SET pki_certificate_pem = $1, pki_public_key_pem = $2, pki_private_key_pem = $3,
              pki_serial_number = $4, pki_fingerprint = $5, pki_issued_at = $6, pki_expires_at = $7
          WHERE id = $8
        `, [
          certData.certificatePem, certData.publicKeyPem, certData.privateKeyPem,
          certData.serialNumber, certData.fingerprint, certData.issuedAt, certData.expiresAt,
          u.id
        ]);
        console.log(`[PostgreSQL Setup] Provisioned PKI certificate for ${u.username} (Serial: ${certData.serialNumber}, SHA256: ${certData.fingerprint})`);
      } catch (err) {
        console.error(`[PostgreSQL Setup] Failed to provision PKI certificate for ${u.username}:`, err);
      }
    }
  }

  // Step 7: Initial System Audit Log
  const auditCheck = await p.query("SELECT COUNT(*) as count FROM audit_logs WHERE action_type = 'SYSTEM_INIT'");
  if (parseInt(auditCheck.rows[0].count, 10) === 0) {
    await p.query(`
      INSERT INTO audit_logs (id, timestamp, action_type, actor_email, resource_name, department, sha256, verified)
      VALUES ($1, NOW(), 'SYSTEM_INIT', $2, 'PostgreSQL Database Initialized', 'IT & Systems', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', TRUE)
    `, ['AUD-PG-INIT-001', adminEmail]);
  }

  console.log('[PostgreSQL Setup] Database initialization complete.');
}

// 3. Factory Reset: Wipe all application data while preserving superadmin
export async function wipeAllData(actorName = 'Super Administrator') {
  const p = getPool();
  console.log(`[PostgreSQL] System wipe initiated by ${actorName}...`);

  // 1. Truncate all submissions and review data
  await p.query('TRUNCATE TABLE form_submissions CASCADE');
  await p.query('TRUNCATE TABLE template_review_reviewers CASCADE');
  await p.query('TRUNCATE TABLE template_reviews CASCADE');

  // 2. Truncate all templates and folders
  await p.query('TRUNCATE TABLE form_templates CASCADE');
  await p.query('TRUNCATE TABLE folders CASCADE');

  // 3. Truncate messages and notifications
  await p.query('TRUNCATE TABLE department_messages CASCADE');
  await p.query('TRUNCATE TABLE notifications CASCADE');

  // 4. Delete all users except superadmin
  await p.query("DELETE FROM users WHERE system_role != 'superadmin'");

  // 5. Reset departments to standard base enterprise departments
  await p.query('TRUNCATE TABLE departments CASCADE');
  const defaultDepts = [
    { id: 'dept-hr', name: 'Human Resources', code: 'HR', manager: 'HR Director', sla: 24, desc: 'People operations, talent, and vehicle/equipment requests.' },
    { id: 'dept-fin', name: 'Finance & Accounting', code: 'FIN', manager: 'Finance Controller', sla: 48, desc: 'Budgeting, financial authorizations, and vendor spend approvals.' },
    { id: 'dept-ops', name: 'Corporate Operations', code: 'OPS', manager: 'Operations VP', sla: 36, desc: 'Facilities, asset allocation, logistics, and supply chain.' },
    { id: 'dept-leg', name: 'Legal & Compliance', code: 'LEGAL', manager: 'General Counsel', sla: 48, desc: 'Regulatory filings, NDAs, and commercial governance.' },
    { id: 'dept-it', name: 'IT & Systems', code: 'IT', manager: 'Chief Information Officer', sla: 12, desc: 'Infrastructure, permissions, security, and administrative services.' }
  ];
  for (const d of defaultDepts) {
    await p.query(`
      INSERT INTO departments (id, name, code, manager, sla_hours, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
      ON CONFLICT (name) DO NOTHING
    `, [d.id, d.name, d.code, d.manager, d.sla, d.desc]);
  }

  // 6. Reset audit logs and record wipe event
  await p.query('TRUNCATE TABLE audit_logs CASCADE');
  await p.query(`
    INSERT INTO audit_logs (id, timestamp, action_type, actor_email, resource_name, department, sha256, verified)
    VALUES ($1, NOW(), 'SYSTEM_WIPED', $2, 'Factory Reset: All user data wiped', 'IT & Systems', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', TRUE)
  `, [`AUD-WIPE-${Date.now()}`, actorName]);

  console.log('[PostgreSQL] System wipe complete.');
  return true;
}

// 4. Reset Forms Only: Wipe all templates, folders, submissions and reviews, preserving users & departments
export async function wipeFormsOnly(actorName = 'Super Administrator') {
  const p = getPool();
  console.log(`[PostgreSQL] Forms wipe initiated by ${actorName}...`);

  // 1. Truncate submissions and review data
  await p.query('TRUNCATE TABLE form_submissions CASCADE');
  await p.query('TRUNCATE TABLE template_review_reviewers CASCADE');
  await p.query('TRUNCATE TABLE template_reviews CASCADE');

  // 2. Truncate templates and folders
  await p.query('TRUNCATE TABLE form_templates CASCADE');
  await p.query('TRUNCATE TABLE folders CASCADE');

  // 3. Clear form/submission-related notifications
  await p.query("DELETE FROM notifications WHERE link_type IN ('form', 'submission', 'review', 'template')");

  // 4. Record audit event
  await p.query(`
    INSERT INTO audit_logs (id, timestamp, action_type, actor_email, resource_name, department, sha256, verified)
    VALUES ($1, NOW(), 'FORMS_WIPED', $2, 'Reset: All forms, templates, folders, and submissions wiped', 'General', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', TRUE)
  `, [`AUD-FORMS-WIPE-${Date.now()}`, actorName]);

  console.log('[PostgreSQL] Forms wipe complete.');
  return true;
}


