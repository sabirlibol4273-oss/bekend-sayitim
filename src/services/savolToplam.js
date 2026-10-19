// Umumiy savollar to'plami routeri: mavzu testlari, attestatsiya, pedagogika.
// Har to'plam = indeks fayli ({topics:[{id,title,description,unlocked}]}) + har mavzuga bitta fayl
// ({topicId,title,description,questions:[{id,question,options,correctIndex}]}).
const express = require('express');
const db = require('../config/db');
const gh = require('../config/github');
const { authTalab } = require('../middleware/auth');

function savolTekshir(b) {
  const question = String(b.question || '').trim();
  const options = Array.isArray(b.options) ? b.options.map(o => String(o).trim()) : [];
  const correctIndex = Number(b.correctIndex);
  if (!question) return { xato: 'Savol matni bo\'sh' };
  if (options.length < 2 || options.length > 6 || options.some(o => !o)) return { xato: '2–6 ta to\'liq javob varianti kerak' };
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return { xato: 'To\'g\'ri javob tanlanmagan' };
  return { savol: { question, options, correctIndex } };
}

async function jurnal(adminId, manba, fayl, amal, tafsilot) {
  await db.query('INSERT INTO savol_ozgarishlar (admin_id, manba, fayl, amal, tafsilot) VALUES ($1,$2,$3,$4,$5)',
    [adminId, manba, fayl, amal, JSON.stringify(tafsilot)]).catch(e => console.error('Jurnal xatosi:', e.message));
}

