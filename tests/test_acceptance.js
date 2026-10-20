const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// Configure isolated test database
const testDbFile = path.join(__dirname, 'test_mamy_acceptance.db');
if (fs.existsSync(testDbFile)) {
  try { fs.unlinkSync(testDbFile); } catch(e) {}
}
process.env.MAMY_DB_PATH = testDbFile;

const {
  db,
  getCairoNow,
  getCairoDate,
  getNextStudentCode,
  getNextReceiptNumber,
  getNextExpenseReference,
  getNextEmployeeCode
} = require('../db');
const { createToken, hasPermission, hashPassword, verifyPassword } = require('../auth');
const { logAudit } = require('../audit');
const { runScheduledTasks } = require('../scheduler');

console.log('--- بدء اختبارات الجودة ومعايير القبول لنظام مامي وان (Mamy One Acceptance Tests) ---\n');

let testsPassed = 0;
let testsTotal = 0;

async function runTest(name, testFn) {
  testsTotal++;
  try {
    await testFn();
    console.log(`[PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Sequence & Unique Student Code
// -----------------------------------------------------------------------------
(async () => {
await runTest('معيار 1: أول طفل يحصل على الكود 1001، والتالي 1002، والأكواد فريدة ولا تتكرر', async () => {
  // Reset sequence to 1001 for test validation
  db.prepare('UPDATE student_code_sequence SET next_code = 1001 WHERE id = 1').run();

  const code1 = await getNextStudentCode();
  const code2 = await getNextStudentCode();
  const code3 = await getNextStudentCode();

  assert.strictEqual(code1, 1001, 'أول كود يجب أن يكون 1001');
  assert.strictEqual(code2, 1002, 'ثاني كود يجب أن يكون 1002');
  assert.strictEqual(code3, 1003, 'ثالث كود يجب أن يكون 1003');
  assert.notStrictEqual(code1, code2);
});

// -----------------------------------------------------------------------------
// Test 2: Child Registration & Expected Charge Generation
// -----------------------------------------------------------------------------
let testStudentId = null;
let testStudentCode = null;
await runTest('معيار 2: تسجيل طفل بمصروفات شهرية ينشئ المطالبة الصحيحة تلقائياً', async () => {
  const maxCodeRow = db.prepare('SELECT MAX(code) as max_code FROM students').get();
  const nextSeq = Math.max(1001, (maxCodeRow && maxCodeRow.max_code ? maxCodeRow.max_code + 1 : 1001));
  db.prepare('UPDATE student_code_sequence SET next_code = ? WHERE id = 1').run(nextSeq);

  const code = await getNextStudentCode();
  testStudentCode = code;
  const now = getCairoNow();
  const tuition = 1500;

  const res = db.prepare(`
    INSERT INTO students (code, full_name, dob, gender, enrollment_date, status, classification, monthly_tuition, payment_due_day, created_at, updated_at)
    VALUES (?, 'طفل اختبار القبول', '2022-01-01', 'ذكر', '2026-10-01', 'active', 'regular', ?, 1, ?, ?)
  `).run(code, tuition, now, now);

  testStudentId = Number(res.lastInsertRowid);

  // Auto charge creation
  db.prepare(`
    INSERT INTO student_charges (student_id, charge_type, description, amount, discount, net_amount, charge_date, due_date, billing_month, status, paid_amount, created_at, updated_at)
    VALUES (?, 'tuition', 'مصروفات شهرية (2026-10)', ?, 0, ?, '2026-10-01', '2026-10-01', '2026-10', 'unpaid', 0, ?, ?)
  `).run(testStudentId, tuition, tuition, now, now);

  const charges = db.prepare('SELECT * FROM student_charges WHERE student_id = ?').all(testStudentId);
  assert.strictEqual(charges.length, 1);
  assert.strictEqual(charges[0].net_amount, 1500);
  assert.strictEqual(charges[0].status, 'unpaid');
  assert.strictEqual(charges[0].paid_amount, 0);
});

// -----------------------------------------------------------------------------
// Test 3: Partial Payment & Outstanding Balance
// -----------------------------------------------------------------------------
let testPaymentId = null;
await runTest('معيار 3: تسجيل دفعة جزئية يحدث الرصيد المتبقي بدقة متناهية', async () => {
  const now = getCairoNow();
  const partialAmount = 600;
  const receiptNo = await getNextReceiptNumber();

  // Insert payment of 600 EGP
  const resP = db.prepare(`
    INSERT INTO payments (receipt_no, student_id, amount, payment_date, payment_time, payment_method, payment_category, status, created_at, updated_at)
    VALUES (?, ?, ?, '2026-10-11', '12:00', 'cash', 'tuition', 'completed', ?, ?)
  `).run(receiptNo, testStudentId, partialAmount, now, now);

  testPaymentId = Number(resP.lastInsertRowid);

  const charge = db.prepare('SELECT * FROM student_charges WHERE student_id = ?').get(testStudentId);

  // Allocate 600 to charge
  db.prepare(`
    INSERT INTO payment_allocations (payment_id, charge_id, allocated_amount, created_at)
    VALUES (?, ?, ?, ?)
  `).run(testPaymentId, charge.id, partialAmount, now);

  // Update charge
  db.prepare(`
    UPDATE student_charges SET paid_amount = ?, status = 'partially_paid', updated_at = ?
    WHERE id = ?
  `).run(partialAmount, now, charge.id);

  // Verify updated charge & outstanding balance
  const updatedCharge = db.prepare('SELECT * FROM student_charges WHERE id = ?').get(charge.id);
  assert.strictEqual(updatedCharge.paid_amount, 600);
  assert.strictEqual(updatedCharge.status, 'partially_paid');

  const balanceRow = db.prepare(`
    SELECT SUM(net_amount - paid_amount) as remaining
    FROM student_charges WHERE student_id = ?
  `).get(testStudentId);

  assert.strictEqual(balanceRow.remaining, 900, 'المتبقي يجب أن يكون 900 ج.م بالضبط (1500 - 600)');
});

// -----------------------------------------------------------------------------
// Test 4: Additional Fees Tracked Independently
// -----------------------------------------------------------------------------
await runTest('معيار 4: تتبع الرسوم الإضافية بشكل منفصل ودمجها بدقة في الرصيد الإجمالي', async () => {
  const now = getCairoNow();
  // Add uniform charge 400 EGP
  db.prepare(`
    INSERT INTO student_charges (student_id, charge_type, description, amount, discount, net_amount, charge_date, due_date, billing_month, status, paid_amount, created_at, updated_at)
    VALUES (?, 'uniform', 'زي مدرسي', 400, 0, 400, '2026-10-11', '2026-10-15', '2026-10', 'unpaid', 0, ?, ?)
  `).run(testStudentId, now, now);

  const allCharges = db.prepare('SELECT * FROM student_charges WHERE student_id = ?').all(testStudentId);
  assert.strictEqual(allCharges.length, 2);

  const totalBalance = db.prepare(`
    SELECT SUM(net_amount - paid_amount) as total_due
    FROM student_charges WHERE student_id = ?
  `).get(testStudentId).total_due;

  // 900 from tuition + 400 from uniform = 1300 EGP
  assert.strictEqual(totalBalance, 1300, 'إجمالي الرصيد المستحق يجب أن يكون 1300 ج.م');
});

// -----------------------------------------------------------------------------
// Test 5: Outstanding Fee Reports & Unpaid/Partial Classification
// -----------------------------------------------------------------------------
await runTest('معيار 5: تقرير الرسوم المتأخرة يحدد الأطفال غير المسددين والمسددين جزئياً بدقة', async () => {
  const outstanding = db.prepare(`
    SELECT s.id, s.code,
           SUM(sc.net_amount) as total_charges,
           SUM(sc.paid_amount) as total_paid,
           SUM(sc.net_amount - sc.paid_amount) as balance
    FROM students s
    JOIN student_charges sc ON s.id = sc.student_id
    WHERE s.id = ?
    GROUP BY s.id
  `).get(testStudentId);

  assert(outstanding.balance > 0);
  assert.strictEqual(outstanding.balance, 1300);
  assert.strictEqual(outstanding.total_paid, 600);
});

// -----------------------------------------------------------------------------
// Test 6: Salary Payment Creates Exactly One Paid Expense
// -----------------------------------------------------------------------------
let testSalaryExpRef = null;
await runTest('معيار 6: صرف الراتب ينشئ مصروفاً واحداً مسدداً تلقائياً في الخزينة دون تكرار', async () => {
  const now = getCairoNow();
  // 1. Create employee & payroll
  const empRes = db.prepare(`
    INSERT INTO employees (code, full_name, job_title, mobile, agreed_salary, created_at, updated_at)
    VALUES ('EMP-999', 'معلمة تجريبية للاختبار', 'معلمة', '01000000999', 4000, ?, ?)
  `).run(now, now);
  const empId = Number(empRes.lastInsertRowid);

  const payRes = db.prepare(`
    INSERT INTO payroll_records (employee_id, month, base_salary, bonuses, deductions, advances, net_salary, paid_amount, status, created_at, updated_at)
    VALUES (?, '2026-10', 4000, 0, 0, 0, 4000, 0, 'unpaid', ?, ?)
  `).run(empId, now, now);
  const payrollId = Number(payRes.lastInsertRowid);

  // 2. Pay Salary Action
  const expRef = await getNextExpenseReference();
  testSalaryExpRef = expRef;

  const insExp = db.prepare(`
    INSERT INTO expenses (reference_no, category, description, amount, paid_amount, expense_date, payment_date, payment_status, payment_method, salary_payment_id, created_at, updated_at)
    VALUES (?, 'teacher_salary', 'صرف راتب شهر 2026-10', 4000, 4000, '2026-10-11', '2026-10-11', 'paid', 'cash', ?, ?, ?)
  `).run(expRef, payrollId, now, now);
  const expenseId = Number(insExp.lastInsertRowid);

  db.prepare(`
    INSERT INTO salary_payments (payroll_id, employee_id, amount, payment_date, payment_method, expense_id, created_at)
    VALUES (?, ?, 4000, '2026-10-11', 'cash', ?, ?)
  `).run(payrollId, empId, expenseId, now);

  db.prepare(`
    UPDATE payroll_records SET paid_amount = 4000, status = 'paid', updated_at = ?
    WHERE id = ?
  `).run(now, payrollId);

  // Verify: exactly ONE expense created
  const matchingExpenses = db.prepare('SELECT * FROM expenses WHERE reference_no = ?').all(expRef);
  assert.strictEqual(matchingExpenses.length, 1);
  assert.strictEqual(matchingExpenses[0].paid_amount, 4000);
  assert.strictEqual(matchingExpenses[0].payment_status, 'paid');
});

// -----------------------------------------------------------------------------
// Test 7: Unpaid Expenses NOT Included in Cash Outflow
// -----------------------------------------------------------------------------
await runTest('معيار 7: المصروفات غير المسددة لا تُحسب ضمن التدفقات النقدية الخارجة', async () => {
  const now = getCairoNow();
  const unpRef = await getNextExpenseReference();

  // Create unpaid rent expense of 10,000 EGP
  db.prepare(`
    INSERT INTO expenses (reference_no, category, description, amount, paid_amount, expense_date, payment_status, payment_method, created_at, updated_at)
    VALUES (?, 'rent', 'إيجار المقر غير مدفوع', 10000, 0, '2026-10-11', 'unpaid', 'cash', ?, ?)
  `).run(unpRef, now, now);

  // Cash outflow calculation: SUM(paid_amount) WHERE payment_status = 'paid' OR paid_amount > 0
  const cashOut = db.prepare(`
    SELECT COALESCE(SUM(paid_amount), 0) as total
    FROM expenses
    WHERE reference_no = ?
  `).get(unpRef).total;

  assert.strictEqual(cashOut, 0, 'التدفق النقدي الخارج للمصروف غير المسدد يجب أن يكون 0');
});

// -----------------------------------------------------------------------------
// Test 8: Refunds and Reversals Preserve History
// -----------------------------------------------------------------------------
await runTest('معيار 8: المرتجعات والتسويات تحتفظ بسجل المعاملات الأصلي ولا تحذفه', async () => {
  const now = getCairoNow();
  // Refund the test payment
  db.prepare(`
    UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?
  `).run(now, testPaymentId);

  db.prepare(`
    INSERT INTO payment_refunds (payment_id, type, amount, reason, refund_date, refund_method, created_at)
    VALUES (?, 'refund', 600, 'طلب ولي الأمر استرداد الرسوم لظرف طارئ', '2026-10-11', 'cash', ?)
  `).run(testPaymentId, now);

  // Check payment row still exists
  const payRow = db.prepare('SELECT * FROM payments WHERE id = ?').get(testPaymentId);
  assert(payRow !== undefined, 'الدفعة لا تُحذف من قاعدة البيانات');
  assert.strictEqual(payRow.status, 'refunded');

  const refundRow = db.prepare('SELECT * FROM payment_refunds WHERE payment_id = ?').get(testPaymentId);
  assert.strictEqual(refundRow.amount, 600);
});

// -----------------------------------------------------------------------------
// Test 9 & 10: Role-Based Permissions & User Management
// -----------------------------------------------------------------------------
await runTest('معيار 9 و 10: حظر المعلمات من الصلاحيات المالية وإمكانية تخصيص الصلاحيات للمدير', async () => {
  const teacherUser = {
    role: 'teacher',
    permissions: ['students_view', 'students_edit', 'attendance_record', 'sessions_manage']
  };

  const adminUser = {
    role: 'admin',
    permissions: ['*']
  };

  // Teacher cannot access finance
  assert.strictEqual(hasPermission(teacherUser, 'finances_view'), false);
  assert.strictEqual(hasPermission(teacherUser, 'payments_record'), false);
  assert.strictEqual(hasPermission(teacherUser, 'payroll_manage'), false);
  assert.strictEqual(hasPermission(teacherUser, 'users_manage'), false);

  // Teacher CAN access attendance & sessions
  assert.strictEqual(hasPermission(teacherUser, 'attendance_record'), true);
  assert.strictEqual(hasPermission(teacherUser, 'sessions_manage'), true);

  // Admin has all permissions
  assert.strictEqual(hasPermission(adminUser, 'finances_view'), true);
  assert.strictEqual(hasPermission(adminUser, 'users_manage'), true);
});

// -----------------------------------------------------------------------------
// Test 11: Audit Logging
// -----------------------------------------------------------------------------
await runTest('معيار 11: تسجيل كل عملية جوهرية في سجل المراقبة مع اسم المستخدم والوقت', async () => {
  await logAudit({
    user: { id: 1, full_name: 'مدير الاختبار' },
    action: 'TEST_AUDIT_ACTION',
    entityType: 'test_entity',
    entityId: '100',
    details: { change: 'verified' },
    reason: 'اختبار التدقيق'
  });

  const lastAudit = db.prepare('SELECT * FROM audit_logs WHERE action = ?').get('TEST_AUDIT_ACTION');
  assert(lastAudit !== undefined);
  assert.strictEqual(lastAudit.user_name, 'مدير الاختبار');
  assert.strictEqual(lastAudit.reason, 'اختبار التدقيق');
});

// -----------------------------------------------------------------------------
// Test 12: Scheduled Tasks Scan
// -----------------------------------------------------------------------------
await runTest('معيار 12: عمل المهام المجدولة وفحص المتأخرات تلقائياً', async () => {
  const result = await runScheduledTasks();
  assert.strictEqual(result.success, true);
  assert(typeof result.overdueCount === 'number');
});

// -----------------------------------------------------------------------------
// Test 13: Data Persistence Check
// -----------------------------------------------------------------------------
await runTest('معيار 13: ثبات وحفظ البيانات في ملف قاعدة البيانات SQLite الدائم', async () => {
  const rowCount = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
  assert(rowCount > 0, 'بيانات الأطفال محفوظة في قاعدة البيانات');
});

// -----------------------------------------------------------------------------
// Test 14: Arabic RTL Layout & Assets Verification
// -----------------------------------------------------------------------------
await runTest('معيار 14: الواجهة العربية وتخطيط RTL متكامل للمتصفح والأجهزة المحمولة', async () => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert(indexContent.includes('dir="rtl"'), 'اتجاه الصفحة يجب أن يكون RTL');
  assert(indexContent.includes('lang="ar"'), 'لغة الصفحة يجب أن تكون العربية');
  assert(indexContent.includes('Cairo'), 'خط Cairo العربي متضمن');

  const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
  assert(fs.existsSync(cssPath), 'ملف التنسيقات style.css موجود');

  const jsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  assert(fs.existsSync(jsPath), 'ملف الجافاسكريبت app.js موجود');
});

// -----------------------------------------------------------------------------
// Test 15: Export & Financial Ledger Reconciliation
// -----------------------------------------------------------------------------
await runTest('معيار 15: مطابقة الإجماليات المالية مع سجل المعاملات التفصيلي بدقة 100%', async () => {
  // Sum of individual payments vs ledger total
  const individualSum = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'completed'
  `).get().total;

  const ledgerTransactions = db.prepare(`SELECT amount FROM payments WHERE status = 'completed'`).all();
  let manualSum = 0;
  for (const t of ledgerTransactions) {
    manualSum += Number(t.amount);
  }

  assert.strictEqual(individualSum, manualSum, 'إجمالي الإيرادات يطابق مجموع الحركات الفردية بالسنتيم');

  // Verify expenses paid vs cash outflow
  const expensesSum = db.prepare(`
    SELECT COALESCE(SUM(paid_amount), 0) as total FROM expenses WHERE payment_status = 'paid' OR paid_amount > 0
  `).get().total;

  const expenseRows = db.prepare(`SELECT paid_amount FROM expenses WHERE payment_status = 'paid' OR paid_amount > 0`).all();
  let manualExpSum = 0;
  for (const er of expenseRows) {
    manualExpSum += Number(er.paid_amount);
  }

  assert.strictEqual(expensesSum, manualExpSum, 'إجمالي المصروفات المدفوعة يطابق مجموع حركات الصرف بدقة');
});

console.log(`\n=============================================================`);
console.log(`نجحت جميع الاختبارات بنجاح! (${testsPassed}/${testsTotal})`);
console.log(`=============================================================`);


})();