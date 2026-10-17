const { db, getCairoNow, getCairoDate } = require('./db');
const { logAudit } = require('./audit');

/**
 * Automatically generate monthly tuition charges for all active students for a given month.
 * If targetMonth is not provided, defaults to current month (Africa/Cairo YYYY-MM).
 */
function generateMonthlyTuitionCharges(targetMonth = null) {
  const today = getCairoDate(); // YYYY-MM-DD
  const currentMonth = targetMonth || today.substring(0, 7); // YYYY-MM
  const now = getCairoNow();

  // Arabic Month Names helper
  const [yearStr, monthStr] = currentMonth.split('-');
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const monthName = monthNames[parseInt(monthStr, 10) - 1] || currentMonth;

  // Find all active students with monthly tuition > 0
  const activeStudents = db.prepare(`
    SELECT id, code, full_name, monthly_tuition, discount_amount, payment_due_day, enrollment_date
    FROM students
    WHERE status = 'active' AND monthly_tuition > 0
  `).all();

  let generatedCount = 0;
  let skippedCount = 0;
  const generatedList = [];

  for (const st of activeStudents) {
    // Only charge if student was enrolled on or before this month
    const enrollMonth = (st.enrollment_date || '').substring(0, 7);
    if (enrollMonth && enrollMonth > currentMonth) {
      skippedCount++;
      continue;
    }

    // Check if tuition charge already exists for this child in this billing month
    const existing = db.prepare(`
      SELECT id FROM student_charges
      WHERE student_id = ? AND charge_type = 'tuition' AND billing_month = ?
    `).get(st.id, currentMonth);

    if (existing) {
      skippedCount++;
      continue;
    }

    const tuitionAmt = Number(st.monthly_tuition) || 0;
    const disc = Math.max(0, Number(st.discount_amount) || 0);
    const netAmt = Math.max(0, tuitionAmt - disc);
    const dueDay = Math.min(28, Math.max(1, Number(st.payment_due_day) || 1));
    const dueDate = `${currentMonth}-${String(dueDay).padStart(2, '0')}`;
    const desc = `مصروفات شهرية (${monthName} ${yearStr})`;

    db.prepare(`
      INSERT INTO student_charges (
        student_id, charge_type, description, amount, discount, net_amount,
        charge_date, due_date, billing_month, status, paid_amount,
        created_at, updated_at
      ) VALUES (?, 'tuition', ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, ?)
    `).run(
      st.id,
      desc,
      tuitionAmt,
      disc,
      netAmt,
      `${currentMonth}-01`,
      dueDate,
      currentMonth,
      now,
      now
    );

    generatedCount++;
    generatedList.push({ studentId: st.id, code: st.code, name: st.full_name, netAmt, dueDate });
  }

  return {
    month: currentMonth,
    monthName,
    generatedCount,
    skippedCount,
    totalActive: activeStudents.length,
    generatedList
  };
}

/**
 * Run automated scheduled routines:
 * 1. Auto-generate monthly tuition charges for the current month
 * 2. Overdue tuition fees scan
 * 3. Upcoming payment deadlines (3 days ahead)
 * 4. Unpaid payroll obligations
 */
