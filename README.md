# Bekend Sayitim — tuman rahbarlari API

Tuman rahbarlari uchun backend. Asosiy Kimyo bazasiga (Sayitimm bilan bir xil PostgreSQL) ulanadi.
Panel sahifalari Sayitimm'da: `public/tuman/` (kirish: `/tuman/login.html`).

## Lokal ishga tushirish
```
npm install
copy .env.example .env      # DATABASE_URL, JWT_SECRET (16+ belgi), GITHUB_TOKEN ni to'ldiring
npm run migrate             # yangi jadval/ustunlar (mavjud ma'lumotga tegmaydi)
npm run superadmin -- bobur Parol123 "Bobur"
npm run dev                 # http://localhost:4000/api/health
```

## Railway'ga joylash
1. GitHub'da yangi **private** repo yarating, masalan `bekend-sayitim`, keyin shu papkada:
   ```
   git init
   git add .
   git commit -m "Bekend Sayitim"
   git branch -M main
   git remote add origin https://github.com/sabirlibol4273-oss/bekend-sayitim.git
   git push -u origin main
   ```
2. Railway → Kimyo loyihangiz → **New → GitHub Repo → bekend-sayitim** (Postgres bilan bir loyihada).
3. Yangi servis → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET` = uzun tasodifiy satr
   - `GITHUB_TOKEN` = Kimyo_testlar uchun Contents: Read and write
   - `CORS_ORIGIN` = `https://apk-admin-production.up.railway.app`
4. **Settings → Networking → Generate Domain** — chiqqan manzilni nusxalang.
5. Railway'da servis terminali yoki lokal (`.env`da Railway `DATABASE_URL` bilan): `npm run migrate` va `npm run superadmin -- ...`
6. Sayitimm'dagi `public/tuman/js/tumanApi.js` ichida `https://bekend-sayitim-production.up.railway.app`
   ni 4-qadamdagi manzilga almashtiring va Sayitimm'ni push qiling.

## API
| Yo'l | Vazifa |
|---|---|
| `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/parol` | Kirish |
| `/api/superadmin/adminlar`, `/api/superadmin/tumanlar` | Tuman adminlarini boshqarish (faqat superadmin) |
| `/api/oqituvchilar`, `/:id/natijalar`, `/:id/fan`, `/fanlar` | O'qituvchilar va natijalar |
| `/api/statistika/umumiy · kunlik · mavzular · maktablar` | Tuman statistikasi |
| `/api/onlineTest` | Tuman onlayn testlari |
| `/api/mavzuTest/mavzu/...` | Mavzu testlari (GitHub) |
| `/api/attestatsiya/attestatsiya/...`, `/api/attestatsiya/pedagogika/...` | Attestatsiya va pedagogika (GitHub) |

Tuman admini faqat o'z tumanini ko'radi; superadmin `?tuman=` bilan istalganini.
