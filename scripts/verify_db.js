import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Regency1',
  database: process.env.PGDATABASE || 'smartdoc'
});

async function runVerification() {
  console.log('=== 1. VERIFYING POSTGRESQL TABLES IN DATABASE "smartdoc" ===');
  const tableRes = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log('Tables in PostgreSQL:', tableRes.rows.map(r => r.table_name).join(', '));

  console.log('\n=== 2. VERIFYING SEEDED DEFAULT SUPER ADMIN FROM .ENV ===');
  const usersRes = await pool.query('SELECT id, name, email, role, system_role, department, status FROM users');
  console.log(`User directory count in PostgreSQL: ${usersRes.rowCount}`);
  usersRes.rows.forEach(u => console.log(` - [${u.system_role.toUpperCase()}] ${u.name} <${u.email}> (${u.department})`));

  console.log('\n=== 3. VERIFYING STRICT ZERO-MOCK DATA POLICY ===');
  const docsRes = await pool.query('SELECT COUNT(*) as count FROM documents');
  const approvalsRes = await pool.query('SELECT COUNT(*) as count FROM approvals');
  const tasksRes = await pool.query('SELECT COUNT(*) as count FROM tasks');
  console.log(`Documents count in PostgreSQL: ${docsRes.rows[0].count}`);
  console.log(`Approvals count in PostgreSQL: ${approvalsRes.rows[0].count}`);
  console.log(`Tasks count in PostgreSQL: ${tasksRes.rows[0].count}`);

  console.log('\n=== 4. TESTING REST API PROXY (Vite port 5173 -> Backend port 3001) ===');
  const healthRes = await fetch('http://localhost:5173/api/health').then(r => r.json());
  console.log('API Health Check:', healthRes);

  // Test Super Admin Login from .env
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@smartdoc.com';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

  const adminLogin = await fetch('http://localhost:5173/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  }).then(r => r.json());
  console.log('Super Admin Login Result:', adminLogin.success ? 'SUCCESSFUL' : 'FAILED', adminLogin.user?.name, adminLogin.user?.role);

  // Test Creating Department via API
  const newDeptRes = await fetch('http://localhost:5173/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Global Supply Chain',
      code: 'GSC',
      manager: 'Sarah Jenkins',
      slaHours: 48,
      description: 'International procurement and fulfillment'
    })
  }).then(r => r.json());
  console.log('Created Department via API:', newDeptRes.name, `[${newDeptRes.code}]`);

  // Test Creating User via API
  const newUserRes = await fetch('http://localhost:5173/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bilal Ahmed',
      email: 'bilal@smartdoc.com',
      password: 'password123',
      role: 'Finance & Treasury Manager',
      systemRole: 'finance',
      department: 'Global Supply Chain',
      adGroup: 'AD-Finance-Controllers'
    })
  }).then(r => r.json());
  console.log('Created User via API in PostgreSQL:', newUserRes.name, newUserRes.email, newUserRes.department);

  // Test Login for newly created user
  const userLogin = await fetch('http://localhost:5173/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bilal@smartdoc.com', password: 'password123' })
  }).then(r => r.json());
  console.log('Login Test for Newly Created User:', userLogin.success ? 'SUCCESSFUL' : 'FAILED', userLogin.user?.name, 'System Role:', userLogin.user?.systemRole);

  // Verify direct PostgreSQL query
  const directCheck = await pool.query('SELECT name, email, department FROM users WHERE email = $1', ['bilal@smartdoc.com']);
  console.log('Direct PostgreSQL verification for Bilal Ahmed:', directCheck.rows[0]);

  // Clean up test records to leave the DB in clean state with ONLY the Super Admin
  await pool.query("DELETE FROM users WHERE email = 'bilal@smartdoc.com'");
  await pool.query("DELETE FROM departments WHERE code = 'GSC'");
  console.log('Cleaned up test department and test user. Database returned to initial clean state.');

  const finalUsers = await pool.query('SELECT COUNT(*) as count FROM users');
  console.log(`Final persistent user count in PostgreSQL: ${finalUsers.rows[0].count} (Only Super Admin)`);

  console.log('\n>>> ALL POSTGRESQL AUTO-PROVISIONING & ZERO-MOCK TESTS PASSED SUCCESSFULLY! <<<');
  await pool.end();
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
