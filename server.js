require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

const app = express();
app.set('trust proxy', 1); // Railway proxy ortida haqiqiy IP uchun

// Faqat ruxsat berilgan panel manzillaridan so'rov qabul qilinadi
const ruxsatlar = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin || ruxsatlar.includes(origin)) ? cb(null, true) : cb(new Error('CORS ruxsat yo\'q')),
}));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, db: 'ulangan', vaqt: new Date() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'xato', xabar: e.message });
  }
});

// Routelar avtomatik ulanadi: fayl bo'lsa yuklanadi, bo'lmasa o'tkazib yuboriladi
const routelar = ['auth', 'superadmin', 'oqituvchilar', 'statistika', 'onlineTest', 'mavzuTest', 'attestatsiya'];
for (const nom of routelar) {
  const fayl = path.join(__dirname, 'src', 'routes', `${nom}.routes.js`);
  if (fs.existsSync(fayl)) {
    app.use(`/api/${nom}`, require(fayl));
    console.log(`✔ /api/${nom} ulandi`);
  }
}

app.use((req, res) => res.status(404).json({ xato: 'Topilmadi' }));
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ xato: err.message || 'Server xatosi' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Bekend Sayitim ${PORT}-portda ishlayapti`));
