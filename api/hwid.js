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
  if (!uid || isNaN(uid)) {
    return res.status(400).json({ ok: false, error: 'Не указан UID' });
  }

  const db = loadDb();
  const user = db.users.find(u => u.uid === uid);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
  }

  // Check eligibility: user must have an active subscription or be Admin/Media, and HWID must be bound
  const isSubActive = user.subscription === 'Lifetime' || (user.subExpiry && new Date(user.subExpiry) >= new Date());
  if (!isSubActive && user.role !== 'Admin') {
    return res.status(403).json({ ok: false, error: 'Сброс HWID недоступен без активной подписки' });
  }

  if (!user.hwid || user.hwid === 'Не привязан') {
    return res.status(400).json({ ok: false, error: 'HWID еще не привязан к вашей учетной записи' });
  }

  // Instant reset - no ticket needed!
  user.hwid = '';
  saveDb(db);

  const safeUser = { ...user };
  delete safeUser.password;
  return res.status(200).json({
    ok: true,
    user: safeUser,
    message: 'HWID успешно сброшен! Теперь вы можете авторизоваться с нового компьютера.'
  });
};
