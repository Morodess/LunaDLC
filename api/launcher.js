const db = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.body || {};
    const username = (body.username || req.query.username || '').trim();
    const password = (body.password || req.query.password || '').trim();
    const clientHwid = (body.hwid || req.query.hwid || '').trim();

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Укажите логин и пароль' });
    }

    const user = await db.getUserByName(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
    }

    // Check subscription expiry
    const now = new Date();
    const isLifetime = user.subscription === 'Lifetime' || user.role === 'Admin';
    const isSubActive = isLifetime || (user.subExpiry && new Date(user.subExpiry) >= now && user.subscription !== 'Не активна' && user.subscription !== 'Нет подписки');

    if (!isSubActive) {
      return res.status(403).json({
        ok: false,
        code: 'SUB_EXPIRED',
        error: 'Отсутствует активная подписка Luna Client. Активируйте ключ в личном кабинете на сайте.'
      });
    }

    // HWID Verification / Auto-bind
    let boundHwid = user.hwid || '';
    if (clientHwid) {
      if (!boundHwid || boundHwid === 'Не привязан') {
        // First launch or after reset: auto-bind client HWID
        await db.updateUser(user.uid, { hwid: clientHwid });
        boundHwid = clientHwid;
      } else if (boundHwid.toUpperCase() !== clientHwid.toUpperCase()) {
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
      hwid: boundHwid || clientHwid,
      token: `LUNA_AUTH_${user.uid}_${Date.now()}`
    });
  } catch (err) {
    console.error('[API/launcher] Error:', err);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера: ' + err.message });
  }
};
