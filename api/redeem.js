const db = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.body || {};
    const uid = parseInt(body.uid, 10);
    const keyStr = (body.key || '').trim().toUpperCase();

    if (!uid || !keyStr) {
      return res.status(400).json({ ok: false, error: 'Укажите UID и ключ активации' });
    }

    const user = await db.getUserByUid(uid);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    const keyObj = await db.getKey(keyStr);
    if (!keyObj) {
      return res.status(404).json({ ok: false, error: 'Неверный лицензионный ключ' });
    }
    if (keyObj.used) {
      return res.status(400).json({ ok: false, error: `Этот ключ уже был активирован (UID #${keyObj.usedByUid})` });
    }

    const now = new Date();
    let baseDate = now;
    if (user.subExpiry && new Date(user.subExpiry) > now) {
      baseDate = new Date(user.subExpiry);
    }

    let newExpiry = '2099-12-31';
    let newSub = 'Lifetime';

    if (keyObj.duration !== 'lifetime') {
      let days = 30;
      if (keyObj.duration === '7d') days = 7;
      else if (keyObj.duration === '90d') days = 90;

      const expiryDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
      newExpiry = expiryDate.toISOString().split('T')[0];
      newSub = keyObj.durationLabel || `${days} дней`;
    }

    const updatedUser = await db.redeemKeyInDb(keyStr, uid, newExpiry, newSub);
    const safeUser = { ...updatedUser };
    delete safeUser.password;

    return res.status(200).json({
      ok: true,
      user: safeUser,
      message: `Ключ успешно активирован! Ваша подписка: ${newSub} (до ${newExpiry})`
    });
  } catch (err) {
    console.error('[API/redeem] Error:', err);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера: ' + err.message });
  }
};
