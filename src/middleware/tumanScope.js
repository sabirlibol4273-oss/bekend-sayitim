// Tuman nomlari har xil yozilishi mumkin: "Shahrixon tumani", "shahrixon t.", "Shahrixon".
// Hammasi bir xil ko'rinishga keltiriladi: "shahrixon".

function normalla(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ʻʼ‘’`]/g, "'")
    .replace(/\s*(tumani|tuman|t\.)\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// SQL'da xuddi shu normallash (ustun nomi kod ichidan beriladi, foydalanuvchidan emas)
function sqlNorm(ustun) {
  return `trim(regexp_replace(regexp_replace(translate(lower(coalesce(${ustun},'')), 'ʻʼ‘’\`', repeat(chr(39), 5)),'\\s*(tumani|tuman|t\\.)\\s*$', ''), '\\s+', ' ', 'g'))`;
}

// Tuman admini faqat o'z tumanini ko'radi.
// Superadmin ?viloyat=...&tuman=... bilan istalgan tumanni tanlay oladi.
function tumanScope(req, res, next) {
  const a = req.admin;
  if (a.rol === 'superadmin') {
    req.hudud = { viloyat: req.query.viloyat || null, tuman: req.query.tuman || null };
  } else {
    if (!a.tuman) return res.status(403).json({ xato: 'Hisobingizga tuman biriktirilmagan' });
    req.hudud = { viloyat: a.viloyat, tuman: a.tuman };
  }
  req.hudud.tumanNorm = req.hudud.tuman ? normalla(req.hudud.tuman) : null;
  req.hudud.faqatOqituvchi = req.query.faqat_oqituvchi === '1';
  req.hudud.fan = req.query.fan ? String(req.query.fan) : null;
  next();
}

// O'qituvchi: fani belgilangan YOKI ilovada sinf o'rniga "Ustoz" tanlagan
function oqituvchiSharti(alias = 'u') {
  return `(COALESCE(${alias}.fan,'') <> '' OR LOWER(COALESCE(${alias}.grade,'')) LIKE '%ustoz%' OR LOWER(COALESCE(${alias}.grade,'')) LIKE '%qituvchi%')`;
}

// users jadvali uchun hudud sharti: params massiviga qiymat qo'shib, SQL bo'lagini qaytaradi
function hududSharti(hudud, params, alias = 'u') {
  const shartlar = [];
  if (hudud.tumanNorm) {
    params.push(hudud.tumanNorm);
    shartlar.push(`${sqlNorm(`${alias}.district`)} = $${params.length}`);
  }
  // Tuman paneli FAQAT o'qituvchilarni ko'radi (o'quvchilar — asosiy admin panelda)
  shartlar.push(oqituvchiSharti(alias));
  if (hudud.fan) {
    params.push(hudud.fan.toLowerCase().trim());
    shartlar.push(`LOWER(TRIM(${alias}.fan)) = $${params.length}`);
  }
  return shartlar.length ? shartlar.join(' AND ') : 'TRUE';
}

module.exports = { tumanScope, normalla, sqlNorm, hududSharti, oqituvchiSharti };
