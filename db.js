const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const isPostgres = Boolean(process.env.DATABASE_URL);

// Async local storage for transaction management
const txContext = new AsyncLocalStorage();

let db;
let pool = null;
let sqliteDb = null;

/**
 * Helper to get current timestamp in Africa/Cairo timezone (YYYY-MM-DD HH:mm:ss)
 */
function getCairoNow() {
  const d = new Date();
  const options = {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const parts = new Intl.DateTimeFormat('sv-SE', options).format(d);
  return parts.replace('T', ' ');
}

/**
 * Helper to get current date in Africa/Cairo timezone (YYYY-MM-DD)
 */
function getCairoDate() {
  const d = new Date();
  const options = {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  return new Intl.DateTimeFormat('sv-SE', options).format(d);
}

/**
 * Hash password with PBKDF2
 */
function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return check === hash;
}

/**
 * SQL dialect converter: translates SQLite syntax to PostgreSQL
 */
function convertSql(sql) {
  // 1. Convert date(?) to date(?::text) to prevent Postgres untyped parameter errors
  let s = sql.replace(/\bdate\s*\(\s*\?\s*\)/gi, 'date(?::text)');

  // 2. Convert SQLite ? placeholders to PostgreSQL $1, $2, ...
  let paramIndex = 1;
  let inString = false;
  let stringChar = '';
  let result = '';

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (inString) {
      result += char;
      if (char === stringChar) {
        if (s[i + 1] === stringChar) {
          result += s[++i]; // escaped quote
        } else {
          inString = false;
        }
      }
    } else {
      if (char === "'" || char === '"') {
        inString = true;
        stringChar = char;
        result += char;
      } else if (char === '?') {
        result += '$' + paramIndex++;
      } else {
        result += char;
      }
    }
  }

  // 3. For INSERT statements without RETURNING, append RETURNING id
  const trimmed = result.trim();
  if (/^INSERT\s+INTO\b/i.test(trimmed) && !/\bRETURNING\b/i.test(trimmed)) {
    result += ' RETURNING id';
  }

  return result;
}

/**
 * Clean query parameters for PostgreSQL
 */
