const { db, getCairoNow, getCairoDate, getNextStudentCode, getNextReceiptNumber, getNextExpenseReference, getNextEmployeeCode } = require('./db');
const { logAudit } = require('./audit');

/**
 * Seed high quality demonstration data, clearly flagged as demo data
 */
function seedDemoData(user) {
  const now = getCairoNow();
  const today = getCairoDate();
  const currentMonth = today.substring(0, 7);

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    // 1. Classrooms check
    const classes = db.prepare('SELECT id, name FROM classrooms').all();
    let class1 = classes[0] ? classes[0].id : 1;
    let class2 = classes[1] ? classes[1].id : 2;
    let class3 = classes[2] ? classes[2].id : 3;

    // 2. Teachers / Employees
    let empRows = db.prepare('SELECT id FROM employees').all();
    let teacher1, teacher2, specialist1;
    if (empRows.length === 0) {
      const insEmp = db.prepare(`
        INSERT INTO employees (code, full_name, job_title, mobile, agreed_salary, department, classroom_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      teacher1 = Number(insEmp.run(getNextEmployeeCode(), 'أ. مروة السيد', 'معلمة رياض أطفال', '01011112222', 4500, 'التعليم المبكر', class1, now, now).lastInsertRowid);
      teacher2 = Number(insEmp.run(getNextEmployeeCode(), 'أ. هالة إبراهيم', 'معلمة لغة عربية وتربية إسلامية', '01022223333', 4200, 'التعليم المبكر', class2, now, now).lastInsertRowid);
      specialist1 = Number(insEmp.run(getNextEmployeeCode(), 'د. نورهان فؤاد', 'أخصائية نطق وتخاطب', '01033334444', 5500, 'رعاية وتأهيل', class3, now, now).lastInsertRowid);
    } else {
      teacher1 = empRows[0].id;
      teacher2 = empRows[1] ? empRows[1].id : empRows[0].id;
      specialist1 = empRows[2] ? empRows[2].id : empRows[0].id;
    }

    // 3. Demo Children (Regular, Learning Difficulties, Speech Therapy)
    const demoStudents = [
      {
        name: 'يوسف أحمد علي [بيانات تجريبية]',
        dob: '2022-04-15',
        gender: 'ذكر',
        classification: 'regular',
        classroom_id: class2,
        teacher_id: teacher1,
        tuition: 1600,
        due_day: 5,
        guardian: { name: 'أحمد علي حسن', mobile: '01098765432', rel: 'أب' },
        paidSoFar: 1600 // Fully paid
      },
      {
        name: 'ليلى عمر عبد الرحمن [بيانات تجريبية]',
        dob: '2021-08-20',
        gender: 'أنثى',
        classification: 'speech_therapy',
        classroom_id: class3,
        teacher_id: specialist1,
        tuition: 2000,
        due_day: 1,
        guardian: { name: 'عمر عبد الرحمن', mobile: '01123456780', rel: 'أب' },
        paidSoFar: 1000 // Partially paid (1000 overdue)
      },
      {
        name: 'حمزة كريم محمود [بيانات تجريبية]',
        dob: '2021-11-10',
        gender: 'ذكر',
        classification: 'learning_difficulties',
        classroom_id: class2,
        teacher_id: teacher2,
        tuition: 1800,
        due_day: 1,
        guardian: { name: 'كريم محمود إسماعيل', mobile: '01234567891', rel: 'أب' },
        paidSoFar: 0 // Completely unpaid (1800 overdue)
      },
      {
        name: 'فريدة حسام مصطفى [بيانات تجريبية]',
        dob: '2023-01-05',
        gender: 'أنثى',
        classification: 'regular',
        classroom_id: class1,
        teacher_id: teacher1,
        tuition: 1500,
        due_day: 10,
        guardian: { name: 'حسام مصطفى', mobile: '01511223344', rel: 'أب' },
        paidSoFar: 1500
      }
    ];

    const insStudent = db.prepare(`
      INSERT INTO students (
        code, full_name, dob, gender, enrollment_date, status, classification,
        classroom_id, teacher_id, monthly_tuition, payment_due_day,
        discount_amount, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 0, 'حساب تجريبي للاختبار', ?, ?)
    `);

    const insGuardian = db.prepare(`
      INSERT INTO guardians (student_id, full_name, relationship, is_primary, mobile, created_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);

    const insCharge = db.prepare(`
      INSERT INTO student_charges (
        student_id, charge_type, description, amount, discount, net_amount,
        charge_date, due_date, billing_month, status, paid_amount,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, 'tuition', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insPay = db.prepare(`
      INSERT INTO payments (
        receipt_no, student_id, amount, payment_date, payment_time,
        payment_method, payment_category, status, notes, recorded_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '10:30', 'cash', 'tuition', 'completed', 'دفعة تجريبية', ?, ?, ?)
    `);

    const insAlloc = db.prepare(`
      INSERT INTO payment_allocations (payment_id, charge_id, allocated_amount, created_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of demoStudents) {
      const code = getNextStudentCode();
      const sRes = insStudent.run(
        code, item.name, item.dob, item.gender, `${currentMonth}-01`,
        item.classification, item.classroom_id, item.teacher_id,
        item.tuition, item.due_day, now, now
      );
      const studentId = Number(sRes.lastInsertRowid);

      insGuardian.run(studentId, item.guardian.name, item.guardian.rel, item.guardian.mobile, now);

      // Tuition Charge
      const dueDate = `${currentMonth}-${String(item.due_day).padStart(2, '0')}`;
      const status = item.paidSoFar === 0 ? 'unpaid' : (item.paidSoFar >= item.tuition ? 'paid' : 'partially_paid');
      const cRes = insCharge.run(
        studentId, `مصروفات شهرية (${currentMonth}) [تجريبية]`, item.tuition, item.tuition,
        `${currentMonth}-01`, dueDate, currentMonth, status, item.paidSoFar,
        user ? user.id : 1, now, now
      );
      const chargeId = Number(cRes.lastInsertRowid);

      // Payment if any
      if (item.paidSoFar > 0) {
        const receiptNo = getNextReceiptNumber();
        const pRes = insPay.run(
          receiptNo, studentId, item.paidSoFar, today,
          user ? user.id : 1, now, now
        );
        const paymentId = Number(pRes.lastInsertRowid);
        insAlloc.run(paymentId, chargeId, item.paidSoFar, now);
      }

      // Attendance for today
      db.prepare(`
        INSERT OR REPLACE INTO attendance (student_id, classroom_id, date, status, arrival_time, recorded_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, 'present', '08:15', ?, ?, ?)
      `).run(studentId, item.classroom_id, today, user ? user.id : 1, now, now);
    }

    // 4. Sample Expenses
    const insExp = db.prepare(`
      INSERT INTO expenses (
        reference_no, category, description, amount, paid_amount,
        expense_date, payment_date, payment_status, payment_method, recipient_supplier,
        notes, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', 'cash', ?, ?, ?, ?, ?)
    `);

    insExp.run(getNextExpenseReference(), 'supplies', 'شراء ألوان ودفاتر رسم وأوراق [تجريبي]', 650, 650, today, today, 'مكتبة الأهرام', 'مشتريات أنشطة', user ? user.id : 1, now, now);
    insExp.run(getNextExpenseReference(), 'utilities', 'فاتورة كهرباء ومياه المقر [تجريبي]', 1200, 1200, today, today, 'شركة الكهرباء', 'شهر أكتوبر', user ? user.id : 1, now, now);

    db.exec('COMMIT');

    logAudit({
      user,
      action: 'DATA_EXPORT',
      entityType: 'system_demo',
      entityId: 'demo_seeded',
      details: 'تم تحميل بيانات تجريبية بنجاح'
    });

    return { success: true, count: demoStudents.length };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  seedDemoData
};
