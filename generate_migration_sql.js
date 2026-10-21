const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const sqlitePath = path.join(__dirname, 'data', 'mamy_one.db');
const sqlite = new DatabaseSync(sqlitePath);

const TABLES = [
  'settings',
  'roles',
  'users',
  'classrooms',
  'employees',
  'student_code_sequence',
  'students',
  'guardians',
  'student_classification_history',
  'student_documents',
  'student_charges',
  'payments',
  'payment_allocations',
  'payment_refunds',
  'expense_categories',
  'expenses',
  'payroll_records',
  'salary_payments',
  'attendance',
  'sessions',
  'progress_reports',
  'communication_logs',
  'notifications',
  'audit_logs',
  'daily_closings'
];

function escapeSqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

let sqlOutput = `-- =====================================================================
-- MAMY ONE - COMPLETE BONTO PRODUCTION DATA (62 STUDENTS)
-- Clean Migration for Supabase PostgreSQL (Foreign Keys Compatible)
-- =====================================================================

BEGIN;

-- 1. Safely clean old temporary operational data
TRUNCATE TABLE 
  attendance,
  payment_allocations,
  payment_refunds,
  payments,
  student_charges,
  guardians,
  student_documents,
  student_classification_history,
  students,
  sessions,
  progress_reports,
  communication_logs,
  notifications,
  audit_logs,
  salary_payments,
  payroll_records,
  expenses,
  daily_closings,
  employees,
  classrooms,
  expense_categories
CASCADE;

`;

let totalRows = 0;

for (const table of TABLES) {
  try {
    const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
    if (!tableCheck) continue;

    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (!rows || rows.length === 0) continue;

    sqlOutput += `-- -----------------------------------------------------\n`;
    sqlOutput += `-- Table: ${table} (${rows.length} rows)\n`;
    sqlOutput += `-- -----------------------------------------------------\n`;
    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');

    for (const row of rows) {
      const valList = cols.map(c => escapeSqlVal(row[c])).join(', ');
      if (table === 'settings' || table === 'student_code_sequence') {
        sqlOutput += `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT (id) DO UPDATE SET ${cols.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')};\n`;
      } else if (table === 'users') {
        sqlOutput += `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT (id) DO UPDATE SET "username" = EXCLUDED."username", "full_name" = EXCLUDED."full_name", "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "is_active" = EXCLUDED."is_active";\n`;
      } else {
        sqlOutput += `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
      }
      totalRows++;
    }

    if (cols.includes('id') && table !== 'settings' && table !== 'student_code_sequence') {
      sqlOutput += `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true);\n`;
    }
    sqlOutput += '\n';
  } catch (e) {
    console.error(`Error reading ${table}:`, e.message);
  }
}

sqlOutput += `COMMIT;\n`;

const outPath = path.join(__dirname, 'supabase_bonto_data.sql');
fs.writeFileSync(outPath, sqlOutput, 'utf8');

console.log(`Successfully generated ${outPath} with ${totalRows} rows!`);
