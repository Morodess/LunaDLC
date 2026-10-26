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
  const uid = parseInt(body.uid, 10);
  const keyStr = (body.key || '').trim().toUpperCase();

  if (!uid || !keyStr) {
    return res.status(400).json({ ok: false, error: 'Укажите UID и ключ активации' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.uid === uid);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
  }

  const keyObj = (db.keys || []).find(k => k.key.toUpperCase() === keyStr);
  if (!keyObj) {
    return res.status(404).json({ ok: false, error: 'Неверный лицензионный ключ' });
  }
  if (keyObj.used) {
    return res.status(400).json({ ok: false, error: `Этот ключ уже был активирован (UID #${keyObj.usedByUid})` });
  }

  // Redeem key
  keyObj.used = true;
  keyObj.usedByUid = uid;
  keyObj.usedAt = new Date().toISOString().split('T')[0];

  const now = new Date();
  let baseDate = now;
  if (user.subExpiry && new Date(user.subExpiry) > now) {
    baseDate = new Date(user.subExpiry);
  }

  if (keyObj.duration === 'lifetime') {
    user.subscription = 'Lifetime';
    user.subExpiry = '2099-12-31';
  } else {
    let days = 30;
    if (keyObj.duration === '7d') days = 7;
    else if (keyObj.duration === '90d') days = 90;

    const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    user.subExpiry = newExpiry.toISOString().split('T')[0];
    user.subscription = keyObj.durationLabel || `${days} дней`;
  }

  saveDb(db);

  const safeUser = { ...user };
  delete safeUser.password;
  return res.status(200).json({
    ok: true,
    user: safeUser,
    message: `Ключ успешно активирован! Ваша подписка: ${user.subscription} (до ${user.subExpiry})`
  });
};
