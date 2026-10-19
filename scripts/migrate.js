// npm run migrate — yangi jadvallarni yaratadi va mavjud jadvallarni tekshiradi
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'migrations.sql'), 'utf8');
    await pool.query(sql);
    console.log('✔ Migratsiya bajarildi');

    // Tumanlar qanday yozilganini ko'rish (bir xil nomlash muhim)
    const { rows } = await pool.query(`
      SELECT region, district, COUNT(*)::int soni FROM users
      GROUP BY region, district ORDER BY region, district`);
    console.log('\nFoydalanuvchilar viloyat/tuman bo\'yicha:');
    for (const r of rows) console.log(`  ${r.region || '—'} / ${r.district || '—'}: ${r.soni}`);
  } catch (e) {
    console.error('✖ Xato:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
