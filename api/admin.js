const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  const db = loadDb();
  const action = body.action || req.query.action;

  // 1. Reset HWID by UID
  if (action === 'reset_hwid') {
    const uid = parseInt(body.uid, 10);
    if (!uid || isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Укажите корректный числовой UID' });
    }
    const user = db.users.find(u => u.uid === uid);
    if (!user) {
      return res.status(404).json({ ok: false, error: `Пользователь с UID #${uid} не найден` });
    }
    user.hwid = '';
    saveDb(db);
    return res.status(200).json({ ok: true, message: `HWID для UID #${uid} (${user.username}) успешно сброшен` });
  }

  // 2. Assign Role / Tag by UID (Admin, Media, User)
  if (action === 'set_role') {
    const uid = parseInt(body.uid, 10);
    const role = (body.role || '').trim();
    if (!uid || isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Укажите корректный числовой UID' });
    }
    if (!['Admin', 'Media', 'User'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Недопустимая роль. Выберите Admin, Media или User' });
    }
    const user = db.users.find(u => u.uid === uid);
    if (!user) {
      return res.status(404).json({ ok: false, error: `Пользователь с UID #${uid} не найден` });
    }
    user.role = role;
    saveDb(db);
    return res.status(200).json({ ok: true, message: `Пользователю UID #${uid} (${user.username}) присвоен тег [${role}]` });
  }

  // 3. Generate Subscription Keys
  if (action === 'generate_key') {
    const plan = body.plan || '30d';
    const randChunk = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    const key = `LUNA-${randChunk()}-${randChunk()}-${randChunk()}`;

    let label = '30 дней (1 месяц)';
    if (plan === '7d') label = '7 дней';
    else if (plan === '90d') label = '90 дней (3 месяца)';
    else if (plan === 'lifetime') label = 'Lifetime (Навсегда)';

    const keyObj = {
      key: key,
      duration: plan,
      durationLabel: label,
      createdAt: new Date().toISOString().split('T')[0],
      used: false,
      usedByUid: null,
      usedAt: null
    };

    if (!db.keys) db.keys = [];
    db.keys.unshift(keyObj);
    saveDb(db);

    return res.status(200).json({ ok: true, key: keyObj, message: `Сгенерирован ключ: ${key}` });
  }

  // 4. List keys or users
  if (action === 'list_keys') {
    return res.status(200).json({ ok: true, keys: db.keys || [] });
  }

  return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
};
