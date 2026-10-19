// npm run superadmin -- login parol "F.I.O"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

(async () => {
  const [login, parol, fio = 'Superadmin'] = process.argv.slice(2);
  if (!login || !parol || parol.length < 6) {
    console.log('Ishlatish: npm run superadmin -- <login> <parol (kamida 6 belgi)> "F.I.O"');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(parol, 10);
    await pool.query(
      `INSERT INTO tuman_adminlar (login, parol_hash, fio, rol)
       VALUES ($1, $2, $3, 'superadmin')
       ON CONFLICT (login) DO UPDATE SET parol_hash = EXCLUDED.parol_hash, rol = 'superadmin', faol = TRUE`,
      [login.trim(), hash, fio]
    );
    console.log(`✔ Superadmin tayyor: ${login}`);
  } catch (e) {
    console.error('✖ Xato:', e.message, '\n(Avval "npm run migrate" ni ishga tushiring)');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