function sanitizeParams(args) {
  const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return params.map(p => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'number' && Number.isNaN(p)) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

if (isPostgres) {
  // -------------------------------------------------------------------------
  // PostgreSQL / Supabase Driver (Cloud Mode)
  // -------------------------------------------------------------------------
  const { Pool, types } = require('pg');

  // Parse NUMERIC (OID 1700) as float and BIGINT (OID 20) as integer
  types.setTypeParser(1700, val => (val === null ? null : parseFloat(val)));
  types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));

  let connString = process.env.DATABASE_URL || '';
  if (connString.includes('.supabase.co')) {
    const match = connString.match(/postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co/);
    if (match) {
      const password = match[1];
      const projectRef = match[2];
      // Supabase direct host db.<ref>.supabase.co is IPv6 only, which Vercel cannot route.
      // Automatically route to the Supabase IPv4 Pooler (Session Mode port 5432):
      connString = `postgresql://postgres.${projectRef}:${password}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
      console.log('Auto-routed Supabase connection to IPv4 Pooler');
    }
  }

  pool = new Pool({
    connectionString: connString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });

  function getPgRunner() {
    const store = txContext.getStore();
    if (store && store.client) {
      return store.client;
    }
    return pool;
  }

  db = {
    prepare(sql) {
      const pgSql = convertSql(sql);
      return {
        async get(...args) {
          const params = sanitizeParams(args);
          const runner = getPgRunner();
          const res = await runner.query(pgSql, params);
          return res.rows[0] || undefined;
        },
        async all(...args) {
          const params = sanitizeParams(args);
          const runner = getPgRunner();
          const res = await runner.query(pgSql, params);
          return res.rows || [];
        },
        async run(...args) {
          const params = sanitizeParams(args);
          const runner = getPgRunner();
          const res = await runner.query(pgSql, params);
          let lastInsertRowid = null;
          if (res.rows && res.rows[0] && res.rows[0].id !== undefined) {
            lastInsertRowid = Number(res.rows[0].id);
          }
          return {
            lastInsertRowid,
            changes: res.rowCount || 0
          };
        }
      };
    },

    async exec(sql) {
      const clean = sql.trim().toUpperCase();
      const store = txContext.getStore();

      if (clean.startsWith('BEGIN')) {
        if (store && store.client) return; // Already in transaction
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (store) {
            store.client = client;
          }
        } catch (err) {
          client.release();
          throw err;
        }
        return;
      }

      if (clean.startsWith('COMMIT')) {
        if (store && store.client) {
          try {
            await store.client.query('COMMIT');
          } finally {
            store.client.release();
            store.client = null;
          }
        }
        return;
      }

      if (clean.startsWith('ROLLBACK')) {
        if (store && store.client) {
          try {
            await store.client.query('ROLLBACK');
          } finally {
            store.client.release();
            store.client = null;
          }
        }
        return;
      }

      const runner = getPgRunner();
      await runner.query(sql);
    }
  };

} else {
  // -------------------------------------------------------------------------
  // SQLite Driver (Local Offline Mode)
  // -------------------------------------------------------------------------
  const { DatabaseSync } = require('node:sqlite');

  const DB_PATH = process.env.MAMY_DB_PATH || path.join(__dirname, 'data', 'mamy_one.db');

  if (DB_PATH !== ':memory:') {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  sqliteDb = new DatabaseSync(DB_PATH);

  try {
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
  } catch (e) {
    // Ignore pragma errors if in memory or constrained
  }

  db = {
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      return {
        get(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          return stmt.get(...params);
        },
        all(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          return stmt.all(...params);
        },
        run(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          return stmt.run(...params);
        }
      };
    },
    exec(sql) {
      return sqliteDb.exec(sql);
    }
  };

  // Initialize SQLite schema
  initSQLiteSchema();
}

/**
 * Execute a block within database context (manages automatic transaction cleanup)
 */
async function runInDbContext(fn) {
  if (!isPostgres) {
    return await fn();
  }
  return txContext.run({ client: null }, async () => {
    try {
      return await fn();
    } finally {
      const store = txContext.getStore();
      if (store && store.client) {
        try {
          await store.client.query('ROLLBACK');
        } catch (e) {}
        store.client.release();
        store.client = null;
      }
    }
  });
}

/**
 * Initialize SQLite schema (for local offline mode)
 */
function initSQLiteSchema() {
  if (!sqliteDb) return;
  sqliteDb.exec(`
    -- System Settings
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nursery_name TEXT NOT NULL DEFAULT 'حضانة مامي وان',
      slogan TEXT DEFAULT 'بيئة تعليمية وتربوية متكاملة لأطفالنا',
      phone TEXT DEFAULT '01012345678',
      phone_secondary TEXT DEFAULT '01123456789',
      address TEXT DEFAULT 'القاهرة - مصر',
      email TEXT DEFAULT 'info@mamyone.com',
      currency TEXT DEFAULT 'ج.م',
      timezone TEXT DEFAULT 'Africa/Cairo',
      daily_cash_opening REAL DEFAULT 0,
      receipt_footer TEXT DEFAULT 'شكراً لاختياركم حضانة مامي وان - نعتز بثقتكم ونسعى دائماً لأفضل رعاية لأبنائكم',
      reminder_time TEXT DEFAULT '09:00',
      auto_reminders_enabled INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    -- Roles and Permissions
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL,
      created_at TEXT
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'teacher',
      permissions TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- Classrooms / Groups
    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age_group TEXT,
      capacity INTEGER DEFAULT 15,
      lead_teacher_id INTEGER,
      notes TEXT,
      created_at TEXT
    );

    -- Employees & Teachers
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      photo TEXT,
      job_title TEXT NOT NULL,
      department TEXT,
      classroom_id INTEGER REFERENCES classrooms(id) ON DELETE SET NULL,
      mobile TEXT NOT NULL,
      start_date TEXT,
      agreed_salary REAL NOT NULL DEFAULT 0,
      payment_schedule TEXT DEFAULT 'monthly',
      status TEXT DEFAULT 'active',
      confidential_notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- Student Code Sequence: Guarantees unique sequential codes starting strictly at 1001
    CREATE TABLE IF NOT EXISTS student_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_code INTEGER NOT NULL
    );

    -- Students
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT DEFAULT 'ذكر',
      photo TEXT,
      enrollment_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      classification TEXT NOT NULL DEFAULT 'regular',
      classroom_id INTEGER REFERENCES classrooms(id) ON DELETE SET NULL,
      teacher_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      monthly_tuition REAL NOT NULL DEFAULT 0,
      payment_due_day INTEGER DEFAULT 1,
      discount_amount REAL DEFAULT 0,
      discount_reason TEXT,
      medical_notes TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- Classification Change History
    CREATE TABLE IF NOT EXISTS student_classification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      old_classification TEXT,
      new_classification TEXT NOT NULL,
      reason TEXT,
      changed_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- Guardians (Parents)
    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      is_primary INTEGER DEFAULT 1,
      mobile TEXT NOT NULL,
      mobile_secondary TEXT,
      email TEXT,
      job TEXT,
      national_id TEXT,
      address TEXT,
      emergency_contact TEXT,
      notes TEXT,
      created_at TEXT
    );

    -- Student Documents
    CREATE TABLE IF NOT EXISTS student_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      file_path TEXT,
      notes TEXT,
      created_at TEXT
    );

    -- Student Charges (Tuition and Additional Fees)
    CREATE TABLE IF NOT EXISTS student_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      charge_type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      discount REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      charge_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      billing_month TEXT,
      session_id INTEGER,
      status TEXT DEFAULT 'unpaid',
      paid_amount REAL DEFAULT 0,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    );

    -- Payments Ledger
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT UNIQUE NOT NULL,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_time TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_category TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      attachment TEXT,
      recorded_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    );

    -- Payment Allocations to Charges
    CREATE TABLE IF NOT EXISTS payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      charge_id INTEGER NOT NULL REFERENCES student_charges(id) ON DELETE RESTRICT,
      allocated_amount REAL NOT NULL,
      created_at TEXT
    );

    -- Payment Reversals, Corrections & Refunds
    CREATE TABLE IF NOT EXISTS payment_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL REFERENCES payments(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      refund_date TEXT NOT NULL,
      refund_method TEXT NOT NULL,
      approved_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    -- Expense Categories
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      is_custom INTEGER DEFAULT 0,
      created_at TEXT
    );

    -- Expenses Ledger
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_no TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      custom_category_name TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      expense_date TEXT NOT NULL,
      payment_date TEXT,
      payment_status TEXT NOT NULL DEFAULT 'paid',
      payment_method TEXT DEFAULT 'cash',
      recipient_supplier TEXT,
      salary_payment_id INTEGER,
      receipt_doc TEXT,
      notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    );

    -- Payroll Records (Monthly Salary Generation)
    CREATE TABLE IF NOT EXISTS payroll_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      month TEXT NOT NULL,
      base_salary REAL NOT NULL,
      bonuses REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      advances REAL DEFAULT 0,
      net_salary REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(employee_id, month)
    );

    -- Salary Payments
    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_id INTEGER NOT NULL REFERENCES payroll_records(id),
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      expense_id INTEGER REFERENCES expenses(id),
      recorded_by_user_id INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT
    );

    -- Attendance
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      classroom_id INTEGER REFERENCES classrooms(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      arrival_time TEXT,
      departure_time TEXT,
      reason TEXT,
      notes TEXT,
      recorded_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(student_id, date)
    );

    -- Lessons & Therapy Sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES employees(id),
      session_type TEXT NOT NULL,
      session_date TEXT NOT NULL,
      start_time TEXT,
      duration_minutes INTEGER DEFAULT 45,
      status TEXT NOT NULL DEFAULT 'completed',
      fee_amount REAL DEFAULT 0,
      is_billed INTEGER DEFAULT 0,
      charge_id INTEGER REFERENCES student_charges(id),
      progress_notes TEXT,
      recommendations TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    );

    -- Progress Reports
    CREATE TABLE IF NOT EXISTS progress_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      report_type TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      evaluation_summary TEXT,
      skills_rating TEXT,
      teacher_notes TEXT,
      recommendations TEXT,
      status TEXT DEFAULT 'draft',
      prepared_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    );

    -- Parent Communication Logs
    CREATE TABLE IF NOT EXISTS communication_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      message_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      message_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_by_user_id INTEGER REFERENCES users(id),
      sent_at TEXT NOT NULL,
      created_at TEXT
    );

    -- System Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      reason TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    -- Daily Cash Closings
    CREATE TABLE IF NOT EXISTS daily_closings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closing_date TEXT UNIQUE NOT NULL,
      opening_balance REAL NOT NULL,
      cash_in REAL NOT NULL,
      cash_out REAL NOT NULL,
      refunds REAL NOT NULL DEFAULT 0,
      closing_balance REAL NOT NULL,
      actual_cash_counted REAL,
      difference REAL DEFAULT 0,
      status TEXT DEFAULT 'closed',
      notes TEXT,
      closed_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_students_code ON students(code);
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id);
    CREATE INDEX IF NOT EXISTS idx_charges_student ON student_charges(student_id);
    CREATE INDEX IF NOT EXISTS idx_charges_status ON student_charges(status);
    CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);
  `);

  // Seed default settings if empty
  const settingsCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    sqliteDb.prepare(`
      INSERT INTO settings (id, nursery_name, slogan, phone, email, address, currency, created_at, updated_at)
      VALUES (1, 'حضانة مامي وان', 'بيئة تعليمية وتربوية متكاملة لأطفالنا', '01012345678', 'info@mamyone.com', 'القاهرة - مصر', 'ج.م', ?, ?)
    `).run(getCairoNow(), getCairoNow());
  }

  // Initialize and sync student_code_sequence with current state
  const existingStuds = sqliteDb.prepare('SELECT code FROM students WHERE code >= 1001').all();
  const takenCodes = new Set(existingStuds.map(r => Number(r.code)));
  let lowestFree = 1001;
  while (takenCodes.has(lowestFree)) {
    lowestFree++;
  }
  const seq = sqliteDb.prepare('SELECT COUNT(*) as count FROM student_code_sequence').get();
  if (seq.count === 0) {
    sqliteDb.prepare('INSERT INTO student_code_sequence (id, next_code) VALUES (1, ?)').run(lowestFree);
  } else {
    sqliteDb.prepare('UPDATE student_code_sequence SET next_code = ? WHERE id = 1').run(lowestFree);
  }

  // Seed standard expense categories if empty
  const expCatCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM expense_categories').get();
  if (expCatCount.count === 0) {
    const defaultCategories = [
      { code: 'teacher_salary', name: 'رواتب معلمات' },
      { code: 'employee_salary', name: 'رواتب موظفين وإداريين' },
      { code: 'rent', name: 'إيجار المقر' },
      { code: 'utilities', name: 'كهرباء ومياه وغاز' },
      { code: 'maintenance', name: 'نظافة وصيانة وتجديدات' },
      { code: 'supplies', name: 'أدوات ومستلزمات تعليمية' },
      { code: 'books', name: 'كتب ومناهج دراسية' },
      { code: 'food', name: 'وجبات وأغذية وضيافة' },
      { code: 'transport', name: 'انتقالات وباصات' },
      { code: 'medical', name: 'مستلزمات طبية وإسعافات أولية' },
      { code: 'marketing', name: 'تسويق وإعلانات ومطبوعات' },
      { code: 'other', name: 'مصروفات أخرى ونثرية' }
    ];
    const insertCat = sqliteDb.prepare('INSERT INTO expense_categories (code, name, is_custom, created_at) VALUES (?, ?, 0, ?)');
    for (const c of defaultCategories) {
      insertCat.run(c.code, c.name, getCairoNow());
    }
  }

  // Seed default roles if empty
  const roleCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM roles').get();
  if (roleCount.count === 0) {
    const rolesList = [
      {
        name: 'admin',
        display_name: 'مدير عام / إدارة عليا',
        description: 'صلاحيات كاملة وغير محدودة للنظام والماليات والإعدادات',
        permissions: JSON.stringify(['*'])
      },
      {
        name: 'accountant',
        display_name: 'محاسب / مسؤول مالي',
        description: 'إدارة المدفوعات والرسوم والمصروفات والرواتب والتقارير المالية',
        permissions: JSON.stringify([
          'students_view', 'guardians_view_contact', 'finances_view',
          'payments_record', 'payments_refund', 'expenses_manage',
          'payroll_manage', 'financial_reports', 'export_data', 'notifications_view'
        ])
      },
      {
        name: 'teacher',
        display_name: 'معلمة / أخصائية',
        description: 'تسجيل الحضور والجلسات والتقارير التربوية ومتابعة الأطفال',
        permissions: JSON.stringify([
          'students_view', 'students_edit', 'attendance_record',
          'attendance_view', 'sessions_manage', 'reports_create'
        ])
      }
    ];
    const insertRole = sqliteDb.prepare('INSERT INTO roles (name, display_name, description, permissions, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const r of rolesList) {
      insertRole.run(r.name, r.display_name, r.description, r.permissions, getCairoNow());
    }
  }

  // Seed default Admin user if no users exist
  const userCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const { hash, salt } = hashPassword('admin123');
    sqliteDb.prepare(`
      INSERT INTO users (username, password_hash, salt, full_name, role, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, 1, ?, ?)
    `).run('admin', hash, salt, 'مدير النظام (Admin)', JSON.stringify(['*']), getCairoNow(), getCairoNow());
  }

  // Seed default classrooms if empty
  const classCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM classrooms').get();
  if (classCount.count === 0) {
    const defaultClasses = [
      { name: 'قاعة البراعم (Babies)', age_group: 'من 6 شهور إلى سنة ونصف', capacity: 10 },
      { name: 'قاعة الفراشات (Toddlers)', age_group: 'من سنة ونصف إلى سنتين ونصف', capacity: 12 },
      { name: 'قاعة النجوم (KG 1)', age_group: 'من سنتين ونصف إلى 4 سنوات', capacity: 15 },
      { name: 'قاعة العباقرة (KG 2)', age_group: 'من 4 سنوات إلى 6 سنوات', capacity: 18 }
    ];
    const insertCls = sqliteDb.prepare('INSERT INTO classrooms (name, age_group, capacity, created_at) VALUES (?, ?, ?, ?)');
    for (const cls of defaultClasses) {
      insertCls.run(cls.name, cls.age_group, cls.capacity, getCairoNow());
    }
  }
}

/**
 * Atomic Student Code Generator:
 * Generates sequential codes starting at 1001.
 * Automatically reuses freed lower numbers.
 */
async function getNextStudentCode() {
  const rows = await db.prepare('SELECT code FROM students WHERE code >= 1001').all();
  const taken = new Set((rows || []).map(r => Number(r.code)));
  let seqRow = await db.prepare('SELECT next_code FROM student_code_sequence WHERE id = 1').get();
  let code = seqRow ? Number(seqRow.next_code) : 1001;

  while (taken.has(code)) {
    code++;
  }

  let nextCandidate = code + 1;
  while (taken.has(nextCandidate)) {
    nextCandidate++;
  }

  if (!seqRow) {
    await db.prepare('INSERT INTO student_code_sequence (id, next_code) VALUES (1, ?)').run(nextCandidate);
  } else {
    await db.prepare('UPDATE student_code_sequence SET next_code = ? WHERE id = 1').run(nextCandidate);
  }

  return code;
}

/**
 * Generate Next Receipt Number (e.g., REC-2026-1001)
 */
async function getNextReceiptNumber() {
  const currentYear = new Date().getFullYear();
  const prefix = `REC-${currentYear}-`;
  const row = await db.prepare(`SELECT receipt_no FROM payments WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let seq = 1001;
  if (row && row.receipt_no) {
    const parts = row.receipt_no.split('-');
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}${seq}`;
}

/**
 * Generate Next Expense Reference Number (e.g., EXP-2026-0001)
 */
async function getNextExpenseReference() {
  const currentYear = new Date().getFullYear();
  const prefix = `EXP-${currentYear}-`;
  const row = await db.prepare(`SELECT reference_no FROM expenses WHERE reference_no LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let seq = 1;
  if (row && row.reference_no) {
    const parts = row.reference_no.split('-');
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Generate Next Employee Code (e.g., EMP-101)
 */
async function getNextEmployeeCode() {
  const row = await db.prepare(`SELECT code FROM employees ORDER BY id DESC LIMIT 1`).get();
  let seq = 101;
  if (row && row.code) {
    const parts = row.code.split('-');
    const lastNum = parseInt(parts[1], 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `EMP-${seq}`;
}

module.exports = {
  db,
  getCairoNow,
  getCairoDate,
  hashPassword,
  verifyPassword,
  getNextStudentCode,
  getNextReceiptNumber,
  getNextExpenseReference,
  getNextEmployeeCode,
  runInDbContext
};
