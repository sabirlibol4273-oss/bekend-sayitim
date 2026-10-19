// Tuman rahbari o'z o'qituvchilariga onlayn test beradi.
// Sayitimm'dagi mavjud online_tests / online_questions / online_results jadvallari ishlatiladi,
// shuning uchun ilova testni mavjud "Online test" ekranida ko'radi.
const router = require('express').Router();
const db = require('../config/db');
const { authTalab } = require('../middleware/auth');
const { tumanScope, hududSharti, sqlNorm, normalla } = require('../middleware/tumanScope');

router.use(authTalab, tumanScope);

const TUGASH = `(t.start_time + (t.duration_minutes::text || ' minutes')::interval)`;

// Test shu adminning hududigami? (superadmin hammasini boshqaradi)
function testSharti(req, params) {
  if (req.admin.rol === 'superadmin' && !req.hudud.tumanNorm) return 'TRUE';
  params.push(req.hudud.tumanNorm);
  return `${sqlNorm('t.district')} = $${params.length}`;
}

// GET /api/onlineTest — hudud testlari ro'yxati
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const shart = testSharti(req, params);
    const { rows } = await db.query(`
      SELECT t.id, t.title, t.fan, t.district, t.start_time, t.duration_minutes, t.is_active, ${TUGASH} AS end_time,
             CASE WHEN NOW() < t.start_time THEN 'kutilmoqda' WHEN NOW() < ${TUGASH} THEN 'faol' ELSE 'tugagan' END AS holat,
             (SELECT COUNT(*) FROM online_questions q WHERE q.test_id = t.id)::int AS savollar,
             (SELECT COUNT(*) FROM online_results r WHERE r.test_id = t.id)::int AS ishtirokchi,
             (SELECT ROUND(AVG(score)::numeric, 1) FROM online_results r WHERE r.test_id = t.id) AS ortacha
      FROM online_tests t WHERE ${shart} AND t.district IS NOT NULL
      ORDER BY t.start_time DESC LIMIT 200`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/onlineTest  { title, start_time (ISO), duration, fan?, questions:[{text, options[], correct, image?}] }
router.post('/', async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { title, start_time, duration, fan, questions } = req.body;
    const tuman = req.hudud.tuman;
    if (!tuman) return res.status(400).json({ xato: 'Avval tumanni tanlang' });
    if (!String(title || '').trim()) return res.status(400).json({ xato: 'Test nomini kiriting' });
    const boshlanish = new Date(start_time);
    if (isNaN(boshlanish)) return res.status(400).json({ xato: 'Boshlanish vaqti noto\'g\'ri' });
    const daqiqa = parseInt(duration, 10);
    if (!(daqiqa >= 5 && daqiqa <= 600)) return res.status(400).json({ xato: 'Davomiylik 5–600 daqiqa' });
    if (!Array.isArray(questions) || !questions.length) return res.status(400).json({ xato: 'Kamida bitta savol kerak' });
    for (const [i, q] of questions.entries()) {
      const opts = Array.isArray(q.options) ? q.options.map(o => String(o).trim()) : [];
      if (!String(q.text || '').trim() || opts.length < 2 || opts.some(o => !o) ||
          !(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < opts.length)) {
        return res.status(400).json({ xato: `${i + 1}-savol to'liq emas (matn, kamida 2 javob, to'g'ri javob)` });
      }
    }

    await client.query('BEGIN');
    const { rows: [t] } = await client.query(
      `INSERT INTO online_tests (title, start_time, duration_minutes, is_active, region, district, fan, tuman_admin_id)
       VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7) RETURNING id`,
      [title.trim(), boshlanish, daqiqa, req.hudud.viloyat, tuman, (fan || '').trim() || null, req.admin.id]);
    for (const q of questions) {
      await client.query(
        'INSERT INTO online_questions (test_id, question_text, options, correct_index, image_url) VALUES ($1,$2,$3,$4,$5)',
        [t.id, q.text.trim(), JSON.stringify(q.options.map(o => String(o).trim())), q.correct, q.image || null]);
    }
    // Faqat shu tuman foydalanuvchilariga bildirishnoma
    const np = [];
    const ushart = hududSharti({ tumanNorm: req.hudud.tumanNorm, fan: (fan || '').trim() || null }, np);
    np.push('Yangi tuman testi ⚡', `"${title.trim()}" testi ${boshlanish.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })} da boshlanadi.`);
    const nr = await client.query(
      `INSERT INTO notifications (title, message, body, recipient_count, user_id)
       SELECT $${np.length - 1}, $${np.length}, $${np.length}, 1, u.id FROM users u WHERE ${ushart}`, np);
    await client.query('COMMIT');
    res.status(201).json({ id: t.id, xabar_yuborildi: nr.rowCount });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { client.release(); }
});

async function testniOl(req, res) {
  const params = [];
  const shart = testSharti(req, params);
  params.push(parseInt(req.params.id, 10) || 0);
  const { rows: [t] } = await db.query(
    `SELECT t.*, ${TUGASH} AS end_time FROM online_tests t WHERE ${shart} AND t.id = $${params.length}`, params);
  if (!t) res.status(404).json({ xato: 'Test topilmadi yoki boshqa tumanga tegishli' });
  return t;
}

// GET /api/onlineTest/:id — savollar, natijalar va yechmaganlar
router.get('/:id', async (req, res, next) => {
  try {
    const t = await testniOl(req, res);
    if (!t) return;
    const up = [];
    const ushart = hududSharti({ tumanNorm: normalla(t.district), fan: t.fan }, up);
    up.push(t.id);
    const [savollar, natijalar, yechmagan] = await Promise.all([
      db.query('SELECT id, question_text, options, correct_index, image_url FROM online_questions WHERE test_id = $1 ORDER BY id', [t.id]),
      db.query(`SELECT r.user_id, r.correct, r.total, r.score, r.submitted_at, u.name, u.school, u.phone
                FROM online_results r JOIN users u ON u.id = r.user_id
                WHERE r.test_id = $1 ORDER BY r.score DESC, r.submitted_at`, [t.id]),
      t.district ? db.query(`SELECT u.id, u.name, u.school, u.phone, u.last_seen FROM users u
                WHERE ${ushart} AND NOT EXISTS (SELECT 1 FROM online_results r WHERE r.test_id = $${up.length} AND r.user_id = u.id)
                ORDER BY u.school, u.name`, up) : { rows: [] },
    ]);
    res.json({ test: t, savollar: savollar.rows, natijalar: natijalar.rows, yechmaganlar: yechmagan.rows });
  } catch (e) { next(e); }
});

// DELETE /api/onlineTest/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const t = await testniOl(req, res);
    if (!t) return;
    await db.query('DELETE FROM online_tests WHERE id = $1', [t.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/onlineTest/:id/qayta  { userId | 'all' } — qayta topshirishga ruxsat
router.post('/:id/qayta', async (req, res, next) => {
  try {
    const t = await testniOl(req, res);
    if (!t) return;
    const { userId } = req.body;
    if (userId === 'all') await db.query('DELETE FROM online_results WHERE test_id = $1', [t.id]);
    else await db.query('DELETE FROM online_results WHERE test_id = $1 AND user_id = $2', [t.id, String(userId)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
