// /api/mavzuTest/fayl/:nom  — asosiy admin paneldagi "Savollar" sahifasi bilan bir xil ishlash:
//   butun faylni o'qish (GET) va saqlash (PUT). Har saqlashda qaysi savol qo'shilgan/tahrirlangan/
//   o'chirilgani aniqlanib, savol_ozgarishlar jadvaliga yoziladi.
// /api/mavzuTest/audit       — tahrirlar tarixi
// /api/mavzuTest/mavzu/...   — savollar bo'yicha (eski) API
const express = require('express');
const db = require('../config/db');
const gh = require('../config/github');
const { authTalab } = require('../middleware/auth');
const { toplamRouter } = require('../services/savolToplam');

const router = express.Router();
router.use(authTalab);

// Faqat mavzu va attestatsiya fayllari (boshqa fayllarga yozib bo'lmaydi)
const RUXSAT = /^((topics|Ates_topics)\.json|(questions_topic|Attes_tests)\d{1,4}\.json)$/;
const qMatn = (q) => String(q?.question ?? q?.text ?? '');

function nomTekshir(req, res) {
  const nom = req.params.nom;
  if (!RUXSAT.test(nom)) { res.status(400).json({ xato: 'Bu faylni tahrirlab bo\'lmaydi' }); return null; }
  return nom;
}

router.get('/fayl/:nom', async (req, res, next) => {
  try {
    const nom = nomTekshir(req, res); if (!nom) return;
    const f = await gh.oqi(nom);
    if (!f) return res.status(404).json({ xato: `GitHub'da ${nom} topilmadi` });
    res.json({ sha: f.sha, content: f.content });
  } catch (e) { next(e); }
});

router.put('/fayl/:nom', async (req, res, next) => {
  try {
    const nom = nomTekshir(req, res); if (!nom) return;
    const { content, sha } = req.body;
    const indeks = /topics\.json$/.test(nom);
    if (!content || typeof content !== 'object' ||
        (indeks ? !Array.isArray(content.topics) : !Array.isArray(content.questions))) {
      return res.status(400).json({ xato: 'Fayl tuzilishi noto\'g\'ri' });
    }

    // O'zgarishlarni aniqlash uchun eski holat (fayl bo'lmasa — bo'sh)
    const eski = indeks ? null : await gh.oqi(nom).catch(() => null);
    const xabar = `[${req.admin.login}${req.admin.tuman ? ', ' + req.admin.tuman : ''}] ${String(req.body.message || nom).slice(0, 150)}`;
    const yangiSha = await gh.yoz(nom, content, sha || undefined, xabar);

    if (!indeks) {
      const oldMap = new Map((eski?.content?.questions || []).map(q => [String(q.id), q]));
      const newMap = new Map(content.questions.map(q => [String(q.id), q]));
      const yozuvlar = [];
      for (const [id, q] of newMap) {
        const o = oldMap.get(id);
        if (!o) yozuvlar.push(['qoshish', { id, question: qMatn(q) }]);
        else if (JSON.stringify(o) !== JSON.stringify(q)) yozuvlar.push(['tahrir', { id, question: qMatn(q), eski: o }]);
      }
      for (const [id, o] of oldMap) if (!newMap.has(id)) yozuvlar.push(['ochirish', { id, question: qMatn(o) }]);
      for (const [amal, t] of yozuvlar.slice(0, 500)) {
        await db.query('INSERT INTO savol_ozgarishlar (admin_id, manba, fayl, amal, tafsilot) VALUES ($1,$2,$3,$4,$5)',
          [req.admin.id, 'mavzu', nom, amal, JSON.stringify({ ...t, mavzu: content.title || null })]);
      }
    }
    res.json({ ok: true, sha: yangiSha });
  } catch (e) { next(e); }
});

// GET /api/mavzuTest/audit?limit=300 — asosiy paneldagi tarix formatida
router.get('/audit', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 1000);
    const { rows } = await db.query(`
      SELECT j.created_at, j.fayl AS file, j.amal, j.tafsilot, a.fio, a.login, a.tuman
      FROM savol_ozgarishlar j LEFT JOIN tuman_adminlar a ON a.id = j.admin_id
      WHERE j.manba = 'mavzu' ORDER BY j.created_at DESC LIMIT $1`, [limit]);
    const AMAL = { qoshish: 'add', tahrir: 'edit', ochirish: 'delete' };
    res.json(rows.map(r => ({
      created_at: r.created_at,
      action: AMAL[r.amal] || r.amal,
      admin_name: r.fio ? `${r.fio}${r.tuman ? ' (' + r.tuman + ')' : ''}` : null,
      admin_username: r.login,
      question_text: r.tafsilot?.question || (r.tafsilot?.savollar ? `${r.tafsilot.savollar.length} ta savol` : ''),
      question_id: r.tafsilot?.id || r.tafsilot?.yangi?.id || null,
      topic_title: r.tafsilot?.mavzu || null,
      file: r.file,
    })));
  } catch (e) { next(e); }
});

router.use(toplamRouter({
  mavzu: { nom: 'Mavzulashtirilgan testlar', indeks: 'topics.json', fayl: id => `questions_topic${id}.json` },
}));

module.exports = router;
