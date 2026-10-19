const jwt = require('jsonwebtoken');
const db = require('../config/db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error('JWT_SECRET kamida 16 belgi bo\'lishi kerak (.env)');
  process.exit(1);
}

function tokenYarat(admin) {
  return jwt.sign({ id: admin.id, rol: admin.rol }, SECRET, { expiresIn: process.env.JWT_EXPIRES || '12h' });
}

// Har so'rovda admin bazadan qayta o'qiladi: o'chirilgan/bloklangan admin darhol chiqib ketadi
async function authTalab(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ xato: 'Kirish talab qilinadi' });

    const { id } = jwt.verify(token, SECRET);
    const { rows } = await db.query(
      'SELECT id, login, fio, viloyat, tuman, rol, faol FROM tuman_adminlar WHERE id = $1', [id]);
    const admin = rows[0];
    if (!admin || !admin.faol) return res.status(401).json({ xato: 'Hisob faol emas' });

    req.admin = admin;
    next();
  } catch (e) {
    res.status(401).json({ xato: 'Sessiya tugagan, qayta kiring' });
  }
}

function faqatSuper(req, res, next) {
  if (req.admin?.rol !== 'superadmin') return res.status(403).json({ xato: 'Faqat bosh admin uchun' });
  next();
}

module.exports = { tokenYarat, authTalab, faqatSuper };
