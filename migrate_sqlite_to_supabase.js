/**
 * MAMY ONE - DATA MIGRATION TOOL: SQLite -> Supabase PostgreSQL
 * -------------------------------------------------------------
 * Usage:
 *   node migrate_sqlite_to_supabase.js "postgres://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres"
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

const dbUrl = process.argv[2] || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('\n[ERROR] Missing Supabase Database URL.');
  console.log('Usage: node migrate_sqlite_to_supabase.js "<DATABASE_URL>"\n');
  process.exit(1);
}

// Find local SQLite database
const sqlitePath = path.join(__dirname, 'data', 'mamy_one.db');
if (!fs.existsSync(sqlitePath)) {
  console.error(`\n[ERROR] SQLite database not found at: ${sqlitePath}\n`);
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath);
const pg = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

const TABLES_IN_ORDER = [
  'settings',
  'roles',
  'users',
  'classrooms',
  'employees',
  'student_code_sequence',
  'students',
  'student_classification_history',
  'guardians',
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

async function runMigration() {
  console.log('\n======================================================');
  console.log('  Mamy One: SQLite -> Supabase PostgreSQL Migration');
  console.log('======================================================');
  console.log(`- SQLite Source: ${sqlitePath}`);
  console.log(`- Supabase Target: Connected\n`);

  await pg.connect();

  let totalMigratedRows = 0;

  for (const table of TABLES_IN_ORDER) {
    try {
      // Check if table exists in SQLite
      const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
      if (!tableCheck) {
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (!rows || rows.length === 0) {
        console.log(`[ ] Table "${table}": 0 rows (skipped)`);
        continue;
      }

      console.log(`[*] Migrating table "${table}": ${rows.length} rows...`);

      // Disable foreign keys temporarily if needed or delete existing
      await pg.query(`TRUNCATE TABLE ${table} CASCADE;`).catch(() => {});

      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');

      for (const row of rows) {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map(c => row[c]);
        const insertSql = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING;`;
        await pg.query(insertSql, values);
        totalMigratedRows++;
      }

      // Reset sequence for SERIAL id if exists
      if (columns.includes('id')) {
        await pg.query(`
          SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true);
        `).catch(() => {});
      }

      console.log(`[✓] Table "${table}": ${rows.length} rows migrated successfully!`);
    } catch (err) {
      console.error(`[!] Error migrating table "${table}":`, err.message);
    }
  }

  console.log('\n======================================================');
  console.log(`✓ Migration Complete! Total rows migrated: ${totalMigratedRows}`);
  console.log('======================================================\n');

  await pg.end();
}

runMigration().catch(err => {
  console.error('\nFatal migration error:', err);
  process.exit(1);
});
