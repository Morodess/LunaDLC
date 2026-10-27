const db = require('./db');
const crypto = require('crypto');

async function parseReqBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch(e) {}
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch(e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const rawBody = await parseReqBody(req);
    const query = req.query || (req.url && req.url.includes('?') ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {});
    const body = { ...query, ...rawBody };
    const action = body.action || query.action;

    // 1. Reset HWID by UID
    if (action === 'reset_hwid') {
      const uid = parseInt(String(body.uid || '').replace(/[^0-9]/g, ''), 10);
      if (!uid || isNaN(uid)) {
        return res.status(400).json({ ok: false, error: 'Укажите корректный числовой UID' });
      }
      const user = await db.getUserByUid(uid);
      if (!user) {
        return res.status(404).json({ ok: false, error: `Пользователь с UID #${uid} не найден` });
      }
      await db.updateUser(uid, { hwid: '' });
      return res.status(200).json({
        ok: true,
        user: { ...user, hwid: '' },
        message: `HWID для UID #${uid} (${user.username}) успешно сброшен`
      });
    }

    // 2. Assign Role / Tag by UID (Admin, Media, VIP, Dev, User or Custom)
    if (action === 'set_role') {
      const uid = parseInt(String(body.uid || '').replace(/[^0-9]/g, ''), 10);
      const role = (body.role || '').trim();
      if (!uid || isNaN(uid)) {
        return res.status(400).json({ ok: false, error: 'Укажите корректный числовой UID' });
      }
      if (!role || role.length > 24) {
        return res.status(400).json({ ok: false, error: 'Укажите тег / префикс (от 1 до 24 символов)' });
      }
      const user = await db.getUserByUid(uid);
      if (!user) {
        return res.status(404).json({ ok: false, error: `Пользователь с UID #${uid} не найден` });
      }
      await db.updateUser(uid, { role });
      return res.status(200).json({
        ok: true,
        user: { ...user, role },
        message: `Пользователю UID #${uid} (${user.username}) присвоен тег [${role}]`
      });
    }

    // 3. Generate Subscription Key
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

      await db.createKey(keyObj);

      return res.status(200).json({ ok: true, key: keyObj, message: `Сгенерирован ключ: ${key}` });
    }

    // 4. List Keys
    if (action === 'list_keys') {
      const keys = await db.listKeys();
      return res.status(200).json({ ok: true, keys });
    }

    // 5. List Users
    if (action === 'list_users') {
      const users = await db.listUsers();
      return res.status(200).json({ ok: true, users });
    }

    return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
  } catch (err) {
    console.error('[API/admin] Error:', err);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера: ' + err.message });
  }
};
