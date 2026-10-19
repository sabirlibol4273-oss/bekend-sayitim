const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { tokenYarat, authTalab } = require('../middleware/auth');

// Oddiy himoya: bir IP'dan 15 daqiqada 10 ta noto'g'ri urinish
const urinishlar = new Map();
function bloklanganmi(ip) {
  const u = urinishlar.get(ip);
  if (!u) return false;
  if (Date.now() - u.vaqt > 15 * 60 * 1000) { urinishlar.delete(ip); return false; }
  return u.soni >= 10;
}
function xatoQosh(ip) {
  const u = urinishlar.get(ip) || { soni: 0, vaqt: Date.now() };
  u.soni++; urinishlar.set(ip, u);
}

// POST /api/auth/login  { login, parol }
router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip;
    if (bloklanganmi(ip)) return res.status(429).json({ xato: 'Juda ko\'p urinish. 15 daqiqadan so\'ng qayta urining' });

    const login = String(req.body.login || '').trim();
    const parol = String(req.body.parol || '');
    if (!login || !parol) return res.status(400).json({ xato: 'Login va parolni kiriting' });

    const { rows } = await db.query('SELECT * FROM tuman_adminlar WHERE login = $1', [login]);
    const admin = rows[0];
    if (!admin || !(await bcrypt.compare(parol, admin.parol_hash))) {
      xatoQosh(ip);
      return res.status(401).json({ xato: 'Login yoki parol noto\'g\'ri' });
    }
    if (!admin.faol) return res.status(403).json({ xato: 'Hisobingiz bloklangan. Bosh adminga murojaat qiling' });

    urinishlar.delete(ip);
    await db.query('UPDATE tuman_adminlar SET oxirgi_kirish = NOW() WHERE id = $1', [admin.id]);

    res.json({
      token: tokenYarat(admin),
      admin: { id: admin.id, login: admin.login, fio: admin.fio, viloyat: admin.viloyat, tuman: admin.tuman, rol: admin.rol },
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', authTalab, (req, res) => {
  const { faol, ...admin } = req.admin;
  res.json({ admin });
});

// POST /api/auth/parol  { eski, yangi }
router.post('/parol', authTalab, async (req, res, next) => {
  try {
    const { eski, yangi } = req.body;
    if (!yangi || String(yangi).length < 6) return res.status(400).json({ xato: 'Yangi parol kamida 6 belgi' });
    const { rows } = await db.query('SELECT parol_hash FROM tuman_adminlar WHERE id = $1', [req.admin.id]);
    if (!(await bcrypt.compare(String(eski || ''), rows[0].parol_hash))) {
      return res.status(400).json({ xato: 'Joriy parol noto\'g\'ri' });
    }
    await db.query('UPDATE tuman_adminlar SET parol_hash = $1 WHERE id = $2', [await bcrypt.hash(String(yangi), 10), req.admin.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
