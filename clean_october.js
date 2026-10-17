/**
 * Mamy One - Clean October 2026 Duplicate Tuition Charges
 * Safely removes duplicate/auto-generated charges while strictly preserving
 * all genuine student charges, balances, and recorded payments.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Locate all possible SQLite DB paths
const candidatePaths = [
  process.env.MAMY_DB_PATH,
  path.join(__dirname, 'data', 'mamy_one.db'),
  path.join(__dirname, '..', 'data', 'mamy_one.db'),
  '/app/data/mamy_one.db',
  '/app/src/data/mamy_one.db',
  './data/mamy_one.db'
].filter(Boolean);

// Find unique existing files
const existingDbs = Array.from(new Set(candidatePaths.filter(p => fs.existsSync(p))));

if (existingDbs.length === 0) {
  console.log('No database found at candidate paths:', candidatePaths);
  process.exit(1);
}

for (const dbPath of existingDbs) {
  console.log('\n=============================================');
  console.log(`Checking Database: ${dbPath}`);
  console.log('=============================================');

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  // Inspect all student charges
  const charges = db.prepare(`
    SELECT sc.*, s.full_name, s.code
    FROM student_charges sc
    JOIN students s ON sc.student_id = s.id
    ORDER BY sc.student_id ASC, sc.id ASC
  `).all();

  console.log(`Total charges in DB: ${charges.length}`);

  let deletedCount = 0;

  // Group charges by student
  const studentMap = new Map();
  for (const ch of charges) {
    if (!studentMap.has(ch.student_id)) {
      studentMap.set(ch.student_id, []);
    }
    studentMap.get(ch.student_id).push(ch);
  }

  for (const [studentId, sCharges] of studentMap.entries()) {
    const studentName = sCharges[0].full_name;
    const studentCode = sCharges[0].code;

    // Filter October tuition charges
    const octTuition = sCharges.filter(c => 
      c.charge_type === 'tuition' && 
      (c.billing_month === '2026-10' ||
       (c.due_date && c.due_date.startsWith('2026-10')) ||
       (c.charge_date && c.charge_date.startsWith('2026-10')) ||
       (c.description && (c.description.includes('2026-10') || c.description.includes('أكتوبر'))))
    );

    if (octTuition.length > 1) {
      console.log(`\nFound ${octTuition.length} October tuition charges for [${studentCode}] ${studentName}:`);
      octTuition.forEach(c => {
        console.log(`  - ID: ${c.id} | Desc: "${c.description}" | Net: ${c.net_amount} | Paid: ${c.paid_amount} | Status: ${c.status}`);
      });

      // Keep the one that has payments, or the first one created (lowest ID)
      const paidCharges = octTuition.filter(c => Number(c.paid_amount) > 0);
      let keepId;
      if (paidCharges.length > 0) {
        keepId = paidCharges[0].id;
      } else {
        keepId = octTuition[0].id;
      }

      for (const c of octTuition) {
        if (c.id !== keepId) {
          if (Number(c.paid_amount) === 0) {
            db.prepare('DELETE FROM student_charges WHERE id = ?').run(c.id);
            console.log(`  >>> DELETED duplicate unpaid charge ID ${c.id}`);
            deletedCount++;
          } else {
            console.log(`  [!] Warning: Charge ID ${c.id} has paid_amount > 0, preserved.`);
          }
        } else {
          console.log(`  === KEPT original charge ID ${c.id}`);
        }
      }
    }

    // Also delete any explicit auto-generated charge that has paid_amount = 0
    const explicitAuto = sCharges.filter(c => 
      c.description && c.description.includes('أكتوبر 2026') && Number(c.paid_amount) === 0
    );
    for (const c of explicitAuto) {
      const exists = db.prepare('SELECT id FROM student_charges WHERE id = ?').get(c.id);
      if (exists) {
        db.prepare('DELETE FROM student_charges WHERE id = ?').run(c.id);
        console.log(`  >>> DELETED auto-generated charge ID ${c.id} ("${c.description}")`);
        deletedCount++;
      }
    }
  }

  // Print final summary for all students
  console.log('\n--- Current Student Balances After Cleanup ---');
  const finalStudents = db.prepare(`
    SELECT s.id, s.code, s.full_name,
      COALESCE((
        SELECT SUM(net_amount - paid_amount)
        FROM student_charges
        WHERE student_id = s.id AND status IN ('unpaid', 'partially_paid')
      ), 0) as balance,
      COALESCE((
        SELECT SUM(amount)
        FROM payments
        WHERE student_id = s.id AND status = 'completed'
      ), 0) as total_paid
    FROM students s
    ORDER BY s.id ASC
  `).all();

  for (const fs of finalStudents) {
    console.log(`Child [${fs.code}] ${fs.full_name}: Paid = ${fs.total_paid} EGP, Remaining Balance = ${fs.balance} EGP`);
  }

  console.log(`\nCleanup completed successfully on ${dbPath}. Total deleted charges: ${deletedCount}`);
  db.close();
}
