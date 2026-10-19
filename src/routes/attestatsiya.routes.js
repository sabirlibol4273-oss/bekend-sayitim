// /api/attestatsiya/attestatsiya/...  — Ates_topics.json + Attes_testsN.json (mavjud)
// /api/attestatsiya/pedagogika/...    — Pedagogika_topics.json + Pedagogika_testsN.json (birinchi mavzu qo'shilganda yaratiladi)
const { toplamRouter } = require('../services/savolToplam');

module.exports = toplamRouter({
  attestatsiya: { nom: 'Attestatsiya (kimyo)', indeks: 'Ates_topics.json', fayl: id => `Attes_tests${id}.json` },
  pedagogika: { nom: 'Pedagogika', indeks: 'Pedagogika_topics.json', fayl: id => `Pedagogika_tests${id}.json` },
});
