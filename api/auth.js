const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'users.json');

function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {}
  return {
    users: [
      { uid: 1, username: 'TOmoro', password: 'GENSIS2323', role: 'Admin', subscription: 'Lifetime', subExpiry: '2099-12-31', hwid: 'E4F9-98A1-440B-CC02-LUNA', createdAt: '2026-01-01' },
      { uid: 2, username: 'admin', password: 'admin123', role: 'Admin', subscription: 'Lifetime', subExpiry: '2099-12-31', hwid: '', createdAt: '2026-01-01' }
    ],
    keys: []
  };
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
  const action = body.action || req.query.action || 'login';
  const db = loadDb();

  if (action === 'register') {
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    if (!username || username.length < 3) {
      return res.status(400).json({ ok: false, error: 'Никнейм должен содержать минимум 3 символа' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ ok: false, error: 'Пароль должен содержать минимум 4 символа' });
    }

    const exists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.status(400).json({ ok: false, error: 'Пользователь с таким никнеймом уже зарегистрирован' });
    }

    const maxUid = db.users.reduce((m, u) => Math.max(m, u.uid || 0), 0);
    const newUid = maxUid + 1;
    const now = new Date();
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newUser = {
      uid: newUid,
      username: username,
      password: password,
      role: 'User',
      subscription: 'Демо-период (24ч)',
      subExpiry: expiry,
      hwid: '',
      createdAt: now.toISOString().split('T')[0]
    };

    db.users.push(newUser);
    saveDb(db);

    const safeUser = { ...newUser };
    delete safeUser.password;
    return res.status(200).json({ ok: true, user: safeUser, message: `Успешная регистрация! Ваш UID: #${newUid}` });
  }

  // Action: Login
  const username = (body.username || '').trim();
  const password = (body.password || '').trim();

  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  const safeUser = { ...user };
  delete safeUser.password;
  return res.status(200).json({ ok: true, user: safeUser });
};
