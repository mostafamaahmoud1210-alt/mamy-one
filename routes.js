const {
  db,
  getCairoNow,
  getCairoDate,
  hashPassword,
  verifyPassword,
  getNextStudentCode,
  getNextReceiptNumber,
  getNextExpenseReference,
  getNextEmployeeCode
} = require('./db');
const { createToken, hasPermission, authenticateRequest } = require('./auth');
const { logAudit } = require('./audit');
const { runScheduledTasks } = require('./scheduler');

/**
 * Send JSON response
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

/**
 * Send Error response
 */
function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, { success: false, error: message, details });
}

/**
 * Main API Request Dispatcher
 */
async function handleApi(req, res, pathname, query, body) {
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  // -------------------------------------------------------------------------
  // 1. AUTHENTICATION ROUTES (Public & Protected)
  // -------------------------------------------------------------------------
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { username, password } = body || {};
    if (!username || !password) {
      return sendError(res, 400, 'يرجى إدخال اسم المستخدم وكلمة المرور');
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash, user.salt)) {
      return sendError(res, 401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(getCairoNow(), user.id);

    let permissions = [];
    try {
      permissions = JSON.parse(user.permissions || '[]');
    } catch (e) {
      permissions = [];
    }

    const token = createToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    logAudit({
      user,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      details: 'تسجيل دخول ناجح'
    });

    return sendJson(res, 200, {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        permissions
      }
    });
  }

  // Authenticate all remaining /api routes
  const user = authenticateRequest(req);
  if (!user) {
    return sendError(res, 401, 'غير مصرح - يرجى تسجيل الدخول أولاً');
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    return sendJson(res, 200, {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        permissions: user.permissions
      }
    });
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const { currentPassword, newPassword } = body || {};
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return sendError(res, 400, 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف');
    }

    const u = db.prepare('SELECT password_hash, salt FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(currentPassword, u.password_hash, u.salt)) {
      return sendError(res, 400, 'كلمة المرور الحالية غير صحيحة');
    }

    const { hash, salt } = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?').run(hash, salt, getCairoNow(), user.id);

    logAudit({
      user,
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: user.id,
      details: 'تغيير كلمة المرور'
    });

    return sendJson(res, 200, { success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  }

  // -------------------------------------------------------------------------
  // 2. DASHBOARD ANALYTICS
  // -------------------------------------------------------------------------
  if (pathname === '/api/dashboard/stats' && method === 'GET') {
    const today = getCairoDate();
    const currentMonthKey = today.substring(0, 7); // 'YYYY-MM'

    // Student counts
    const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    const activeStudents = db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'active'").get().c;
    const withdrawnStudents = db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'withdrawn'").get().c;
    const suspendedStudents = db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'suspended'").get().c;

    // Categories breakdown
    const regularCount = db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'active' AND classification = 'regular'").get().c;
    const learningDiffCount = db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'active' AND classification = 'learning_difficulties'").get().c;
    const speechTherapyCount = db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'active' AND classification = 'speech_therapy'").get().c;

    // Today's attendance
    const attPresent = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date = ? AND status = 'present'").get(today).c;
    const attAbsent = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date = ? AND status = 'absent'").get(today).c;
    const attLate = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date = ? AND status = 'late'").get(today).c;
    const attExcused = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date = ? AND status = 'excused'").get(today).c;

    // Newly registered this month
    const newRegisteredThisMonth = db.prepare(`
      SELECT COUNT(*) as c FROM students
      WHERE enrollment_date >= ?
    `).get(`${currentMonthKey}-01`).c;

    // Financial stats (Month to date)
    // 1. Total payments collected this month
    const monthPayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed' AND payment_date LIKE ?
    `).get(`${currentMonthKey}%`).total;

    // Additional payments specifically
    const monthAdditionalPayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed' AND payment_category != 'tuition' AND payment_date LIKE ?
    `).get(`${currentMonthKey}%`).total;

    // 2. Total charges expected this month
    const monthExpectedCharges = db.prepare(`
      SELECT COALESCE(SUM(net_amount), 0) as total
      FROM student_charges
      WHERE charge_date LIKE ? OR billing_month = ?
    `).get(`${currentMonthKey}%`, currentMonthKey).total;

    // 3. Outstanding fees (all unpaid student charges)
    const totalOutstandingFees = db.prepare(`
      SELECT COALESCE(SUM(net_amount - paid_amount), 0) as total
      FROM student_charges
      WHERE status IN ('unpaid', 'partially_paid')
    `).get().total;

    // Overdue balance (due date < today)
    const overdueBalance = db.prepare(`
      SELECT COALESCE(SUM(net_amount - paid_amount), 0) as total
      FROM student_charges
      WHERE status IN ('unpaid', 'partially_paid') AND date(due_date) < date(?)
    `).get(today).total;

    // 4. Expenses paid this month (Cash Outflow)
    const monthExpensesPaid = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) as total
      FROM expenses
      WHERE (payment_status = 'paid' OR paid_amount > 0) AND expense_date LIKE ?
    `).get(`${currentMonthKey}%`).total;

    // Net Cash Flow this month
    const netCashFlow = monthPayments - monthExpensesPaid;

    // 5. Outstanding salary obligations
    const unpaidSalaryObligations = db.prepare(`
      SELECT COALESCE(SUM(net_salary - paid_amount), 0) as total
      FROM payroll_records
      WHERE status IN ('unpaid', 'partially_paid')
    `).get().total;

    // Collection Percentage
    const collectionPercentage = monthExpectedCharges > 0
      ? Math.round((monthPayments / monthExpectedCharges) * 100)
      : 100;

    // Overdue students list (top 5)
    const overdueStudentsList = db.prepare(`
      SELECT s.id, s.code, s.full_name,
             COALESCE(SUM(c.net_amount - c.paid_amount), 0) as overdue_amount,
             MAX(c.due_date) as latest_due_date,
             g.mobile as parent_mobile, g.full_name as parent_name
      FROM students s
      JOIN student_charges c ON s.id = c.student_id
      LEFT JOIN guardians g ON s.id = g.student_id AND g.is_primary = 1
      WHERE s.status = 'active'
        AND c.status IN ('unpaid', 'partially_paid')
        AND date(c.due_date) < date(?)
      GROUP BY s.id
      ORDER BY overdue_amount DESC
      LIMIT 5
    `).all(today);

    // Recent transactions (last 5)
    const recentPayments = db.prepare(`
      SELECT p.id, p.receipt_no, p.amount, p.payment_date, p.payment_time, p.payment_method,
             s.code as student_code, s.full_name as student_name
      FROM payments p
      JOIN students s ON p.student_id = s.id
      ORDER BY p.id DESC
      LIMIT 5
    `).all();

    // Recent activity audit logs (last 5)
    const recentActivities = db.prepare(`
      SELECT id, user_name, action, entity_type, entity_id, details, created_at
      FROM audit_logs
      ORDER BY id DESC
      LIMIT 6
    `).all();

    return sendJson(res, 200, {
      success: true,
      stats: {
        totalStudents,
        activeStudents,
        withdrawnStudents,
        suspendedStudents,
        classifications: {
          regular: regularCount,
          learningDifficulties: learningDiffCount,
          speechTherapy: speechTherapyCount
        },
        attendanceToday: {
          present: attPresent,
          absent: attAbsent,
          late: attLate,
          excused: attExcused,
          total: attPresent + attAbsent + attLate + attExcused
        },
        newRegisteredThisMonth,
        finances: {
          monthPayments,
          monthAdditionalPayments,
          monthExpectedCharges,
          totalOutstandingFees,
          overdueBalance,
          monthExpensesPaid,
          netCashFlow,
          unpaidSalaryObligations,
          collectionPercentage
        },
        overdueStudentsList,
        recentPayments,
        recentActivities
      }
    });
  }

  // -------------------------------------------------------------------------
  // 3. STUDENTS & GUARDIANS MANAGEMENT
  // -------------------------------------------------------------------------
  if (pathname === '/api/students' && method === 'GET') {
    const { search, status, classification, classroom_id } = query;
    let sql = `
      SELECT s.*, c.name as classroom_name, e.full_name as teacher_name,
             g.full_name as primary_guardian_name, g.mobile as primary_guardian_mobile,
             COALESCE((
               SELECT SUM(sc.net_amount - sc.paid_amount)
               FROM student_charges sc
               WHERE sc.student_id = s.id AND sc.status IN ('unpaid', 'partially_paid')
             ), 0) as balance
      FROM students s
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN employees e ON s.teacher_id = e.id
      LEFT JOIN guardians g ON s.id = g.student_id AND g.is_primary = 1
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }
    if (classification) {
      sql += ' AND s.classification = ?';
      params.push(classification);
    }
    if (classroom_id) {
      sql += ' AND s.classroom_id = ?';
      params.push(Number(classroom_id));
    }
    if (search) {
      sql += ` AND (
        s.full_name LIKE ? OR
        CAST(s.code AS TEXT) LIKE ? OR
        g.full_name LIKE ? OR
        g.mobile LIKE ?
      )`;
      const sTerm = `%${search}%`;
      params.push(sTerm, sTerm, sTerm, sTerm);
    }

    sql += ' ORDER BY s.code ASC';
    const students = db.prepare(sql).all(...params);

    return sendJson(res, 200, { success: true, count: students.length, students });
  }

  if (pathname === '/api/students' && method === 'POST') {
    if (!hasPermission(user, 'students_edit') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية تسجيل طفل جديد');
    }

    const {
      full_name,
      dob,
      gender,
      photo,
      enrollment_date,
      classification = 'regular',
      classroom_id,
      teacher_id,
      monthly_tuition = 0,
      payment_due_day = 1,
      discount_amount = 0,
      discount_reason,
      medical_notes,
      notes,
      // Guardian details
      guardian_name,
      guardian_relationship = 'ولي أمر',
      guardian_mobile,
      guardian_mobile_secondary,
      guardian_email,
      guardian_address
    } = body || {};

    if (!full_name || !dob || !enrollment_date) {
      return sendError(res, 400, 'الاسم وتاريخ الميلاد وتاريخ الالتحاق حقول إجبارية');
    }

    // Atomic transaction for student code & creation
    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const studentCode = getNextStudentCode();
      const now = getCairoNow();
      const today = getCairoDate();

      const insertStudent = db.prepare(`
        INSERT INTO students (
          code, full_name, dob, gender, photo, enrollment_date, status, classification,
          classroom_id, teacher_id, monthly_tuition, payment_due_day,
          discount_amount, discount_reason, medical_notes, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const resInsert = insertStudent.run(
        studentCode,
        full_name,
        dob,
        gender || 'ذكر',
        photo || null,
        enrollment_date,
        classification,
        classroom_id || null,
        teacher_id || null,
        Number(monthly_tuition) || 0,
        Number(payment_due_day) || 1,
        Number(discount_amount) || 0,
        discount_reason || null,
        medical_notes || null,
        notes || null,
        now,
        now
      );

      const studentId = Number(resInsert.lastInsertRowid);

      // Create primary guardian if mobile & name provided
      if (guardian_name && guardian_mobile) {
        db.prepare(`
          INSERT INTO guardians (
            student_id, full_name, relationship, is_primary, mobile,
            mobile_secondary, email, address, created_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
        `).run(
          studentId,
          guardian_name,
          guardian_relationship,
          guardian_mobile,
          guardian_mobile_secondary || null,
          guardian_email || null,
          guardian_address || null,
          now
        );
      }

      // Automatically generate initial monthly tuition charge
      const tuitionAmt = Number(monthly_tuition) || 0;
      if (tuitionAmt > 0) {
        const disc = Number(discount_amount) || 0;
        const netAmt = Math.max(0, tuitionAmt - disc);
        const billingMonth = enrollment_date.substring(0, 7);
        const dueDay = Math.min(28, Math.max(1, Number(payment_due_day) || 1));
        const dueDate = `${billingMonth}-${String(dueDay).padStart(2, '0')}`;

        db.prepare(`
          INSERT INTO student_charges (
            student_id, charge_type, description, amount, discount, net_amount,
            charge_date, due_date, billing_month, status, paid_amount,
            created_by_user_id, created_at, updated_at
          ) VALUES (?, 'tuition', ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, ?, ?)
        `).run(
          studentId,
          `مصروفات شهرية (${billingMonth})`,
          tuitionAmt,
          disc,
          netAmt,
          enrollment_date,
          dueDate,
          billingMonth,
          user.id,
          now,
          now
        );
      }

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'STUDENT_CREATE',
        entityType: 'student',
        entityId: studentId,
        details: { code: studentCode, full_name, monthly_tuition }
      });

      return sendJson(res, 201, {
        success: true,
        message: 'تم تسجيل الطفل بنجاح',
        student: { id: studentId, code: studentCode, full_name }
      });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Failed to register student:', err);
      return sendError(res, 500, 'فشل في حفظ بيانات الطفل: ' + err.message);
    }
  }

  // Student profile single view
  const studentMatch = pathname.match(/^\/api\/students\/(\d+)$/);
  if (studentMatch && method === 'GET') {
    const studentId = Number(studentMatch[1]);
    const student = db.prepare(`
      SELECT s.*, c.name as classroom_name, e.full_name as teacher_name
      FROM students s
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN employees e ON s.teacher_id = e.id
      WHERE s.id = ?
    `).get(studentId);

    if (!student) {
      return sendError(res, 404, 'الطفل غير موجود');
    }

    const guardians = db.prepare('SELECT * FROM guardians WHERE student_id = ? ORDER BY is_primary DESC, id ASC').all(studentId);
    const charges = db.prepare('SELECT * FROM student_charges WHERE student_id = ? ORDER BY charge_date DESC, id DESC').all(studentId);
    const payments = db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC, id DESC').all(studentId);
    const attendanceStats = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM attendance
      WHERE student_id = ?
      GROUP BY status
    `).all(studentId);
    const sessions = db.prepare(`
      SELECT s.*, e.full_name as teacher_name
      FROM sessions s
      LEFT JOIN employees e ON s.teacher_id = e.id
      WHERE s.student_id = ?
      ORDER BY s.session_date DESC, s.id DESC
    `).all(studentId);
    const progressReports = db.prepare('SELECT * FROM progress_reports WHERE student_id = ? ORDER BY id DESC').all(studentId);
    const documents = db.prepare('SELECT * FROM student_documents WHERE student_id = ? ORDER BY id DESC').all(studentId);
    const classificationHistory = db.prepare(`
      SELECT h.*, u.full_name as changed_by_name
      FROM student_classification_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.student_id = ?
      ORDER BY h.id DESC
    `).all(studentId);
    const communicationLogs = db.prepare(`
      SELECT c.*, u.full_name as sent_by_name
      FROM communication_logs c
      LEFT JOIN users u ON c.sent_by_user_id = u.id
      WHERE c.student_id = ?
      ORDER BY c.id DESC
    `).all(studentId);

    // Calculate balance
    let totalCharges = 0;
    let totalPaid = 0;
    for (const ch of charges) {
      totalCharges += Number(ch.net_amount || 0);
      totalPaid += Number(ch.paid_amount || 0);
    }
    const balance = totalCharges - totalPaid;

    return sendJson(res, 200, {
      success: true,
      student,
      guardians,
      finances: {
        totalCharges,
        totalPaid,
        balance
      },
      charges,
      payments,
      attendanceStats,
      sessions,
      progressReports,
      documents,
      classificationHistory,
      communicationLogs
    });
  }

  // Update student
  if (studentMatch && method === 'PUT') {
    if (!hasPermission(user, 'students_edit') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية تعديل بيانات الطفل');
    }

    const studentId = Number(studentMatch[1]);
    const current = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!current) {
      return sendError(res, 404, 'الطفل غير موجود');
    }

    const {
      full_name,
      dob,
      gender,
      photo,
      enrollment_date,
      status,
      classification,
      classification_reason,
      classroom_id,
      teacher_id,
      monthly_tuition,
      payment_due_day,
      discount_amount,
      discount_reason,
      medical_notes,
      notes
    } = body || {};

    const now = getCairoNow();

    // Check if classification changed
    if (classification && classification !== current.classification) {
      db.prepare(`
        INSERT INTO student_classification_history (
          student_id, old_classification, new_classification, reason, changed_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(studentId, current.classification, classification, classification_reason || 'تحديث من شاشة الملف', user.id, now);
    }

    db.prepare(`
      UPDATE students SET
        full_name = COALESCE(?, full_name),
        dob = COALESCE(?, dob),
        gender = COALESCE(?, gender),
        photo = COALESCE(?, photo),
        enrollment_date = COALESCE(?, enrollment_date),
        status = COALESCE(?, status),
        classification = COALESCE(?, classification),
        classroom_id = ?,
        teacher_id = ?,
        monthly_tuition = COALESCE(?, monthly_tuition),
        payment_due_day = COALESCE(?, payment_due_day),
        discount_amount = COALESCE(?, discount_amount),
        discount_reason = COALESCE(?, discount_reason),
        medical_notes = COALESCE(?, medical_notes),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      full_name,
      dob,
      gender,
      photo !== undefined ? photo : current.photo,
      enrollment_date,
      status,
      classification,
      classroom_id !== undefined ? classroom_id : current.classroom_id,
      teacher_id !== undefined ? teacher_id : current.teacher_id,
      monthly_tuition !== undefined ? Number(monthly_tuition) : current.monthly_tuition,
      payment_due_day !== undefined ? Number(payment_due_day) : current.payment_due_day,
      discount_amount !== undefined ? Number(discount_amount) : current.discount_amount,
      discount_reason,
      medical_notes,
      notes,
      now,
      studentId
    );

    logAudit({
      user,
      action: 'STUDENT_UPDATE',
      entityType: 'student',
      entityId: studentId,
      details: body
    });

    return sendJson(res, 200, { success: true, message: 'تم تحديث بيانات الطفل بنجاح' });
  }

  // Delete student completely
  if (studentMatch && method === 'DELETE') {
    if (!hasPermission(user, 'admin') && !hasPermission(user, 'students_edit')) {
      return sendError(res, 403, 'فقط المدير أو صاحب الصلاحية يمكنه حذف طفل');
    }

    const studentId = Number(studentMatch[1]);
    const current = db.prepare('SELECT id, code, full_name FROM students WHERE id = ?').get(studentId);
    if (!current) {
      return sendError(res, 404, 'الطفل غير موجود');
    }

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      // 1. Delete payment refunds for payments of this student
      db.prepare(`
        DELETE FROM payment_refunds
        WHERE payment_id IN (SELECT id FROM payments WHERE student_id = ?)
      `).run(studentId);

      // 2. Delete payment allocations for payments or charges of this student
      db.prepare(`
        DELETE FROM payment_allocations
        WHERE payment_id IN (SELECT id FROM payments WHERE student_id = ?)
           OR charge_id IN (SELECT id FROM student_charges WHERE student_id = ?)
      `).run(studentId, studentId);

      // 3. Delete payments
      db.prepare('DELETE FROM payments WHERE student_id = ?').run(studentId);

      // 4. Delete sessions
      db.prepare('DELETE FROM sessions WHERE student_id = ?').run(studentId);

      // 5. Delete charges
      db.prepare('DELETE FROM student_charges WHERE student_id = ?').run(studentId);

      // 6. Delete attendance
      db.prepare('DELETE FROM attendance WHERE student_id = ?').run(studentId);

      // 7. Delete guardians
      db.prepare('DELETE FROM guardians WHERE student_id = ?').run(studentId);

      // 8. Delete classification history
      db.prepare('DELETE FROM student_classification_history WHERE student_id = ?').run(studentId);

      // 9. Delete documents
      db.prepare('DELETE FROM student_documents WHERE student_id = ?').run(studentId);

      // 10. Delete progress reports
      db.prepare('DELETE FROM progress_reports WHERE student_id = ?').run(studentId);

      // 11. Disassociate communication logs
      db.prepare('UPDATE communication_logs SET student_id = NULL WHERE student_id = ?').run(studentId);

      // 12. Delete student record
      db.prepare('DELETE FROM students WHERE id = ?').run(studentId);

      // 13. Sync student_code_sequence to lowest free code (>= 1001)
      const remainingStudents = db.prepare('SELECT code FROM students WHERE code >= 1001').all();
      const takenCodes = new Set(remainingStudents.map(r => Number(r.code)));
      let lowestAvailable = 1001;
      while (takenCodes.has(lowestAvailable)) {
        lowestAvailable++;
      }
      db.prepare('UPDATE student_code_sequence SET next_code = ? WHERE id = 1').run(lowestAvailable);

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'STUDENT_DELETE',
        entityType: 'student',
        entityId: studentId,
        details: {
          code: current.code,
          full_name: current.full_name,
          message: 'تم حذف الطفل وكافة سجلاته نهائياً من النظام'
        }
      });

      return sendJson(res, 200, {
        success: true,
        message: `تم حذف بيانات الطفل (${current.full_name}) نهائياً بنجاح`
      });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Failed to delete student:', err);
      return sendError(res, 500, 'فشل في حذف بيانات الطفل: ' + err.message);
    }
  }

  // Add guardian to child
  const guardianAddMatch = pathname.match(/^\/api\/students\/(\d+)\/guardians$/);
  if (guardianAddMatch && method === 'POST') {
    const studentId = Number(guardianAddMatch[1]);
    const { full_name, relationship, mobile, mobile_secondary, email, address, is_primary } = body || {};
    if (!full_name || !mobile) {
      return sendError(res, 400, 'الاسم ورقم الهاتف مطلوبان');
    }

    if (is_primary) {
      db.prepare('UPDATE guardians SET is_primary = 0 WHERE student_id = ?').run(studentId);
    }

    const resG = db.prepare(`
      INSERT INTO guardians (
        student_id, full_name, relationship, is_primary, mobile, mobile_secondary, email, address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId, full_name, relationship || 'ولي أمر', is_primary ? 1 : 0, mobile,
      mobile_secondary || null, email || null, address || null, getCairoNow()
    );

    logAudit({
      user,
      action: 'GUARDIAN_ADD',
      entityType: 'guardian',
      entityId: resG.lastInsertRowid,
      details: { studentId, full_name, mobile }
    });

    return sendJson(res, 201, { success: true, message: 'تمت إضافة ولي الأمر بنجاح' });
  }

  // -------------------------------------------------------------------------
  // 4. CLASSROOMS
  // -------------------------------------------------------------------------
  if (pathname === '/api/classrooms' && method === 'GET') {
    const classrooms = db.prepare(`
      SELECT c.*, e.full_name as lead_teacher_name,
             (SELECT COUNT(*) FROM students s WHERE s.classroom_id = c.id AND s.status = 'active') as active_students_count
      FROM classrooms c
      LEFT JOIN employees e ON c.lead_teacher_id = e.id
      ORDER BY c.id ASC
    `).all();
    return sendJson(res, 200, { success: true, classrooms });
  }

  if (pathname === '/api/classrooms' && method === 'POST') {
    if (!hasPermission(user, 'admin')) {
      return sendError(res, 403, 'غير مصرح');
    }
    const { name, age_group, capacity, lead_teacher_id, notes } = body || {};
    if (!name) return sendError(res, 400, 'اسم القاعة مطلوب');

    db.prepare(`
      INSERT INTO classrooms (name, age_group, capacity, lead_teacher_id, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, age_group || null, Number(capacity) || 15, lead_teacher_id || null, notes || null, getCairoNow());

    return sendJson(res, 201, { success: true, message: 'تم إنشاء القاعة بنجاح' });
  }

  // -------------------------------------------------------------------------
  // 5. FEES, CHARGES & PAYMENTS
  // -------------------------------------------------------------------------
  if (pathname === '/api/charges' && method === 'POST') {
    if (!hasPermission(user, 'finances_view') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'غير مصرح');
    }

    const {
      student_id,
      charge_type = 'custom',
      description,
      amount,
      discount = 0,
      charge_date = getCairoDate(),
      due_date = getCairoDate(),
      billing_month
    } = body || {};

    if (!student_id || !description || Number(amount) <= 0) {
      return sendError(res, 400, 'الطفل والوصف ومبلغ الرسوم حقول إجبارية');
    }

    const netAmount = Math.max(0, Number(amount) - Number(discount || 0));
    const now = getCairoNow();

    const resCh = db.prepare(`
      INSERT INTO student_charges (
        student_id, charge_type, description, amount, discount, net_amount,
        charge_date, due_date, billing_month, status, paid_amount, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, ?, ?)
    `).run(
      Number(student_id),
      charge_type,
      description,
      Number(amount),
      Number(discount || 0),
      netAmount,
      charge_date,
      due_date,
      billing_month || charge_date.substring(0, 7),
      user.id,
      now,
      now
    );

    logAudit({
      user,
      action: 'CHARGE_CREATE',
      entityType: 'student_charge',
      entityId: resCh.lastInsertRowid,
      details: { student_id, description, amount: netAmount }
    });

    return sendJson(res, 201, { success: true, message: 'تم تسجيل الرسوم بنجاح' });
  }

  // List payments
  if (pathname === '/api/payments' && method === 'GET') {
    const { start_date, end_date, student_id, method: pMethod } = query;
    let sql = `
      SELECT p.*, s.code as student_code, s.full_name as student_name,
             u.full_name as recorded_by_name
      FROM payments p
      JOIN students s ON p.student_id = s.id
      LEFT JOIN users u ON p.recorded_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (student_id) {
      sql += ' AND p.student_id = ?';
      params.push(Number(student_id));
    }
    if (start_date) {
      sql += ' AND date(p.payment_date) >= date(?)';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND date(p.payment_date) <= date(?)';
      params.push(end_date);
    }
    if (pMethod) {
      sql += ' AND p.payment_method = ?';
      params.push(pMethod);
    }

    sql += ' ORDER BY p.id DESC';
    const payments = db.prepare(sql).all(...params);
    return sendJson(res, 200, { success: true, payments });
  }

  // Record payment (Receipt)
  if (pathname === '/api/payments' && method === 'POST') {
    if (!hasPermission(user, 'payments_record') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية تسجيل مدفوعات');
    }

    const {
      student_id,
      amount,
      payment_date = getCairoDate(),
      payment_time = getCairoNow().substring(11),
      payment_method = 'cash',
      payment_category = 'tuition',
      notes,
      charge_id // Optional: allocate to specific charge, or auto-allocate oldest
    } = body || {};

    const payAmt = Number(amount);
    if (!student_id || isNaN(payAmt) || payAmt <= 0) {
      return sendError(res, 400, 'يرجى تحديد الطفل والمبلغ بدقة (أكبر من صفر)');
    }

    const student = db.prepare('SELECT id, code, full_name FROM students WHERE id = ?').get(Number(student_id));
    if (!student) {
      return sendError(res, 404, 'الطفل غير موجود');
    }

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const receiptNo = getNextReceiptNumber();
      const now = getCairoNow();

      // 1. Insert payment record
      const insPay = db.prepare(`
        INSERT INTO payments (
          receipt_no, student_id, amount, payment_date, payment_time,
          payment_method, payment_category, status, notes, recorded_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
      `);
      const resPay = insPay.run(
        receiptNo,
        student.id,
        payAmt,
        payment_date,
        payment_time,
        payment_method,
        payment_category,
        notes || null,
        user.id,
        now,
        now
      );
      const paymentId = Number(resPay.lastInsertRowid);

      // 2. Allocate payment to charges
      let remainingToAllocate = payAmt;

      // Select target charges: if charge_id specified, start there; otherwise all unpaid ordered by date
      let targetCharges = [];
      if (charge_id) {
        targetCharges = db.prepare('SELECT * FROM student_charges WHERE id = ? AND student_id = ?').all(Number(charge_id), student.id);
      } else {
        targetCharges = db.prepare(`
          SELECT * FROM student_charges
          WHERE student_id = ? AND status IN ('unpaid', 'partially_paid')
          ORDER BY date(due_date) ASC, id ASC
        `).all(student.id);
      }

      for (const ch of targetCharges) {
        if (remainingToAllocate <= 0) break;
        const dueOnCharge = Number(ch.net_amount) - Number(ch.paid_amount);
        if (dueOnCharge <= 0) continue;

        const alloc = Math.min(remainingToAllocate, dueOnCharge);
        const newPaid = Number(ch.paid_amount) + alloc;
        const newStatus = newPaid >= Number(ch.net_amount) ? 'paid' : 'partially_paid';

        // Insert allocation
        db.prepare(`
          INSERT INTO payment_allocations (payment_id, charge_id, allocated_amount, created_at)
          VALUES (?, ?, ?, ?)
        `).run(paymentId, ch.id, alloc, now);

        // Update charge
        db.prepare(`
          UPDATE student_charges
          SET paid_amount = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(newPaid, newStatus, now, ch.id);

        remainingToAllocate -= alloc;
      }

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'PAYMENT_RECORD',
        entityType: 'payment',
        entityId: paymentId,
        details: { receiptNo, studentCode: student.code, studentName: student.full_name, amount: payAmt, payment_method }
      });

      return sendJson(res, 201, {
        success: true,
        message: 'تم تسجيل الدفعة وإصدار الإيصال بنجاح',
        payment: {
          id: paymentId,
          receipt_no: receiptNo,
          amount: payAmt,
          payment_date,
          student_id: student.id,
          student_code: student.code,
          student_name: student.full_name
        }
      });
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Payment record failed:', err);
      return sendError(res, 500, 'فشل في حفظ الدفعة: ' + err.message);
    }
  }

  // Refund / Reversal
  const refundMatch = pathname.match(/^\/api\/payments\/(\d+)\/refund$/);
  if (refundMatch && method === 'POST') {
    if (!hasPermission(user, 'payments_refund') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية استرداد المدفوعات');
    }

    const paymentId = Number(refundMatch[1]);
    const { reason, refund_method = 'cash' } = body || {};
    if (!reason) {
      return sendError(res, 400, 'سبب الاسترداد حقل إجباري');
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) return sendError(res, 404, 'سند القبض غير موجود');
    if (payment.status === 'refunded') return sendError(res, 400, 'هذه الدفعة مستردة مسبقاً');

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const now = getCairoNow();
      const today = getCairoDate();

      // 1. Rollback allocations on charges
      const allocations = db.prepare('SELECT * FROM payment_allocations WHERE payment_id = ?').all(paymentId);
      for (const al of allocations) {
        const ch = db.prepare('SELECT * FROM student_charges WHERE id = ?').get(al.charge_id);
        if (ch) {
          const rolledBackPaid = Math.max(0, Number(ch.paid_amount) - Number(al.allocated_amount));
          const updatedStatus = rolledBackPaid === 0 ? 'unpaid' : (rolledBackPaid < Number(ch.net_amount) ? 'partially_paid' : 'paid');
          db.prepare('UPDATE student_charges SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?')
            .run(rolledBackPaid, updatedStatus, now, ch.id);
        }
      }

      // 2. Mark payment as refunded
      db.prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?").run(now, paymentId);

      // 3. Record refund record
      db.prepare(`
        INSERT INTO payment_refunds (payment_id, type, amount, reason, refund_date, refund_method, approved_by_user_id, created_at)
        VALUES (?, 'refund', ?, ?, ?, ?, ?, ?)
      `).run(paymentId, payment.amount, reason, today, refund_method, user.id, now);

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'PAYMENT_REFUND',
        entityType: 'payment',
        entityId: paymentId,
        details: { receiptNo: payment.receipt_no, amount: payment.amount, reason }
      });

      return sendJson(res, 200, { success: true, message: 'تم استرداد الدفعة وإعادة الرسوم المستحقة بنجاح' });
    } catch (err) {
      db.exec('ROLLBACK');
      return sendError(res, 500, 'فشل الاسترداد: ' + err.message);
    }
  }

  // Outstanding Fees Report
  if (pathname === '/api/outstanding-fees' && method === 'GET') {
    const { filter, classroom_id } = query;
    const today = getCairoDate();

    let sql = `
      SELECT s.id, s.code, s.full_name, s.payment_due_day, c.name as classroom_name,
             g.full_name as guardian_name, g.mobile as guardian_mobile,
             COALESCE(SUM(sc.net_amount), 0) as total_charges,
             COALESCE(SUM(sc.paid_amount), 0) as total_paid,
             COALESCE(SUM(sc.net_amount - sc.paid_amount), 0) as remaining_balance,
             MIN(CASE WHEN sc.status IN ('unpaid', 'partially_paid') THEN sc.due_date ELSE NULL END) as earliest_due_date,
             (
               SELECT MAX(p.payment_date)
               FROM payments p
               WHERE p.student_id = s.id AND p.status = 'completed'
             ) as last_payment_date
      FROM students s
      JOIN student_charges sc ON s.id = sc.student_id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN guardians g ON s.id = g.student_id AND g.is_primary = 1
      WHERE s.status = 'active'
    `;
    const params = [];

    if (classroom_id) {
      sql += ' AND s.classroom_id = ?';
      params.push(Number(classroom_id));
    }

    sql += ' GROUP BY s.id HAVING remaining_balance > 0';

    if (filter === 'overdue') {
      sql += ' AND date(earliest_due_date) < date(?)';
      params.push(today);
    }

    sql += ' ORDER BY remaining_balance DESC';

    const records = db.prepare(sql).all(...params);

    // Calculate overdue days
    const enriched = records.map(r => {
      let overdueDays = 0;
      if (r.earliest_due_date && r.earliest_due_date < today) {
        const diffTime = Math.abs(new Date(today) - new Date(r.earliest_due_date));
        overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
      return {
        ...r,
        overdue_days: overdueDays,
        is_overdue: overdueDays > 0
      };
    });

    return sendJson(res, 200, { success: true, count: enriched.length, records: enriched });
  }

  // -------------------------------------------------------------------------
  // 6. ATTENDANCE & LESSONS
  // -------------------------------------------------------------------------
  if (pathname === '/api/attendance' && method === 'GET') {
    const { date = getCairoDate(), classroom_id } = query;
    let sql = `
      SELECT s.id as student_id, s.code, s.full_name, s.classroom_id, c.name as classroom_name,
             a.id as attendance_id, a.status, a.arrival_time, a.departure_time, a.reason, a.notes
      FROM students s
      LEFT JOIN classrooms c ON s.classroom_id = c.id
      LEFT JOIN attendance a ON s.id = a.student_id AND a.date = ?
      WHERE s.status = 'active'
    `;
    const params = [date];
    if (classroom_id) {
      sql += ' AND s.classroom_id = ?';
      params.push(Number(classroom_id));
    }
    sql += ' ORDER BY s.code ASC';

    const list = db.prepare(sql).all(...params);
    return sendJson(res, 200, { success: true, date, list });
  }

  if (pathname === '/api/attendance/bulk' && method === 'POST') {
    if (!hasPermission(user, 'attendance_record') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية تسجيل الحضور');
    }

    const { date = getCairoDate(), records = [] } = body || {};
    if (!Array.isArray(records) || records.length === 0) {
      return sendError(res, 400, 'لا توجد سجلات حضور للحفظ');
    }

    const now = getCairoNow();
    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const upsert = db.prepare(`
        INSERT INTO attendance (
          student_id, classroom_id, date, status, arrival_time, departure_time, reason, notes, recorded_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, date) DO UPDATE SET
          status = excluded.status,
          arrival_time = excluded.arrival_time,
          departure_time = excluded.departure_time,
          reason = excluded.reason,
          notes = excluded.notes,
          recorded_by_user_id = excluded.recorded_by_user_id,
          updated_at = excluded.updated_at
      `);

      for (const item of records) {
        if (!item.student_id || !item.status) continue;
        upsert.run(
          Number(item.student_id),
          item.classroom_id || null,
          date,
          item.status, // present, absent, late, excused
          item.arrival_time || null,
          item.departure_time || null,
          item.reason || null,
          item.notes || null,
          user.id,
          now,
          now
        );
      }

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'ATTENDANCE_RECORD',
        entityType: 'attendance',
        entityId: date,
        details: { count: records.length, date }
      });

      return sendJson(res, 200, { success: true, message: 'تم حفظ سجل الحضور والغياب بنجاح' });
    } catch (err) {
      db.exec('ROLLBACK');
      return sendError(res, 500, 'فشل حفظ الحضور: ' + err.message);
    }
  }

  // Sessions & Lessons
  if (pathname === '/api/sessions' && method === 'GET') {
    const { student_id, teacher_id, session_type } = query;
    let sql = `
      SELECT s.*, st.full_name as student_name, st.code as student_code,
             e.full_name as teacher_name
      FROM sessions s
      JOIN students st ON s.student_id = st.id
      LEFT JOIN employees e ON s.teacher_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (student_id) {
      sql += ' AND s.student_id = ?';
      params.push(Number(student_id));
    }
    if (teacher_id) {
      sql += ' AND s.teacher_id = ?';
      params.push(Number(teacher_id));
    }
    if (session_type) {
      sql += ' AND s.session_type = ?';
      params.push(session_type);
    }
    sql += ' ORDER BY s.session_date DESC, s.id DESC';

    const sessions = db.prepare(sql).all(...params);
    return sendJson(res, 200, { success: true, sessions });
  }

  if (pathname === '/api/sessions' && method === 'POST') {
    if (!hasPermission(user, 'sessions_manage') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية تسجيل جلسات');
    }

    const {
      student_id,
      teacher_id,
      session_type, // 'speech_therapy', 'learning_difficulties', 'extra_lesson'
      session_date = getCairoDate(),
      start_time,
      duration_minutes = 45,
      fee_amount = 0,
      auto_bill = false,
      progress_notes,
      recommendations
    } = body || {};

    if (!student_id || !session_type) {
      return sendError(res, 400, 'الطفل ونوع الجلسة حقول إجبارية');
    }

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const now = getCairoNow();
      let chargeId = null;
      let isBilled = 0;

      // Duplicate billing check & optional auto-charge creation
      const feeNum = Number(fee_amount);
      if (auto_bill && feeNum > 0) {
        const typeArabic = session_type === 'speech_therapy' ? 'جلسة تخاطب'
          : (session_type === 'learning_difficulties' ? 'جلسة صعوبات تعلم' : 'درس إضافي');

        const insCharge = db.prepare(`
          INSERT INTO student_charges (
            student_id, charge_type, description, amount, discount, net_amount,
            charge_date, due_date, billing_month, status, paid_amount, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 'unpaid', 0, ?, ?, ?)
        `).run(
          Number(student_id),
          session_type,
          `رسوم ${typeArabic} بتاريخ ${session_date}`,
          feeNum,
          feeNum,
          session_date,
          session_date,
          session_date.substring(0, 7),
          user.id,
          now,
          now
        );

        chargeId = Number(insCharge.lastInsertRowid);
        isBilled = 1;
      }

      const insSess = db.prepare(`
        INSERT INTO sessions (
          student_id, teacher_id, session_type, session_date, start_time, duration_minutes,
          status, fee_amount, is_billed, charge_id, progress_notes, recommendations,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(student_id),
        teacher_id || null,
        session_type,
        session_date,
        start_time || null,
        Number(duration_minutes) || 45,
        feeNum,
        isBilled,
        chargeId,
        progress_notes || null,
        recommendations || null,
        user.id,
        now,
        now
      );

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'SESSION_CREATE',
        entityType: 'session',
        entityId: insSess.lastInsertRowid,
        details: { student_id, session_type, fee_amount: feeNum, isBilled }
      });

      return sendJson(res, 201, { success: true, message: 'تم تسجيل الجلسة بنجاح' });
    } catch (err) {
      db.exec('ROLLBACK');
      return sendError(res, 500, 'فشل تسجيل الجلسة: ' + err.message);
    }
  }

  // -------------------------------------------------------------------------
  // 7. EXPENSES MANAGEMENT
  // -------------------------------------------------------------------------
  if (pathname === '/api/expense-categories' && method === 'GET') {
    const categories = db.prepare('SELECT * FROM expense_categories ORDER BY id ASC').all();
    return sendJson(res, 200, { success: true, categories });
  }

  if (pathname === '/api/expense-categories' && method === 'POST') {
    const { name } = body || {};
    if (!name) return sendError(res, 400, 'اسم البند مطلوب');
    const code = 'custom_' + Date.now();
    db.prepare('INSERT INTO expense_categories (code, name, is_custom, created_at) VALUES (?, ?, 1, ?)').run(code, name, getCairoNow());
    return sendJson(res, 201, { success: true, message: 'تمت إضافة بند المصروف بنجاح' });
  }

  if (pathname === '/api/expenses' && method === 'GET') {
    const { start_date, end_date, category, status: expStatus } = query;
    let sql = `
      SELECT e.*, u.full_name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (category) {
      sql += ' AND e.category = ?';
      params.push(category);
    }
    if (expStatus) {
      sql += ' AND e.payment_status = ?';
      params.push(expStatus);
    }
    if (start_date) {
      sql += ' AND date(e.expense_date) >= date(?)';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND date(e.expense_date) <= date(?)';
      params.push(end_date);
    }

    sql += ' ORDER BY e.id DESC';
    const expenses = db.prepare(sql).all(...params);
    return sendJson(res, 200, { success: true, expenses });
  }

  if (pathname === '/api/expenses' && method === 'POST') {
    if (!hasPermission(user, 'expenses_manage') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية تسجيل مصروفات');
    }

    const {
      category,
      custom_category_name,
      description,
      amount,
      expense_date = getCairoDate(),
      payment_status = 'paid', // paid, unpaid, partially_paid
      paid_amount,
      payment_method = 'cash',
      recipient_supplier,
      notes
    } = body || {};

    const expAmt = Number(amount);
    if (!category || !description || isNaN(expAmt) || expAmt <= 0) {
      return sendError(res, 400, 'التصنيف والبيان والمبلغ حقول إجبارية');
    }

    // Cash outflow rule: only actual paid amounts count!
    let finalPaidAmount = 0;
    if (payment_status === 'paid') {
      finalPaidAmount = expAmt;
    } else if (payment_status === 'partially_paid') {
      finalPaidAmount = Number(paid_amount) || 0;
    } else {
      finalPaidAmount = 0; // unpaid
    }

    const refNo = getNextExpenseReference();
    const now = getCairoNow();

    const resExp = db.prepare(`
      INSERT INTO expenses (
        reference_no, category, custom_category_name, description, amount, paid_amount,
        expense_date, payment_date, payment_status, payment_method, recipient_supplier,
        notes, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      refNo,
      category,
      custom_category_name || null,
      description,
      expAmt,
      finalPaidAmount,
      expense_date,
      finalPaidAmount > 0 ? expense_date : null,
      payment_status,
      payment_method,
      recipient_supplier || null,
      notes || null,
      user.id,
      now,
      now
    );

    logAudit({
      user,
      action: 'EXPENSE_CREATE',
      entityType: 'expense',
      entityId: resExp.lastInsertRowid,
      details: { refNo, category, amount: expAmt, paid_amount: finalPaidAmount, payment_status }
    });

    return sendJson(res, 201, { success: true, message: 'تم تسجيل المصروف بنجاح', reference_no: refNo });
  }

  // -------------------------------------------------------------------------
  // 8. EMPLOYEES & PAYROLL
  // -------------------------------------------------------------------------
  if (pathname === '/api/employees' && method === 'GET') {
    const employees = db.prepare(`
      SELECT e.*, c.name as classroom_name
      FROM employees e
      LEFT JOIN classrooms c ON e.classroom_id = c.id
      ORDER BY e.code ASC
    `).all();
    return sendJson(res, 200, { success: true, employees });
  }

  if (pathname === '/api/employees' && method === 'POST') {
    if (!hasPermission(user, 'payroll_manage') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'غير مصرح');
    }

    const {
      full_name,
      job_title,
      mobile,
      start_date = getCairoDate(),
      agreed_salary = 0,
      department,
      classroom_id,
      confidential_notes
    } = body || {};

    if (!full_name || !job_title || !mobile) {
      return sendError(res, 400, 'الاسم والوظيفة ورقم الهاتف حقول إجبارية');
    }

    const empCode = getNextEmployeeCode();
    const now = getCairoNow();

    const resEmp = db.prepare(`
      INSERT INTO employees (
        code, full_name, job_title, mobile, start_date, agreed_salary, department,
        classroom_id, confidential_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      empCode,
      full_name,
      job_title,
      mobile,
      start_date,
      Number(agreed_salary) || 0,
      department || null,
      classroom_id || null,
      confidential_notes || null,
      now,
      now
    );

    logAudit({
      user,
      action: 'EMPLOYEE_CREATE',
      entityType: 'employee',
      entityId: resEmp.lastInsertRowid,
      details: { code: empCode, full_name, agreed_salary }
    });

    return sendJson(res, 201, { success: true, message: 'تمت إضافة الموظف بنجاح', employee: { code: empCode, full_name } });
  }

  // Monthly Payroll Sheet
  if (pathname === '/api/payroll' && method === 'GET') {
    const { month = getCairoDate().substring(0, 7) } = query;

    const payrollRecords = db.prepare(`
      SELECT p.*, e.code as employee_code, e.full_name as employee_name, e.job_title, e.mobile
      FROM payroll_records p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.month = ?
      ORDER BY e.code ASC
    `).all(month);

    return sendJson(res, 200, { success: true, month, records: payrollRecords });
  }

  // Generate Monthly Payroll Records for Active Employees
  if (pathname === '/api/payroll/generate' && method === 'POST') {
    if (!hasPermission(user, 'payroll_manage') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'غير مصرح');
    }

    const { month = getCairoDate().substring(0, 7) } = body || {};
    const employees = db.prepare("SELECT * FROM employees WHERE status = 'active'").all();
    const now = getCairoNow();

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const insPayroll = db.prepare(`
        INSERT OR IGNORE INTO payroll_records (
          employee_id, month, base_salary, bonuses, deductions, advances,
          net_salary, paid_amount, status, created_at, updated_at
        ) VALUES (?, ?, ?, 0, 0, 0, ?, 0, 'unpaid', ?, ?)
      `);

      let generatedCount = 0;
      for (const emp of employees) {
        const resP = insPayroll.run(emp.id, month, emp.agreed_salary, emp.agreed_salary, now, now);
        if (resP.changes > 0) generatedCount++;
      }

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'PAYROLL_GENERATE',
        entityType: 'payroll',
        entityId: month,
        details: { generatedCount, month }
      });

      return sendJson(res, 200, { success: true, message: `تم إصدار مسير رواتب شهر ${month} لـ ${generatedCount} موظف` });
    } catch (err) {
      db.exec('ROLLBACK');
      return sendError(res, 500, 'فشل إصدار مسير الرواتب: ' + err.message);
    }
  }

  // Pay Salary: Crucial Rule: Records salary payment and AUTOMATICALLY creates an expense entry in cash ledger
  if (pathname === '/api/payroll/pay' && method === 'POST') {
    if (!hasPermission(user, 'payroll_manage') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية صرف الرواتب');
    }

    const { payroll_id, amount, payment_date = getCairoDate(), payment_method = 'cash', notes } = body || {};
    const payAmt = Number(amount);

    if (!payroll_id || isNaN(payAmt) || payAmt <= 0) {
      return sendError(res, 400, 'المبلغ وسجل الراتب حقول إجبارية');
    }

    const payroll = db.prepare(`
      SELECT p.*, e.id as emp_id, e.code as emp_code, e.full_name as emp_name, e.job_title
      FROM payroll_records p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.id = ?
    `).get(Number(payroll_id));

    if (!payroll) return sendError(res, 404, 'سجل الراتب غير موجود');

    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const now = getCairoNow();
      const expRef = getNextExpenseReference();

      // 1. Create exactly one corresponding paid expense in the expenses ledger
      const category = (payroll.job_title && payroll.job_title.includes('معلم')) ? 'teacher_salary' : 'employee_salary';
      const desc = `صرف راتب شهر (${payroll.month}) للموظف ${payroll.emp_name} (${payroll.job_title})`;

      const insExp = db.prepare(`
        INSERT INTO expenses (
          reference_no, category, description, amount, paid_amount,
          expense_date, payment_date, payment_status, payment_method, recipient_supplier,
          notes, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)
      `).run(
        expRef,
        category,
        desc,
        payAmt,
        payAmt,
        payment_date,
        payment_date,
        payment_method,
        payroll.emp_name,
        notes || null,
        user.id,
        now,
        now
      );
      const expenseId = Number(insExp.lastInsertRowid);

      // 2. Record salary payment with link to expense
      db.prepare(`
        INSERT INTO salary_payments (
          payroll_id, employee_id, amount, payment_date, payment_method,
          expense_id, recorded_by_user_id, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payroll.id,
        payroll.emp_id,
        payAmt,
        payment_date,
        payment_method,
        expenseId,
        user.id,
        notes || null,
        now
      );

      // 3. Link expense back to salary payment
      db.prepare('UPDATE expenses SET salary_payment_id = ? WHERE id = ?').run(payroll.id, expenseId);

      // 4. Update payroll record paid amount & status
      const newPaid = Number(payroll.paid_amount) + payAmt;
      const newStatus = newPaid >= Number(payroll.net_salary) ? 'paid' : 'partially_paid';

      db.prepare(`
        UPDATE payroll_records
        SET paid_amount = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(newPaid, newStatus, now, payroll.id);

      db.exec('COMMIT');

      logAudit({
        user,
        action: 'SALARY_PAY',
        entityType: 'payroll',
        entityId: payroll.id,
        details: { employee: payroll.emp_name, amount: payAmt, month: payroll.month, expenseRef: expRef }
      });

      return sendJson(res, 200, {
        success: true,
        message: 'تم صرف الراتب وتسجيل المصروف في الخزينة بنجاح',
        expense_ref: expRef
      });
    } catch (err) {
      db.exec('ROLLBACK');
      return sendError(res, 500, 'فشل صرف الراتب: ' + err.message);
    }
  }

  // -------------------------------------------------------------------------
  // 9. FINANCIAL REPORTS & CASH CLOSING
  // -------------------------------------------------------------------------
  if (pathname === '/api/reports/financial' && method === 'GET') {
    if (!hasPermission(user, 'financial_reports') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'ليس لديك صلاحية الاطلاع على التقارير المالية');
    }

    const { start_date, end_date } = query;
    let payDateFilter = '';
    let expDateFilter = '';
    const payParams = [];
    const expParams = [];

    if (start_date) {
      payDateFilter += ' AND date(payment_date) >= date(?)';
      expDateFilter += ' AND date(expense_date) >= date(?)';
      payParams.push(start_date);
      expParams.push(start_date);
    }
    if (end_date) {
      payDateFilter += ' AND date(payment_date) <= date(?)';
      expDateFilter += ' AND date(expense_date) <= date(?)';
      payParams.push(end_date);
      expParams.push(end_date);
    }

    // Revenue collected
    const totalPayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed' ${payDateFilter}
    `).get(...payParams).total;

    const tuitionCollected = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed' AND payment_category = 'tuition' ${payDateFilter}
    `).get(...payParams).total;

    const additionalCollected = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed' AND payment_category != 'tuition' ${payDateFilter}
    `).get(...payParams).total;

    // Expenses paid (actual cash outflow)
    const totalExpensesPaid = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) as total
      FROM expenses
      WHERE (payment_status = 'paid' OR paid_amount > 0) ${expDateFilter}
    `).get(...expParams).total;

    const salariesPaid = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) as total
      FROM expenses
      WHERE category IN ('teacher_salary', 'employee_salary')
        AND (payment_status = 'paid' OR paid_amount > 0) ${expDateFilter}
    `).get(...expParams).total;

    // Net Cash Flow
    const netCashFlow = totalPayments - totalExpensesPaid;

    // Accounting Balances (Accrual / Liabilities)
    const outstandingCustomerBalances = db.prepare(`
      SELECT COALESCE(SUM(net_amount - paid_amount), 0) as total
      FROM student_charges
      WHERE status IN ('unpaid', 'partially_paid')
    `).get().total;

    const outstandingExpensesLiabilities = db.prepare(`
      SELECT COALESCE(SUM(amount - paid_amount), 0) as total
      FROM expenses
      WHERE payment_status IN ('unpaid', 'partially_paid')
    `).get().total;

    const outstandingSalaryObligations = db.prepare(`
      SELECT COALESCE(SUM(net_salary - paid_amount), 0) as total
      FROM payroll_records
      WHERE status IN ('unpaid', 'partially_paid')
    `).get().total;

    // Breakdown by payment methods
    const paymentMethodsBreakdown = db.prepare(`
      SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'completed' ${payDateFilter}
      GROUP BY payment_method
    `).all(...payParams);

    // Breakdown of expenses by category
    const expensesByCategory = db.prepare(`
      SELECT category, COUNT(*) as count, COALESCE(SUM(paid_amount), 0) as total
      FROM expenses
      WHERE (payment_status = 'paid' OR paid_amount > 0) ${expDateFilter}
      GROUP BY category
    `).all(...expParams);

    return sendJson(res, 200, {
      success: true,
      report: {
        totalRevenue: totalPayments,
        tuitionCollected,
        additionalCollected,
        totalExpensesPaid,
        salariesPaid,
        netCashFlow,
        outstandingCustomerBalances,
        outstandingExpensesLiabilities,
        outstandingSalaryObligations,
        paymentMethodsBreakdown,
        expensesByCategory
      }
    });
  }

  // Daily Cash Closing
  if (pathname === '/api/daily-closing' && method === 'GET') {
    const date = query.date || getCairoDate();
    const existing = db.prepare('SELECT * FROM daily_closings WHERE closing_date = ?').get(date);

    // Calculate actual transactions for this date
    const cashIn = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE payment_method = 'cash' AND status = 'completed' AND payment_date = ?
    `).get(date).total;

    const cashOut = db.prepare(`
      SELECT COALESCE(SUM(paid_amount), 0) as total
      FROM expenses
      WHERE payment_method = 'cash' AND (payment_status = 'paid' OR paid_amount > 0) AND expense_date = ?
    `).get(date).total;

    const refunds = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payment_refunds
      WHERE refund_method = 'cash' AND refund_date = ?
    `).get(date).total;

    const settings = db.prepare('SELECT daily_cash_opening FROM settings WHERE id = 1').get();
    const openingBalance = settings ? Number(settings.daily_cash_opening || 0) : 0;
    const computedClosing = openingBalance + cashIn - cashOut - refunds;

    return sendJson(res, 200, {
      success: true,
      date,
      existingClosing: existing || null,
      openingBalance,
      cashIn,
      cashOut,
      refunds,
      computedClosing
    });
  }

  if (pathname === '/api/daily-closing' && method === 'POST') {
    if (!hasPermission(user, 'financial_reports') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'غير مصرح');
    }

    const { closing_date = getCairoDate(), opening_balance = 0, cash_in, cash_out, refunds = 0, actual_cash_counted, notes } = body || {};
    const computed = Number(opening_balance) + Number(cash_in) - Number(cash_out) - Number(refunds);
    const counted = actual_cash_counted !== undefined ? Number(actual_cash_counted) : computed;
    const difference = counted - computed;

    const now = getCairoNow();
    db.prepare(`
      INSERT INTO daily_closings (
        closing_date, opening_balance, cash_in, cash_out, refunds, closing_balance,
        actual_cash_counted, difference, status, notes, closed_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?)
      ON CONFLICT(closing_date) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        cash_in = excluded.cash_in,
        cash_out = excluded.cash_out,
        refunds = excluded.refunds,
        closing_balance = excluded.closing_balance,
        actual_cash_counted = excluded.actual_cash_counted,
        difference = excluded.difference,
        notes = excluded.notes,
        closed_by_user_id = excluded.closed_by_user_id
    `).run(
      closing_date,
      Number(opening_balance),
      Number(cash_in),
      Number(cash_out),
      Number(refunds),
      computed,
      counted,
      difference,
      notes || null,
      user.id,
      now
    );

    logAudit({
      user,
      action: 'SETTINGS_UPDATE',
      entityType: 'daily_closing',
      entityId: closing_date,
      details: { closing_date, computed, counted, difference }
    });

    return sendJson(res, 200, { success: true, message: 'تم إغلاق الخزينة اليومية وحفظ السجل بنجاح' });
  }

  // -------------------------------------------------------------------------
  // 10. NOTIFICATIONS & AUDIT LOGS
  // -------------------------------------------------------------------------
  if (pathname === '/api/notifications' && method === 'GET') {
    const list = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 50').all();
    const unreadCount = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0').get().c;
    return sendJson(res, 200, { success: true, unreadCount, notifications: list });
  }

  if (pathname.match(/^\/api\/notifications\/(\d+)\/read$/) && method === 'PUT') {
    const notifId = Number(pathname.match(/^\/api\/notifications\/(\d+)\/read$/)[1]);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);
    return sendJson(res, 200, { success: true });
  }

  if (pathname === '/api/scheduler/run' && method === 'POST') {
    const result = runScheduledTasks();
    return sendJson(res, 200, { success: true, message: 'تم تشغيل الفحص الآلي للمتأخرات بنجاح', result });
  }

  if (pathname === '/api/audit-logs' && method === 'GET') {
    if (!hasPermission(user, 'audit_view') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'فقط المدير يمكنه تصفح سجل المراقبة');
    }

    const { search, action, limit = 100 } = query;
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }
    if (search) {
      sql += ' AND (user_name LIKE ? OR details LIKE ? OR entity_type LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(Number(limit));

    const logs = db.prepare(sql).all(...params);
    return sendJson(res, 200, { success: true, logs });
  }

  // -------------------------------------------------------------------------
  // 11. COMMUNICATION LOGS & WHATSAPP REMINDER LOGGING
  // -------------------------------------------------------------------------
  if (pathname === '/api/communications/log' && method === 'POST') {
    const { student_id, recipient_name, recipient_phone, message_type = 'payment_reminder', channel = 'whatsapp', message_content } = body || {};
    if (!recipient_name || !recipient_phone || !message_content) {
      return sendError(res, 400, 'بيانات الرسالة غير مكتملة');
    }

    const now = getCairoNow();
    const resCom = db.prepare(`
      INSERT INTO communication_logs (
        student_id, recipient_name, recipient_phone, message_type, channel, message_content,
        status, sent_by_user_id, sent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)
    `).run(
      student_id ? Number(student_id) : null,
      recipient_name,
      recipient_phone,
      message_type,
      channel,
      message_content,
      user.id,
      now,
      now
    );

    logAudit({
      user,
      action: 'COMMUNICATION_SEND',
      entityType: 'communication',
      entityId: resCom.lastInsertRowid,
      details: { recipient_phone, message_type, channel }
    });

    return sendJson(res, 201, { success: true, message: 'تم توثيق الرسالة في سجل التواصل' });
  }

  // -------------------------------------------------------------------------
  // 12. USERS, ROLES & SETTINGS
  // -------------------------------------------------------------------------
  if (pathname === '/api/users' && method === 'GET') {
    if (!hasPermission(user, 'users_manage') && !hasPermission(user, 'admin')) {
      return sendError(res, 403, 'غير مصرح');
    }
    const users = db.prepare('SELECT id, username, full_name, role, permissions, is_active, last_login, created_at FROM users ORDER BY id ASC').all();
    const parsed = users.map(u => ({ ...u, permissions: JSON.parse(u.permissions || '[]') }));
    return sendJson(res, 200, { success: true, users: parsed });
  }

  if (pathname === '/api/users' && method === 'POST') {
    if (!hasPermission(user, 'admin')) return sendError(res, 403, 'فقط المدير يمكنه إضافة مستخدمين');
    const { username, password, full_name, role = 'teacher', permissions = [] } = body || {};
    if (!username || !password || !full_name) {
      return sendError(res, 400, 'اسم المستخدم وكلمة المرور والاسم الكامل حقول إجبارية');
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return sendError(res, 400, 'اسم المستخدم مستخدم بالفعل');

    const { hash, salt } = hashPassword(password);
    const now = getCairoNow();
    const resU = db.prepare(`
      INSERT INTO users (username, password_hash, salt, full_name, role, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(username, hash, salt, full_name, role, JSON.stringify(permissions), now, now);

    logAudit({
      user,
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: resU.lastInsertRowid,
      details: { username, role }
    });

    return sendJson(res, 201, { success: true, message: 'تم إنشاء حساب المستخدم بنجاح' });
  }

  if (pathname === '/api/settings' && method === 'GET') {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    return sendJson(res, 200, { success: true, settings });
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    if (!hasPermission(user, 'admin')) return sendError(res, 403, 'غير مصرح');
    const { nursery_name, slogan, phone, phone_secondary, email, address, currency, receipt_footer, daily_cash_opening } = body || {};
    const now = getCairoNow();

    db.prepare(`
      UPDATE settings SET
        nursery_name = COALESCE(?, nursery_name),
        slogan = COALESCE(?, slogan),
        phone = COALESCE(?, phone),
        phone_secondary = COALESCE(?, phone_secondary),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        currency = COALESCE(?, currency),
        receipt_footer = COALESCE(?, receipt_footer),
        daily_cash_opening = COALESCE(?, daily_cash_opening),
        updated_at = ?
      WHERE id = 1
    `).run(nursery_name, slogan, phone, phone_secondary, email, address, currency, receipt_footer, Number(daily_cash_opening || 0), now);

    logAudit({
      user,
      action: 'SETTINGS_UPDATE',
      entityType: 'settings',
      entityId: '1',
      details: body
    });

    return sendJson(res, 200, { success: true, message: 'تم حفظ الإعدادات بنجاح' });
  }

  // -------------------------------------------------------------------------
  // 13. BACKUP & DEMO DATA ENGINE
  // -------------------------------------------------------------------------
  if (pathname === '/api/backup/export-json' && method === 'GET') {
    if (!hasPermission(user, 'admin')) return sendError(res, 403, 'غير مصرح');

    const backup = {
      version: '1.0',
      exportedAt: getCairoNow(),
      settings: db.prepare('SELECT * FROM settings').all(),
      classrooms: db.prepare('SELECT * FROM classrooms').all(),
      employees: db.prepare('SELECT * FROM employees').all(),
      students: db.prepare('SELECT * FROM students').all(),
      guardians: db.prepare('SELECT * FROM guardians').all(),
      charges: db.prepare('SELECT * FROM student_charges').all(),
      payments: db.prepare('SELECT * FROM payments').all(),
      expenses: db.prepare('SELECT * FROM expenses').all(),
      attendance: db.prepare('SELECT * FROM attendance').all(),
      sessions: db.prepare('SELECT * FROM sessions').all()
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mamy_one_backup_${getCairoDate()}.json"`
    });
    res.end(JSON.stringify(backup, null, 2));
    return;
  }

  // Seed Realistic Demo Data (with clear demo indicators)
  if (pathname === '/api/demo-data/seed' && method === 'POST') {
    if (!hasPermission(user, 'admin')) return sendError(res, 403, 'غير مصرح');

    const { seedDemoData } = require('./demo_seed');
    const result = seedDemoData(user);
    return sendJson(res, 200, { success: true, message: 'تم تحميل البيانات التجريبية بنجاح', result });
  }

  // -------------------------------------------------------------------------
  // 14. CLOUDFLARE TUNNEL & MOBILE ACCESS ENGINE
  // -------------------------------------------------------------------------
  if (pathname === '/api/tunnel/status' && method === 'GET') {
    const { getTunnelStatus } = require('./tunnel');
    return sendJson(res, 200, { success: true, ...getTunnelStatus() });
  }

  if (pathname === '/api/tunnel/start' && method === 'POST') {
    const { startTunnel } = require('./tunnel');
    try {
      const port = process.env.PORT || 3000;
      const result = await startTunnel(port);
      return sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      return sendError(res, 500, err.message || 'تعذر تشغيل النفق السحابي');
    }
  }

  if (pathname === '/api/tunnel/stop' && method === 'POST') {
    const { stopTunnel } = require('./tunnel');
    const result = stopTunnel();
    return sendJson(res, 200, { success: true, ...result });
  }

  // Unhandled API endpoint
  return sendError(res, 404, 'المسار البرمجي غير موجود');
}

module.exports = {
  handleApi
};
