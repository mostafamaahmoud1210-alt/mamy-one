const { db, getCairoNow } = require('./db');

/**
 * Log an audit trail entry
 */
async function logAudit({
  user,
  action,
  entityType,
  entityId,
  details = null,
  reason = null,
  ip = null
}) {
  try {
    const userId = user ? user.id : null;
    const userName = user ? (user.full_name || user.username) : 'النظام (System)';
    const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;

    await db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, reason, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      userName,
      action,
      entityType,
      entityId ? String(entityId) : null,
      detailsStr,
      reason,
      ip,
      getCairoNow()
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

/**
 * Action Types Dictionary for Arabic Display
 */
const AUDIT_ACTIONS = {
  // Authentication
  LOGIN: 'تسجيل دخول',
  LOGOUT: 'تسجيل خروج',
  // Students
  STUDENT_CREATE: 'إضافة طفل جديد',
  STUDENT_UPDATE: 'تعديل بيانات طفل',
  STUDENT_STATUS_CHANGE: 'تغيير حالة طفل',
  STUDENT_CLASSIFICATION_CHANGE: 'تعديل تصنيف طفل',
  STUDENT_DELETE: 'أرشفة / حذف طفل',
  // Guardians
  GUARDIAN_ADD: 'إضافة ولي أمر',
  GUARDIAN_UPDATE: 'تعديل بيانات ولي أمر',
  // Finances
  CHARGE_CREATE: 'إنشاء مطالبة / رسوم',
  PAYMENT_RECORD: 'تسجيل دفعة / سند قبض',
  PAYMENT_REFUND: 'استرداد / تسوية دفعة',
  PAYMENT_VOID: 'إلغاء دفعة',
  DISCOUNT_APPLY: 'تطبيق خصم / منحة',
  // Expenses
  EXPENSE_CREATE: 'تسجيل مصروف',
  EXPENSE_UPDATE: 'تعديل مصروف',
  EXPENSE_PAY: 'سداد مصروف',
  // Payroll
  PAYROLL_GENERATE: 'إصدار كشف رواتب الشهر',
  SALARY_PAY: 'صرف راتب موظف',
  EMPLOYEE_CREATE: 'إضافة موظف جديد',
  EMPLOYEE_UPDATE: 'تعديل بيانات موظف',
  // Attendance & Sessions
  ATTENDANCE_RECORD: 'تسجيل الحضور والغياب',
  SESSION_CREATE: 'تسجيل جلسة / درس',
  SESSION_UPDATE: 'تعديل جلسة',
  // Reports & Communications
  REPORT_CREATE: 'إعداد تقرير تقييم / تقدم',
  COMMUNICATION_SEND: 'إرسال إشعار / تذكير لولي أمر',
  DATA_EXPORT: 'تصدير بيانات أو تقارير',
  // Settings & Users
  USER_CREATE: 'إضافة مستخدم جديد',
  USER_UPDATE: 'تعديل مستخدم وصلاحيات',
  SETTINGS_UPDATE: 'تعديل إعدادات النظام'
};

module.exports = {
  logAudit,
  AUDIT_ACTIONS
};
