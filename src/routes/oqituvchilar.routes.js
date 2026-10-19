const router = require('express').Router();
const db = require('../config/db');
const { authTalab } = require('../middleware/auth');
const { tumanScope, hududSharti } = require('../middleware/tumanScope');

router.use(authTalab, tumanScope);

const ONLINE_DAQIQA = 5; // so'nggi 5 daqiqada faol bo'lsa — online

// GET /api/oqituvchilar?fan=&faqat_oqituvchi=1
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const shart = hududSharti(req.hudud, params);
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.phone, u.school, u.region, u.district, u.fan, u.grade,
             u.avatar_url, u.last_seen, u.created_at,
             (u.last_seen > NOW() - INTERVAL '${ONLINE_DAQIQA} minutes') AS online,
             COALESCE(t.soni, 0)::int AS testlar_soni,
             t.ortacha, t.oxirgi_vaqt, t.oxirgi_mavzu, t.oxirgi_foiz
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS soni,
               ROUND(AVG(score)::numeric, 1) AS ortacha,
               MAX(created_at) AS oxirgi_vaqt,
               (ARRAY_AGG(COALESCE(topic_name, 'Mavzu ' || topic_id) ORDER BY created_at DESC))[1] AS oxirgi_mavzu,
               (ARRAY_AGG(score ORDER BY created_at DESC))[1] AS oxirgi_foiz
        FROM test_results WHERE user_id = u.id
      ) t ON TRUE
      WHERE ${shart}
      ORDER BY online DESC, t.oxirgi_vaqt DESC NULLS LAST, u.name`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/oqituvchilar/fanlar — filtr uchun fanlar ro'yxati
router.get('/fanlar', async (req, res, next) => {
  try {
    const params = [];
    const shart = hududSharti({ tumanNorm: req.hudud.tumanNorm }, params);
    const { rows } = await db.query(`
      SELECT TRIM(u.fan) AS fan, COUNT(*)::int AS soni FROM users u
      WHERE ${shart} AND COALESCE(u.fan,'') <> ''
      GROUP BY TRIM(u.fan) ORDER BY 2 DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/oqituvchilar/:id/natijalar — bitta o'qituvchining barcha testlari
router.get('/:id/natijalar', async (req, res, next) => {
  try {
    const params = [];
    const shart = hududSharti({ tumanNorm: req.hudud.tumanNorm }, params);
    params.push(String(req.params.id));
    const { rows: [user] } = await db.query(
      `SELECT u.id, u.name, u.phone, u.school, u.region, u.district, u.fan, u.last_seen, u.created_at
       FROM users u WHERE ${shart} AND u.id = $${params.length}`, params);
    if (!user) return res.status(404).json({ xato: 'O\'qituvchi topilmadi yoki boshqa tumanda' });

    const [mavzu, online] = await Promise.all([
      db.query(`SELECT id, topic_id, COALESCE(topic_name, 'Mavzu ' || topic_id) AS nomi,
                       correct, total, score, created_at
                FROM test_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [user.id]),
      db.query(`SELECT r.id, r.test_id, t.title AS nomi, r.correct, r.total, r.score, r.submitted_at AS created_at
                FROM online_results r JOIN online_tests t ON t.id = r.test_id
                WHERE r.user_id = $1 ORDER BY r.submitted_at DESC LIMIT 200`, [user.id]),
    ]);
    res.json({ user, mavzu: mavzu.rows, online: online.rows });
  } catch (e) { next(e); }
});

// PUT /api/oqituvchilar/:id/fan  { fan } — tuman rahbari o'qituvchining fanini belgilaydi
router.put('/:id/fan', async (req, res, next) => {
  try {
    const fan = String(req.body.fan || '').trim().slice(0, 50) || null;
    const params = [];
    const shart = hududSharti({ tumanNorm: req.hudud.tumanNorm }, params);
    params.push(fan, String(req.params.id));
    const r = await db.query(`UPDATE users u SET fan = $${params.length - 1}
      WHERE ${shart} AND u.id = $${params.length} RETURNING u.id, u.fan`, params);
    if (!r.rowCount) return res.status(404).json({ xato: 'O\'qituvchi topilmadi yoki boshqa tumanda' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
