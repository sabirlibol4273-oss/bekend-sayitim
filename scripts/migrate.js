// npm run migrate — yangi jadvallarni yaratadi va mavjud jadvallarni tekshiradi
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'migrations.sql'), 'utf8');
    await pool.query(sql);
    console.log('✔ Migratsiya bajarildi');

    // Railway: SUPERADMIN_LOGIN va SUPERADMIN_PAROL berilgan bo'lsa, superadmin avtomatik yaratiladi
    const L = (process.env.SUPERADMIN_LOGIN || '').trim(), P = process.env.SUPERADMIN_PAROL || '';
    if (L && P.length >= 6) {
      const bor = await pool.query('SELECT id FROM tuman_adminlar WHERE login = $1', [L]);
      if (!bor.rowCount) {
        await pool.query(`INSERT INTO tuman_adminlar (login, parol_hash, fio, rol) VALUES ($1,$2,$3,'superadmin')`,
          [L, await bcrypt.hash(P, 10), process.env.SUPERADMIN_FIO || 'Superadmin']);
        console.log(`✔ Superadmin yaratildi: ${L}`);
      }
    }

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
