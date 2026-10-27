const db = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.body || {};
    const uid = parseInt(body.uid, 10);
    if (!uid || isNaN(uid)) {
      return res.status(400).json({ ok: false, error: 'Не указан UID' });
    }

    const user = await db.getUserByUid(uid);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
    }

    // Eligibility check
    const isSubActive = user.subscription === 'Lifetime' || (user.subExpiry && new Date(user.subExpiry) >= new Date());
    if (!isSubActive && user.role !== 'Admin') {
      return res.status(403).json({ ok: false, error: 'Сброс HWID недоступен без активной подписки' });
    }

    if (!user.hwid || user.hwid === 'Не привязан') {
      return res.status(400).json({ ok: false, error: 'HWID еще не привязан к вашей учетной записи' });
    }

    // Reset HWID directly
    const updated = await db.updateUser(uid, { hwid: '' });
    const safeUser = { ...updated };
    delete safeUser.password;

    return res.status(200).json({
      ok: true,
      user: safeUser,
      message: 'HWID успешно сброшен! Теперь вы можете авторизоваться с нового компьютера.'
    });
  } catch (err) {
    console.error('[API/hwid] Error:', err);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера: ' + err.message });
  }
};
