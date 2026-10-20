-- =====================================================================
-- MAMY ONE - SUPABASE POSTGRESQL DATABASE SCHEMA
-- =====================================================================
-- Run this complete script in the Supabase SQL Editor
-- (Dashboard -> Project -> SQL Editor -> New Query -> Paste & Run)
-- =====================================================================

-- 1. System Settings
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
  daily_cash_opening NUMERIC(12,2) DEFAULT 0,
  receipt_footer TEXT DEFAULT 'شكراً لاختياركم حضانة مامي وان - نعتز بثقتكم ونسعى دائماً لأفضل رعاية لأبنائكم',
  reminder_time TEXT DEFAULT '09:00',
  auto_reminders_enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

-- 2. Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL,
  created_at TEXT
);

-- 3. Users (Admins, Accountants, Teachers)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
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

-- 4. Classrooms / Groups
CREATE TABLE IF NOT EXISTS classrooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  age_group TEXT,
  capacity INTEGER DEFAULT 15,
  lead_teacher_id INTEGER,
  notes TEXT,
  created_at TEXT
);

-- 5. Employees & Staff
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  photo TEXT,
  job_title TEXT NOT NULL,
  department TEXT,
  classroom_id INTEGER REFERENCES classrooms(id) ON DELETE SET NULL,
  mobile TEXT NOT NULL,
  start_date TEXT,
  agreed_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_schedule TEXT DEFAULT 'monthly',
  status TEXT DEFAULT 'active',
  confidential_notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 6. Student Sequential Code Generator
CREATE TABLE IF NOT EXISTS student_code_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_code INTEGER NOT NULL
);

-- 7. Students
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
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
  monthly_tuition NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_due_day INTEGER DEFAULT 1,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  discount_reason TEXT,
  medical_notes TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 8. Student Classification History
