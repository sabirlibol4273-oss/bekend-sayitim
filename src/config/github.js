// Kimyo_testlar repodagi JSON fayllarni o'qish/yozish (GitHub Contents API)
const REPO = (process.env.GITHUB_REPO || 'sabirlibol4273-oss/Kimyo_testlar').trim();
const BRANCH = process.env.GITHUB_BRANCH || 'main';

function sarlavhalar() {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'bekend-sayitim' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function xato(status, xabar) { const e = new Error(xabar); e.status = status; return e; }

function tushuntir(st, msg) {
  if (!process.env.GITHUB_TOKEN) return 'GITHUB_TOKEN o\'rnatilmagan (.env / Railway Variables)';
  if (st === 401) return 'GITHUB_TOKEN noto\'g\'ri yoki muddati tugagan';
  if (st === 403) return 'GITHUB_TOKEN\'da Kimyo_testlar uchun "Contents: Read and write" ruxsati yo\'q';
  return `GitHub xatosi (${st}): ${msg}`;
}

const nomTekshir = (f) => { if (!/^[\w.\-]+\.json$/.test(f)) throw xato(400, 'Fayl nomi noto\'g\'ri'); };

// { sha, content } yoki fayl bo'lmasa null
async function oqi(fayl) {
  nomTekshir(fayl);
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(fayl)}?ref=${BRANCH}&t=${Date.now()}`,
    { headers: sarlavhalar() });
  if (r.status === 404) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw xato(502, tushuntir(r.status, d.message));
  let matn = Buffer.from(d.content || '', 'base64').toString('utf8');
  if (!d.content && d.download_url) matn = await (await fetch(d.download_url)).text(); // 1 MB dan katta fayllar
  return { sha: d.sha, content: JSON.parse(matn) };
}

async function yoz(fayl, content, sha, xabar) {
  nomTekshir(fayl);
  if (!process.env.GITHUB_TOKEN) throw xato(500, tushuntir());
  const body = { message: xabar, branch: BRANCH, content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64') };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(fayl)}`,
    { method: 'PUT', headers: { ...sarlavhalar(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 409 || r.status === 422) throw xato(409, 'Fayl shu paytda boshqa joydan o\'zgartirildi');
  if (!r.ok) throw xato(502, tushuntir(r.status, d.message));
  return d.content?.sha;
}

// O'qi → o'zgartir → yoz. Konflikt bo'lsa bir marta qayta urinadi.
async function ozgartir(fayl, fn, xabar) {
  for (let urinish = 0; urinish < 2; urinish++) {
    const f = await oqi(fayl);
    const yangi = await fn(f ? f.content : null);
    try { await yoz(fayl, yangi.content, f?.sha, xabar); return yangi.natija; }
    catch (e) { if (e.status !== 409 || urinish) throw e; }
  }
}

module.exports = { oqi, yoz, ozgartir, REPO };