// toplamlar: { kalit: { nom, indeks: 'topics.json', fayl: id => `questions_topic${id}.json` } }
function toplamRouter(toplamlar) {
  const router = express.Router();
  router.use(authTalab);

  router.param('toplam', (req, res, next, k) => {
    req.toplam = toplamlar[k];
    if (!req.toplam) return res.status(404).json({ xato: 'Bunday to\'plam yo\'q' });
    req.toplamKalit = k;
    next();
  });
  const mavzuId = (req) => { const id = parseInt(req.params.id, 10); if (!(id > 0)) throw Object.assign(new Error('Mavzu raqami noto\'g\'ri'), { status: 400 }); return id; };
  // Indeksda bor, lekin fayli hali yo'q mavzu uchun bo'sh shablon
  async function boshFayl(req, id) {
    const ind = await gh.oqi(req.toplam.indeks);
    const m = ind?.content?.topics?.find(t => Number(t.id) === id);
    if (!m) throw Object.assign(new Error('Bunday mavzu yo\'q'), { status: 404 });
    return { topicId: id, title: m.title, description: m.description || '', questions: [] };
  }
  const izoh = (req, matn) => `[${req.admin.login}] ${matn}`;

  // GET /:toplam — mavzular ro'yxati
  router.get('/:toplam', async (req, res, next) => {
    try {
      const f = await gh.oqi(req.toplam.indeks);
      res.json({ nom: req.toplam.nom, mavzular: f?.content?.topics || [] });
    } catch (e) { next(e); }
  });

  // POST /:toplam — yangi mavzu { title, description }
  router.post('/:toplam', async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      if (!title) return res.status(400).json({ xato: 'Mavzu nomini kiriting' });
      const description = String(req.body.description || '').trim();
      const mavzu = await gh.ozgartir(req.toplam.indeks, (c) => {
        const content = c || { topics: [] };
        const id = Math.max(0, ...content.topics.map(t => t.id)) + 1;
        const yangi = { id, title, description, unlocked: true };
        content.topics.push(yangi);
        return { content, natija: yangi };
      }, izoh(req, `Yangi mavzu: ${title}`));
      const fayl = req.toplam.fayl(mavzu.id);
      if (!(await gh.oqi(fayl))) {
        await gh.yoz(fayl, { topicId: mavzu.id, title, description, questions: [] }, null, izoh(req, `${fayl} yaratildi`));
      }
      await jurnal(req.admin.id, req.toplamKalit, fayl, 'mavzu_qoshish', mavzu);
      res.status(201).json(mavzu);
    } catch (e) { next(e); }
  });

  // GET /:toplam/:id — mavzu savollari
  router.get('/:toplam/:id', async (req, res, next) => {
    try {
      const id = mavzuId(req);
      const fayl = req.toplam.fayl(id);
      const f = await gh.oqi(fayl);
      const content = f ? f.content : await boshFayl(req, id); // fayl yo'q bo'lsa — bo'sh, birinchi savolda yaratiladi
      res.json({ fayl, ...content, questions: content.questions || [] });
    } catch (e) { next(e); }
  });

  // POST /:toplam/:id/savollar — savol qo'shish (bitta yoki { savollar: [...] } ko'p)
  router.post('/:toplam/:id/savollar', async (req, res, next) => {
    try {
      const id = mavzuId(req);
      const fayl = req.toplam.fayl(id);
      const shablon = await boshFayl(req, id);
      const kirish = Array.isArray(req.body.savollar) ? req.body.savollar : [req.body];
      const tayyor = [];
      for (const [i, s] of kirish.entries()) {
        const t = savolTekshir(s);
        if (t.xato) return res.status(400).json({ xato: kirish.length > 1 ? `${i + 1}-savol: ${t.xato}` : t.xato });
        tayyor.push(t.savol);
      }
      const qoshildi = await gh.ozgartir(fayl, (c) => {
        c = c || shablon;
        c.questions = c.questions || [];
        let id = Math.max(0, ...c.questions.map(q => Number(q.id) || 0));
        const yangi = tayyor.map(s => ({ id: ++id, ...s }));
        c.questions.push(...yangi);
        return { content: c, natija: yangi };
      }, izoh(req, `${fayl}: ${tayyor.length} ta savol qo'shildi`));
      await jurnal(req.admin.id, req.toplamKalit, fayl, 'qoshish', { savollar: qoshildi });
      res.status(201).json({ qoshildi });
    } catch (e) { next(e); }
  });

  // PUT /:toplam/:id/savollar/:qid — tahrirlash
  router.put('/:toplam/:id/savollar/:qid', async (req, res, next) => {
    try {
      const fayl = req.toplam.fayl(mavzuId(req));
      const t = savolTekshir(req.body);
      if (t.xato) return res.status(400).json({ xato: t.xato });
      const qid = Number(req.params.qid);
      const natija = await gh.ozgartir(fayl, (c) => {
        const q = c?.questions?.find(x => Number(x.id) === qid);
        if (!q) throw Object.assign(new Error('Savol topilmadi'), { status: 404 });
        const eski = { ...q };
        Object.assign(q, t.savol);
        return { content: c, natija: { eski, yangi: q } };
      }, izoh(req, `${fayl}: ${qid}-savol tahrirlandi`));
      await jurnal(req.admin.id, req.toplamKalit, fayl, 'tahrir', natija);
      res.json(natija.yangi);
    } catch (e) { next(e); }
  });

  // DELETE /:toplam/:id/savollar/:qid
  router.delete('/:toplam/:id/savollar/:qid', async (req, res, next) => {
    try {
      const fayl = req.toplam.fayl(mavzuId(req));
      const qid = Number(req.params.qid);
      const eski = await gh.ozgartir(fayl, (c) => {
        const i = c?.questions?.findIndex(x => Number(x.id) === qid) ?? -1;
        if (i < 0) throw Object.assign(new Error('Savol topilmadi'), { status: 404 });
        const [q] = c.questions.splice(i, 1);
        return { content: c, natija: q };
      }, izoh(req, `${fayl}: ${qid}-savol o'chirildi`));
      await jurnal(req.admin.id, req.toplamKalit, fayl, 'ochirish', eski);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // GET /:toplam/:id/jurnal — kim nima o'zgartirgan (oxirgi 50)
  router.get('/:toplam/:id/jurnal', async (req, res, next) => {
    try {
      const fayl = req.toplam.fayl(mavzuId(req));
      const { rows } = await db.query(`
        SELECT j.amal, j.tafsilot, j.created_at, a.login, a.fio, a.tuman
        FROM savol_ozgarishlar j LEFT JOIN tuman_adminlar a ON a.id = j.admin_id
        WHERE j.fayl = $1 ORDER BY j.created_at DESC LIMIT 50`, [fayl]);
      res.json(rows);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { toplamRouter };