function runScheduledTasks() {
  const today = getCairoDate(); // 'YYYY-MM-DD'
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  let overdueCount = 0;
  let upcomingCount = 0;
  let unpaidSalariesCount = 0;

  try {
    // 0. Auto-generate monthly tuition charges for active students if not yet created for this month
    generateMonthlyTuitionCharges(currentMonthKey);

    // 1. Scan for Overdue Tuition:
    // Active students whose due day of the month <= currentDay, and have unpaid/partially paid charges
    const overdueStudents = db.prepare(`
      SELECT s.id, s.code, s.full_name, s.payment_due_day,
             COALESCE(SUM(c.net_amount - c.paid_amount), 0) as balance
      FROM students s
      JOIN student_charges c ON s.id = c.student_id
      WHERE s.status = 'active'
        AND c.status IN ('unpaid', 'partially_paid')
        AND date(c.due_date) < date(?)
      GROUP BY s.id
      HAVING balance > 0
    `).all(today);

    for (const st of overdueStudents) {
      overdueCount++;
      // Check if notification already logged today
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'overdue_fee' AND link = ? AND date(created_at) = date(?)
      `).get(`/students/${st.id}`, today);

      if (!existing) {
        db.prepare(`
          INSERT INTO notifications (type, title, message, link, is_read, created_at)
          VALUES ('overdue_fee', ?, ?, ?, 0, ?)
        `).run(
          `رسوم دراسية متأخرة: ${st.full_name}`,
          `الطفل كود (${st.code}) لديه متأخرات مستحقة بقيمة ${st.balance} ج.م تجاوزت موعد الاستحقاق.`,
          `/students/${st.id}`,
          getCairoNow()
        );
      }
    }

    // 2. Upcoming Payment Deadlines (next 3 days):
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const threeDaysStr = threeDaysLater.toLocaleDateString('sv-SE', { timeZone: 'Africa/Cairo' });

    const upcomingCharges = db.prepare(`
      SELECT s.id, s.code, s.full_name, c.net_amount - c.paid_amount as remaining, c.due_date
      FROM student_charges c
      JOIN students s ON c.student_id = s.id
      WHERE s.status = 'active'
        AND c.status IN ('unpaid', 'partially_paid')
        AND date(c.due_date) >= date(?)
        AND date(c.due_date) <= date(?)
    `).all(today, threeDaysStr);

    for (const ch of upcomingCharges) {
      upcomingCount++;
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'upcoming_due' AND link = ? AND date(created_at) = date(?)
      `).get(`/students/${ch.id}`, today);

      if (!existing) {
        db.prepare(`
          INSERT INTO notifications (type, title, message, link, is_read, created_at)
          VALUES ('upcoming_due', ?, ?, ?, 0, ?)
        `).run(
          `موعد استحقاق قادم: ${ch.full_name}`,
          `يستحق قسط بقيمة ${ch.remaining} ج.م بتاريخ ${ch.due_date} للطفل كود (${ch.code}).`,
          `/students/${ch.id}`,
          getCairoNow()
        );
      }
    }

    // 3. Unpaid Salaries Check:
    const unpaidPayroll = db.prepare(`
      SELECT p.id, e.full_name, p.month, (p.net_salary - p.paid_amount) as remaining
      FROM payroll_records p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.status IN ('unpaid', 'partially_paid')
    `).all();

    for (const pay of unpaidPayroll) {
      unpaidSalariesCount++;
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'unpaid_salary' AND message LIKE ? AND date(created_at) = date(?)
      `).get(`%${pay.full_name}%`, today);

      if (!existing) {
        db.prepare(`
          INSERT INTO notifications (type, title, message, link, is_read, created_at)
          VALUES ('unpaid_salary', ?, ?, '/payroll', 0, ?)
        `).run(
          `مستحقات راتب غير مسددة: ${pay.full_name}`,
          `يوجد متبقي راتب بقيمة ${pay.remaining} ج.م لشهر ${pay.month}.`,
          getCairoNow()
        );
      }
    }

    logAudit({
      user: null,
      action: 'SCHEDULED_CHECK_COMPLETED',
      entityType: 'system_scheduler',
      entityId: today,
      details: { overdueCount, upcomingCount, unpaidSalariesCount }
    });

    return { success: true, overdueCount, upcomingCount, unpaidSalariesCount, checkedAt: getCairoNow() };
  } catch (err) {
    console.error('Scheduled tasks error:', err);
    logAudit({
      user: null,
      action: 'SCHEDULED_CHECK_FAILED',
      entityType: 'system_scheduler',
      entityId: today,
      reason: err.message
    });
    return { success: false, error: err.message };
  }
}

/**
 * Start background scheduler: runs once on server start, then every 6 hours
 */
function startScheduler() {
  // Run initial check after 5 seconds
  setTimeout(() => {
    runScheduledTasks();
  }, 5000);

  // Repeat every 6 hours (21600000 ms)
  setInterval(() => {
    runScheduledTasks();
  }, 6 * 60 * 60 * 1000);
}

module.exports = {
  runScheduledTasks,
  startScheduler,
  generateMonthlyTuitionCharges
};
