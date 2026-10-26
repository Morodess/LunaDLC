const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'users.json');

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {}
  return { users: [], keys: [] };
}

function saveDb(db) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {}
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.body || {};
  const username = (body.username || req.query.username || '').trim();
  const password = (body.password || req.query.password || '').trim();
  const clientHwid = (body.hwid || req.query.hwid || '').trim();

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Укажите логин и пароль' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  // Check subscription expiry
  const now = new Date();
  const isLifetime = user.subscription === 'Lifetime' || user.role === 'Admin';
  const isSubActive = isLifetime || (user.subExpiry && new Date(user.subExpiry) >= now);

  if (!isSubActive) {
    return res.status(403).json({
      ok: false,
      code: 'SUB_EXPIRED',
      error: 'Срок действия подписки истек. Продлите доступ на сайте в личном кабинете.'
    });
  }

  // HWID Verification / Auto-bind
  if (clientHwid) {
    if (!user.hwid || user.hwid === 'Не привязан') {
      // First launch or after reset: auto-bind client HWID
      user.hwid = clientHwid;
      saveDb(db);
    } else if (user.hwid.toUpperCase() !== clientHwid.toUpperCase()) {
      return res.status(403).json({
        ok: false,
        code: 'HWID_MISMATCH',
        error: 'Оборудование не совпадает с привязанным. Сбросьте HWID на сайте в личном кабинете.'
      });
    }
  }

  return res.status(200).json({
    ok: true,
    uid: user.uid,
    username: user.username,
    role: user.role || 'User',
    subscription: user.subscription,
    subExpiry: user.subExpiry || '2099-12-31',
    hwid: user.hwid || clientHwid,
    token: `LUNA_AUTH_${user.uid}_${Date.now()}`
  });
};
