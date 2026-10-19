const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL topilmadi (.env faylni tekshiring)');
  process.exit(1);
}

// Railway uchun SSL kerak, localhost uchun kerak emas
const lokal = /localhost|127\.0\.0\.1/.test(url);

const pool = new Pool({
  connectionString: url,
  ssl: lokal ? false : { rejectUnauthorized: false },
  max: 5, // asosiy backend bilan bir bazani bo'lishamiz, ulanishlarni kam ushlaymiz
});

pool.on('error', err => console.error('PostgreSQL xatosi:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
