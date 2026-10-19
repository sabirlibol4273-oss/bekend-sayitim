const router = require('express').Router();
const db = require('../config/db');
const { authTalab } = require('../middleware/auth');
const { tumanScope, hududSharti } = require('../middleware/tumanScope');

router.use(authTalab, tumanScope);

// Bazadagi vaqt UTC'da saqlanadi — kunlarni Toshkent vaqti bo'yicha guruhlaymiz
const KUN = `(r.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tashkent')::date`;

function kunlar(q, def = 30) {
  const n = parseInt(q, 10);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : def;
}

// GET /api/statistika/umumiy?kun=30
router.get('/umumiy', async (req, res, next) => {
  try {
    const kun = kunlar(req.query.kun);
    const params = [];
    const shart = hududSharti(req.hudud, params);
    const { rows: [s] } = await db.query(`
      WITH u AS (SELECT * FROM users u WHERE ${shart}),
           r AS (SELECT r.* FROM test_results r JOIN u ON u.id = r.user_id
                 WHERE r.created_at > NOW() - INTERVAL '${kun} days')
      SELECT
        (SELECT COUNT(*) FROM u)::int AS jami,
        (SELECT COUNT(*) FROM u WHERE last_seen > NOW() - INTERVAL '5 minutes')::int AS online,
        (SELECT COUNT(*) FROM u WHERE last_seen > NOW() - INTERVAL '1 day')::int AS bugun_kirgan,
        (SELECT COUNT(DISTINCT user_id) FROM r)::int AS faol,
        (SELECT COUNT(*) FROM r)::int AS testlar,
        (SELECT ROUND(AVG(score)::numeric, 1) FROM r) AS ortacha,
        (SELECT ROUND(AVG(score)::numeric, 1) FROM test_results r JOIN u ON u.id = r.user_id) AS ortacha_umumiy`,
      params);
    res.json({ ...s, kun, hudud: req.hudud.tuman || 'Barcha hududlar' });
  } catch (e) { next(e); }
});

// GET /api/statistika/kunlik?kun=30 — grafik uchun
router.get('/kunlik', async (req, res, next) => {
  try {
    const kun = kunlar(req.query.kun);
    const params = [];
    const shart = hududSharti(req.hudud, params);
    const { rows } = await db.query(`
      SELECT to_char(${KUN}, 'YYYY-MM-DD') AS sana, COUNT(*)::int AS testlar,
             COUNT(DISTINCT r.user_id)::int AS faol, ROUND(AVG(r.score)::numeric, 1) AS ortacha
      FROM test_results r JOIN users u ON u.id = r.user_id
      WHERE ${shart} AND r.created_at > NOW() - INTERVAL '${kun} days'
      GROUP BY 1 ORDER BY 1`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/statistika/mavzular?kun=30 — qaysi mavzu qanchalik yechilgan
router.get('/mavzular', async (req, res, next) => {
  try {
    const kun = kunlar(req.query.kun);
    const params = [];
    const shart = hududSharti(req.hudud, params);
    const { rows } = await db.query(`
      SELECT COALESCE(MAX(r.topic_name), 'Mavzu ' || r.topic_id) AS mavzu,
             COUNT(*)::int AS urinish, COUNT(DISTINCT r.user_id)::int AS oqituvchi,
             ROUND(AVG(r.score)::numeric, 1) AS ortacha
      FROM test_results r JOIN users u ON u.id = r.user_id
      WHERE ${shart} AND r.created_at > NOW() - INTERVAL '${kun} days'
      GROUP BY r.topic_id ORDER BY urinish DESC LIMIT 50`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/statistika/maktablar?kun=30 — maktablar kesimida
router.get('/maktablar', async (req, res, next) => {
  try {
    const kun = kunlar(req.query.kun);
    const params = [];
    const shart = hududSharti(req.hudud, params);
    const { rows } = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(u.school), ''), 'Ko''rsatilmagan') AS maktab,
             COUNT(DISTINCT u.id)::int AS jami,
             COUNT(DISTINCT r.user_id)::int AS faol,
             COUNT(r.id)::int AS testlar,
             ROUND(AVG(r.score)::numeric, 1) AS ortacha
      FROM users u
      LEFT JOIN test_results r ON r.user_id = u.id AND r.created_at > NOW() - INTERVAL '${kun} days'
      WHERE ${shart}
      GROUP BY 1 ORDER BY ortacha DESC NULLS LAST, jami DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
