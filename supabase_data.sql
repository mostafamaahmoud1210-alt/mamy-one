-- =====================================================================
-- MAMY ONE - DATA MIGRATION SQL FOR SUPABASE POSTGRESQL
-- Generated from SQLite: d:\Files\projects\mamy-one\data\mamy_one.db
-- =====================================================================

BEGIN;

-- Table: settings (1 rows)
INSERT INTO settings ("id", "nursery_name", "slogan", "phone", "phone_secondary", "address", "email", "currency", "timezone", "daily_cash_opening", "receipt_footer", "reminder_time", "auto_reminders_enabled", "created_at", "updated_at") VALUES (1, 'حضانة مامي وان', 'بيئة تعليمية وتربوية متكاملة لأطفالنا', '01012345678', '01123456789', 'القاهرة - مصر', 'info@mamyone.com', 'ج.م', 'Africa/Cairo', 0, 'شكراً لاختياركم حضانة مامي وان - نعتز بثقتكم ونسعى دائماً لأفضل رعاية لأبنائكم', '09:00', 1, '2026-10-11 13:56:02', '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;

-- Table: roles (3 rows)
INSERT INTO roles ("id", "name", "display_name", "description", "permissions", "created_at") VALUES (1, 'admin', 'مدير عام / إدارة عليا', 'صلاحيات كاملة وغير محدودة للنظام والماليات والإعدادات', '["*"]', '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO roles ("id", "name", "display_name", "description", "permissions", "created_at") VALUES (2, 'accountant', 'محاسب / مسؤول مالي', 'إدارة المدفوعات والرسوم والمصروفات والرواتب والتقارير المالية', '["students_view","guardians_view_contact","finances_view","payments_record","payments_refund","expenses_manage","payroll_manage","financial_reports","export_data","notifications_view"]', '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO roles ("id", "name", "display_name", "description", "permissions", "created_at") VALUES (3, 'teacher', 'معلمة / أخصائية', 'تسجيل الحضور والجلسات والتقارير التربوية ومتابعة الأطفال', '["students_view","students_edit","attendance_record","attendance_view","sessions_manage","reports_create"]', '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('roles', 'id'), COALESCE((SELECT MAX(id) FROM roles), 1), true);

-- Table: users (1 rows)
INSERT INTO users ("id", "username", "password_hash", "salt", "full_name", "role", "permissions", "is_active", "last_login", "created_at", "updated_at") VALUES (1, 'admin', '19bbffd93c66211f15933f00a6629a0af4d719810533d11eb8ffdbc2ffefc23bdf80a6eb44e621a3616a9c8191a26a697cd993d716c9e8348e62ddd1de298faf', '84351bdefbb13a3e9b8b19d4d0c6f9fb', 'مدير النظام (Admin)', 'admin', '["*"]', 1, '2026-10-12 09:26:49', '2026-10-11 13:56:02', '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);

-- Table: classrooms (4 rows)
INSERT INTO classrooms ("id", "name", "age_group", "capacity", "lead_teacher_id", "notes", "created_at") VALUES (1, 'قاعة البراعم (Babies)', 'من 6 شهور إلى سنة ونصف', 10, NULL, NULL, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO classrooms ("id", "name", "age_group", "capacity", "lead_teacher_id", "notes", "created_at") VALUES (2, 'قاعة الفراشات (Toddlers)', 'من سنة ونصف إلى سنتين ونصف', 12, NULL, NULL, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO classrooms ("id", "name", "age_group", "capacity", "lead_teacher_id", "notes", "created_at") VALUES (3, 'قاعة النجوم (KG 1)', 'من سنتين ونصف إلى 4 سنوات', 15, NULL, NULL, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO classrooms ("id", "name", "age_group", "capacity", "lead_teacher_id", "notes", "created_at") VALUES (4, 'قاعة العباقرة (KG 2)', 'من 4 سنوات إلى 6 سنوات', 18, NULL, NULL, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('classrooms', 'id'), COALESCE((SELECT MAX(id) FROM classrooms), 1), true);

-- Table: student_code_sequence (1 rows)
INSERT INTO student_code_sequence ("id", "next_code") VALUES (1, 1001) ON CONFLICT DO NOTHING;

-- Table: students (1 rows)
INSERT INTO students ("id", "code", "full_name", "dob", "gender", "photo", "enrollment_date", "status", "classification", "classroom_id", "teacher_id", "monthly_tuition", "payment_due_day", "discount_amount", "discount_reason", "medical_notes", "notes", "created_at", "updated_at") VALUES (3, 1003, 'ليل مصطفي محمود', '2022-12-10', 'ذكر', NULL, '2026-10-11', 'active', 'regular', 1, NULL, 500, 1, 0, NULL, NULL, NULL, '2026-10-11 18:36:45', '2026-10-11 18:36:45') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('students', 'id'), COALESCE((SELECT MAX(id) FROM students), 1), true);

-- Table: guardians (1 rows)
INSERT INTO guardians ("id", "student_id", "full_name", "relationship", "is_primary", "mobile", "mobile_secondary", "email", "job", "national_id", "address", "emergency_contact", "notes", "created_at") VALUES (3, 3, 'مصطفي محمود قدري', 'أب', 1, '01100619575', '01095040009', NULL, NULL, NULL, '70 شارع مصنع الرنجة البراجيل', NULL, NULL, '2026-10-11 18:36:45') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('guardians', 'id'), COALESCE((SELECT MAX(id) FROM guardians), 1), true);

-- Table: student_charges (1 rows)
INSERT INTO student_charges ("id", "student_id", "charge_type", "description", "amount", "discount", "net_amount", "charge_date", "due_date", "billing_month", "session_id", "status", "paid_amount", "created_by_user_id", "created_at", "updated_at") VALUES (3, 3, 'tuition', 'مصروفات شهرية (2026-10)', 500, 0, 500, '2026-10-11', '2026-10-01', '2026-10', NULL, 'unpaid', 0, 1, '2026-10-11 18:36:45', '2026-10-11 18:36:45') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('student_charges', 'id'), COALESCE((SELECT MAX(id) FROM student_charges), 1), true);

-- Table: expense_categories (12 rows)
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (1, 'teacher_salary', 'رواتب معلمات', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (2, 'employee_salary', 'رواتب موظفين وإداريين', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (3, 'rent', 'إيجار المقر', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (4, 'utilities', 'كهرباء ومياه وغاز', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (5, 'maintenance', 'نظافة وصيانة وتجديدات', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (6, 'supplies', 'أدوات ومستلزمات تعليمية', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (7, 'books', 'كتب ومناهج دراسية', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (8, 'food', 'وجبات وأغذية وضيافة', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (9, 'transport', 'انتقالات وباصات', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (10, 'medical', 'مستلزمات طبية وإسعافات أولية', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (11, 'marketing', 'تسويق وإعلانات ومطبوعات', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
INSERT INTO expense_categories ("id", "code", "name", "is_custom", "created_at") VALUES (12, 'other', 'مصروفات أخرى ونثرية', 0, '2026-10-11 13:56:02') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('expense_categories', 'id'), COALESCE((SELECT MAX(id) FROM expense_categories), 1), true);

-- Table: communication_logs (1 rows)
INSERT INTO communication_logs ("id", "student_id", "recipient_name", "recipient_phone", "message_type", "channel", "message_content", "status", "sent_by_user_id", "sent_at", "created_at") VALUES (1, NULL, 'مصطفي محمود قدري', '01100619575', 'payment_reminder', 'whatsapp', 'السلام عليكم ورحمة الله وبركاته 🌸
تحية طيبة لحضرتكم من إدارة حضانة Mamy One.
نود تذكيركم بموعد سداد الرسوم المستحقة للطفل/ة (ليل مصطفي محمود) وقيمتها ١٬٥٠٠ ج.م.
شاكرين ومقدرين حسن تعاونكم وحرصكم الدائم على استمرار الرعاية المتميزة لطفلكم.
حضانة مامي وان – بيئة تعليمية وتربوية متكاملة ❤️', 'sent', 1, '2026-10-11 15:29:57', '2026-10-11 15:29:57') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('communication_logs', 'id'), COALESCE((SELECT MAX(id) FROM communication_logs), 1), true);

-- Table: notifications (3 rows)
INSERT INTO notifications ("id", "type", "title", "message", "link", "is_read", "created_at") VALUES (1, 'overdue_fee', 'رسوم دراسية متأخرة: يوسف أحمد علي', 'الطفل كود (1001) لديه متأخرات مستحقة بقيمة 1500 ج.م تجاوزت موعد الاستحقاق.', '/students/1', 0, '2026-10-11 14:07:06') ON CONFLICT DO NOTHING;
INSERT INTO notifications ("id", "type", "title", "message", "link", "is_read", "created_at") VALUES (2, 'overdue_fee', 'رسوم دراسية متأخرة: ليل مصطفي محمود', 'الطفل كود (1002) لديه متأخرات مستحقة بقيمة 1500 ج.م تجاوزت موعد الاستحقاق.', '/students/2', 0, '2026-10-11 15:29:16') ON CONFLICT DO NOTHING;
INSERT INTO notifications ("id", "type", "title", "message", "link", "is_read", "created_at") VALUES (3, 'overdue_fee', 'رسوم دراسية متأخرة: ليل مصطفي محمود', 'الطفل كود (1003) لديه متأخرات مستحقة بقيمة 500 ج.م تجاوزت موعد الاستحقاق.', '/students/3', 0, '2026-10-12 09:05:52') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('notifications', 'id'), COALESCE((SELECT MAX(id) FROM notifications), 1), true);

-- Table: audit_logs (19 rows)
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (1, 1, 'مدير النظام (Admin)', 'STUDENT_CREATE', 'student', '1', '{"code":1001,"full_name":"يوسف أحمد علي","monthly_tuition":1500}', NULL, NULL, '2026-10-11 13:56:51') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (2, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":1,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 14:07:06') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (3, 1, 'مدير النظام (Admin)', 'STUDENT_CREATE', 'student', '2', '{"code":1002,"full_name":"ليل مصطفي محمود","monthly_tuition":1500}', NULL, NULL, '2026-10-11 14:07:12') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (4, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":2,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 15:29:16') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (5, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":2,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 15:29:23') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (6, 1, 'مدير النظام (Admin)', 'COMMUNICATION_SEND', 'communication', '1', '{"recipient_phone":"01100619575","message_type":"payment_reminder","channel":"whatsapp"}', NULL, NULL, '2026-10-11 15:29:57') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (7, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":2,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 15:31:29') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (8, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":2,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 15:43:54') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (9, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":2,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 15:44:17') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (10, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-11', '{"overdueCount":2,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-11 18:24:31') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (11, 1, 'مدير النظام (Admin)', 'STUDENT_DELETE', 'student', '1', '{"code":1001,"full_name":"يوسف أحمد علي","message":"تم حذف الطفل وكافة سجلاته نهائياً من النظام"}', NULL, NULL, '2026-10-11 18:35:13') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (12, 1, 'مدير النظام (Admin)', 'STUDENT_DELETE', 'student', '2', '{"code":1002,"full_name":"ليل مصطفي محمود","message":"تم حذف الطفل وكافة سجلاته نهائياً من النظام"}', NULL, NULL, '2026-10-11 18:35:17') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (13, 1, 'مدير النظام (Admin)', 'STUDENT_CREATE', 'student', '3', '{"code":1003,"full_name":"ليل مصطفي محمود","monthly_tuition":500}', NULL, NULL, '2026-10-11 18:36:45') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (14, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-12', '{"overdueCount":1,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-12 09:05:52') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (15, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-12', '{"overdueCount":1,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-12 09:07:25') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (16, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-12', '{"overdueCount":1,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-12 09:08:59') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (17, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-12', '{"overdueCount":1,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-12 09:18:07') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (18, NULL, 'النظام (System)', 'SCHEDULED_CHECK_COMPLETED', 'system_scheduler', '2026-10-12', '{"overdueCount":1,"upcomingCount":0,"unpaidSalariesCount":0}', NULL, NULL, '2026-10-12 09:26:13') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs ("id", "user_id", "user_name", "action", "entity_type", "entity_id", "details", "reason", "ip_address", "created_at") VALUES (19, 1, 'مدير النظام (Admin)', 'LOGIN', 'user', '1', 'تسجيل دخول ناجح', NULL, NULL, '2026-10-12 09:26:49') ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('audit_logs', 'id'), COALESCE((SELECT MAX(id) FROM audit_logs), 1), true);

COMMIT;