CREATE TABLE IF NOT EXISTS student_classification_history (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  old_classification TEXT,
  new_classification TEXT NOT NULL,
  reason TEXT,
  changed_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- 9. Guardians
CREATE TABLE IF NOT EXISTS guardians (
  id SERIAL PRIMARY KEY,
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

-- 10. Student Documents
CREATE TABLE IF NOT EXISTS student_documents (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT,
  notes TEXT,
  created_at TEXT
);

-- 11. Student Charges (Tuition and Custom Fees)
CREATE TABLE IF NOT EXISTS student_charges (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  charge_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL,
  charge_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  billing_month TEXT,
  session_id INTEGER,
  status TEXT DEFAULT 'unpaid',
  paid_amount NUMERIC(12,2) DEFAULT 0,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
);

-- 12. Payments Ledger
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  receipt_no TEXT UNIQUE NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
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

-- 13. Payment Allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  charge_id INTEGER NOT NULL REFERENCES student_charges(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(12,2) NOT NULL,
  created_at TEXT
);

-- 14. Payment Refunds
CREATE TABLE IF NOT EXISTS payment_refunds (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  refund_date TEXT NOT NULL,
  refund_method TEXT NOT NULL,
  approved_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- 15. Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_custom INTEGER DEFAULT 0,
  created_at TEXT
);

-- 16. Expenses Ledger
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  reference_no TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  custom_category_name TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
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

-- 17. Payroll Records
CREATE TABLE IF NOT EXISTS payroll_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month TEXT NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL,
  bonuses NUMERIC(12,2) DEFAULT 0,
  deductions NUMERIC(12,2) DEFAULT 0,
  advances NUMERIC(12,2) DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(employee_id, month)
);

-- 18. Salary Payments
CREATE TABLE IF NOT EXISTS salary_payments (
  id SERIAL PRIMARY KEY,
  payroll_id INTEGER NOT NULL REFERENCES payroll_records(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount NUMERIC(12,2) NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  expense_id INTEGER REFERENCES expenses(id),
  recorded_by_user_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT
);

-- 19. Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
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

-- 20. Therapy & Lesson Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES employees(id),
  session_type TEXT NOT NULL,
  session_date TEXT NOT NULL,
  start_time TEXT,
  duration_minutes INTEGER DEFAULT 45,
  status TEXT NOT NULL DEFAULT 'completed',
  fee_amount NUMERIC(12,2) DEFAULT 0,
  is_billed INTEGER DEFAULT 0,
  charge_id INTEGER REFERENCES student_charges(id),
  progress_notes TEXT,
  recommendations TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
);

-- 21. Progress Reports
CREATE TABLE IF NOT EXISTS progress_reports (
  id SERIAL PRIMARY KEY,
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

-- 22. Communication Logs
CREATE TABLE IF NOT EXISTS communication_logs (
  id SERIAL PRIMARY KEY,
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

-- 23. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 24. Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
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

-- 25. Daily Cash Closings
CREATE TABLE IF NOT EXISTS daily_closings (
  id SERIAL PRIMARY KEY,
  closing_date TEXT UNIQUE NOT NULL,
  opening_balance NUMERIC(12,2) NOT NULL,
  cash_in NUMERIC(12,2) NOT NULL,
  cash_out NUMERIC(12,2) NOT NULL,
  refunds NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(12,2) NOT NULL,
  actual_cash_counted NUMERIC(12,2),
  difference NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'closed',
  notes TEXT,
  closed_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT
);

-- =====================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================
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

-- =====================================================================
-- INITIAL SEED DATA (Only if empty)
-- =====================================================================

-- Default Settings
INSERT INTO settings (id, nursery_name, slogan, phone, email, address, currency, created_at, updated_at)
VALUES (1, 'حضانة مامي وان', 'بيئة تعليمية وتربوية متكاملة لأطفالنا', '01012345678', 'info@mamyone.com', 'القاهرة - مصر', 'ج.م', NOW()::text, NOW()::text)
ON CONFLICT (id) DO NOTHING;

-- Default Code Sequence starting at 1001
INSERT INTO student_code_sequence (id, next_code)
VALUES (1, 1001)
ON CONFLICT (id) DO NOTHING;

-- Default Roles
INSERT INTO roles (name, display_name, description, permissions, created_at)
VALUES 
  ('admin', 'مدير عام / إدارة عليا', 'صلاحيات كاملة وغير محدودة للنظام والماليات والإعدادات', '["*"]', NOW()::text),
  ('accountant', 'محاسب / مسؤول مالي', 'إدارة المدفوعات والرسوم والمصروفات والرواتب والتقارير المالية', '["students_view","guardians_view_contact","finances_view","payments_record","payments_refund","expenses_manage","payroll_manage","financial_reports","export_data","notifications_view"]', NOW()::text),
  ('teacher', 'معلمة / أخصائية', 'تسجيل الحضور والجلسات والتقارير التربوية ومتابعة الأطفال', '["students_view","students_edit","attendance_record","attendance_view","sessions_manage","reports_create"]', NOW()::text)
ON CONFLICT (name) DO NOTHING;

-- Default Admin User (Password: admin123)
-- Salt: a1b2c3d4e5f67890
-- PBKDF2 sha512 10000 iter
INSERT INTO users (username, password_hash, salt, full_name, role, permissions, is_active, created_at, updated_at)
VALUES (
  'admin',
  '7e4776e65b7501a4e21a0a5525501b44ec4e508fb36ef3f9479b1ad8a92f038be20eb58eb3a694668b57738ee6858e8e6e5804ca514d33a6773ce02b0c16921d',
  'a1b2c3d4e5f67890',
  'مدير النظام (Admin)',
  'admin',
  '["*"]',
  1,
  NOW()::text,
  NOW()::text
)
ON CONFLICT (username) DO NOTHING;

-- Default Classrooms
INSERT INTO classrooms (name, age_group, capacity, created_at)
VALUES
  ('قاعة البراعم (Babies)', 'من 6 شهور إلى سنة ونصف', 10, NOW()::text),
  ('قاعة الفراشات (Toddlers)', 'من سنة ونصف إلى سنتين ونصف', 12, NOW()::text),
  ('قاعة النجوم (KG 1)', 'من سنتين ونصف إلى 4 سنوات', 15, NOW()::text),
  ('قاعة العباقرة (KG 2)', 'من 4 سنوات إلى 6 سنوات', 18, NOW()::text);

-- Default Expense Categories
INSERT INTO expense_categories (code, name, is_custom, created_at)
VALUES
  ('teacher_salary', 'رواتب معلمات', 0, NOW()::text),
  ('employee_salary', 'رواتب موظفين وإداريين', 0, NOW()::text),
  ('rent', 'إيجار المقر', 0, NOW()::text),
  ('utilities', 'كهرباء ومياه وغاز', 0, NOW()::text),
  ('maintenance', 'نظافة وصيانة وتجديدات', 0, NOW()::text),
  ('supplies', 'أدوات ومستلزمات تعليمية', 0, NOW()::text),
  ('books', 'كتب ومناهج دراسية', 0, NOW()::text),
  ('food', 'وجبات وأغذية وضيافة', 0, NOW()::text),
  ('transport', 'انتقالات وباصات', 0, NOW()::text),
  ('medical', 'مستلزمات طبية وإسعافات أولية', 0, NOW()::text),
  ('marketing', 'تسويق وإعلانات ومطبوعات', 0, NOW()::text),
  ('other', 'مصروفات أخرى ونثرية', 0, NOW()::text)
ON CONFLICT (code) DO NOTHING;
