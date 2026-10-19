const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authTalab, faqatSuper } = require('../middleware/auth');
const { sqlNorm, oqituvchiSharti } = require('../middleware/tumanScope');

router.use(authTalab, faqatSuper);

const USTUNLAR = 'id, login, fio, viloyat, tuman, rol, faol, oxirgi_kirish, created_at';

// GET /api/superadmin/adminlar
router.get('/adminlar', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT ${USTUNLAR} FROM tuman_adminlar ORDER BY rol DESC, viloyat, tuman, id`);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/superadmin/tumanlar — bazadagi viloyat/tumanlar va o'qituvchi soni (tanlash uchun)
router.get('/tumanlar', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT MIN(region) AS viloyat, MIN(district) AS tuman,
             COUNT(*)::int AS jami,
             COUNT(*) FILTER (WHERE ${oqituvchiSharti('users')})::int AS oqituvchi
      FROM users
      WHERE COALESCE(district,'') <> ''
      GROUP BY ${sqlNorm('district')}
      ORDER BY 1, 2`);
    res.json(rows);
  } catch (e) { next(e); }
});

function tekshir(b, yangi) {
  if (yangi) {
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(b.login || '')) return 'Login 3-32 belgi: harf, raqam, _ . -';
    if (!b.parol || String(b.parol).length < 6) return 'Parol kamida 6 belgi';
  } else if (b.parol && String(b.parol).length < 6) return 'Parol kamida 6 belgi';
  if (!String(b.viloyat || '').trim() || !String(b.tuman || '').trim()) return 'Viloyat va tumanni kiriting';
  return null;
}

// POST /api/superadmin/adminlar  { login, parol, fio, viloyat, tuman }
router.post('/adminlar', async (req, res, next) => {
  try {
    const b = req.body;
    const xato = tekshir(b, true);
    if (xato) return res.status(400).json({ xato });
    const { rows } = await db.query(
      `INSERT INTO tuman_adminlar (login, parol_hash, fio, viloyat, tuman)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${USTUNLAR}`,
      [b.login.trim(), await bcrypt.hash(String(b.parol), 10), (b.fio || '').trim(), b.viloyat.trim(), b.tuman.trim()]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ xato: 'Bu login band' });
    next(e);
  }
});

// PUT /api/superadmin/adminlar/:id  { fio, viloyat, tuman, faol, parol? }
router.put('/adminlar/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = req.body;
    const { rows: [eski] } = await db.query('SELECT * FROM tuman_adminlar WHERE id = $1', [id]);
    if (!eski) return res.status(404).json({ xato: 'Admin topilmadi' });
    if (eski.rol === 'superadmin') return res.status(400).json({ xato: 'Bosh adminni bu yerda o\'zgartirib bo\'lmaydi' });
    const xato = tekshir(b, false);
    if (xato) return res.status(400).json({ xato });

    const hash = b.parol ? await bcrypt.hash(String(b.parol), 10) : eski.parol_hash;
    const { rows } = await db.query(
      `UPDATE tuman_adminlar SET fio=$1, viloyat=$2, tuman=$3, faol=$4, parol_hash=$5
       WHERE id=$6 RETURNING ${USTUNLAR}`,
      [(b.fio || '').trim(), b.viloyat.trim(), b.tuman.trim(), b.faol !== false, hash, id]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/superadmin/adminlar/:id
router.delete('/adminlar/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.admin.id) return res.status(400).json({ xato: 'O\'zingizni o\'chira olmaysiz' });
    const r = await db.query(`DELETE FROM tuman_adminlar WHERE id = $1 AND rol <> 'superadmin'`, [id]);
    if (!r.rowCount) return res.status(404).json({ xato: 'Admin topilmadi' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
