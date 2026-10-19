-- Bekend Sayitim migratsiyasi. Qayta ishga tushirsa ham xavfsiz.
-- Mavjud jadvallar (Sayitimm yaratgan): users(id TEXT, name, region, district, school, grade, last_seen...),
-- test_results(user_id, topic_id, topic_name, correct, total, score, created_at),
-- online_tests / online_questions / online_results — qayta ishlatamiz, yangisini yaratmaymiz.

-- 1) Tuman rahbarlari (va superadmin)
CREATE TABLE IF NOT EXISTS tuman_adminlar (
  id            SERIAL PRIMARY KEY,
  login         TEXT UNIQUE NOT NULL,
  parol_hash    TEXT NOT NULL,
  fio           TEXT,
  viloyat       TEXT,
  tuman         TEXT,
  rol           TEXT NOT NULL DEFAULT 'tuman_admin',  -- 'superadmin' | 'tuman_admin'
  faol          BOOLEAN NOT NULL DEFAULT TRUE,
  oxirgi_kirish TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Mavjud online_tests ga tuman ma'lumoti (NULL = umumiy test, hamma ko'radi)
ALTER TABLE online_tests ADD COLUMN IF NOT EXISTS region   TEXT;
ALTER TABLE online_tests ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE online_tests ADD COLUMN IF NOT EXISTS fan      TEXT;
ALTER TABLE online_tests ADD COLUMN IF NOT EXISTS tuman_admin_id INTEGER REFERENCES tuman_adminlar(id) ON DELETE SET NULL;

-- 3) users: o'qituvchi fani (bo'sh bo'lmasa = o'qituvchi). last_seen allaqachon bor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS fan TEXT;

-- 4) Kim qaysi savolni o'zgartirgani (audit)
CREATE TABLE IF NOT EXISTS savol_ozgarishlar (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES tuman_adminlar(id) ON DELETE SET NULL,
  manba       TEXT NOT NULL,      -- 'mavzu' | 'attestatsiya' | 'pedagogika'
  fayl        TEXT,
  amal        TEXT NOT NULL,      -- 'qoshish' | 'tahrir' | 'ochirish'
  tafsilot    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Tezlik uchun indekslar
CREATE INDEX IF NOT EXISTS idx_users_district     ON users (LOWER(TRIM(district)));
CREATE INDEX IF NOT EXISTS idx_test_results_vaqt  ON test_results (created_at);
CREATE INDEX IF NOT EXISTS idx_online_tests_dist  ON online_tests (LOWER(TRIM(district)));
