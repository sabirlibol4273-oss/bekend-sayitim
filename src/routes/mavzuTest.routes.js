// /api/mavzuTest/mavzu/...  — Kimyo_testlar: topics.json + questions_topicN.json
const { toplamRouter } = require('../services/savolToplam');

module.exports = toplamRouter({
  mavzu: { nom: 'Mavzulashtirilgan testlar', indeks: 'topics.json', fayl: id => `questions_topic${id}.json` },
});
