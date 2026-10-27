const db = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.body || {};
    const action = body.action || req.query.action || 'login';

    // 1. REGISTER
    if (action === 'register') {
      const username = (body.username || '').trim();
      const password = (body.password || '').trim();
      const confirmPassword = (body.confirmPassword || '').trim();

      if (!username || username.length < 3 || username.length > 20) {
        return res.status(400).json({ ok: false, error: 'Логин должен содержать от 3 до 20 символов' });
      }
      const userRegex = /^[a-zA-Z0-9_]+$/;
      if (!userRegex.test(username)) {
        return res.status(400).json({ ok: false, error: 'Логин может содержать только латинские буквы, цифры и _ (без пробелов)' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ ok: false, error: 'Пароль должен содержать минимум 6 символов' });
      }
      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({ ok: false, error: 'Пароли не совпадают' });
      }

      const existing = await db.getUserByName(username);
      if (existing) {
        return res.status(400).json({ ok: false, error: 'Пользователь с таким никнеймом уже зарегистрирован' });
      }

      const created = await db.createUser({
        username,
        password,
        role: 'User',
        subscription: 'Не активна',
        subExpiry: '2000-01-01',
        hwid: ''
      });

      const safeUser = { ...created };
      delete safeUser.password;
      return res.status(200).json({
        ok: true,
        user: safeUser,
        message: `Успешная регистрация! Присвоен реальный UID: #${created.uid}`
      });
    }

    // 2. CHANGE PASSWORD
    if (action === 'change_password') {
      const uid = parseInt(body.uid, 10);
      const oldPassword = (body.oldPassword || '').trim();
      const newPassword = (body.newPassword || '').trim();
      const confirmNewPassword = (body.confirmNewPassword || '').trim();

      if (!uid || isNaN(uid)) {
        return res.status(400).json({ ok: false, error: 'Не указан UID пользователя' });
      }
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ ok: false, error: 'Заполните текущий и новый пароль' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ ok: false, error: 'Новый пароль должен содержать от 6 символов' });
      }
      if (confirmNewPassword && newPassword !== confirmNewPassword) {
        return res.status(400).json({ ok: false, error: 'Новые пароли не совпадают' });
      }

      const user = await db.getUserByUid(uid);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
      }
      if (user.password !== oldPassword) {
        return res.status(401).json({ ok: false, error: 'Текущий пароль указан неверно' });
      }

      const updated = await db.updateUser(uid, { password: newPassword });
      const safeUser = { ...updated };
      delete safeUser.password;
      return res.status(200).json({ ok: true, user: safeUser, message: 'Пароль успешно обновлен!' });
    }

    // 3. DELETE ACCOUNT
    if (action === 'delete_account') {
      const uid = parseInt(body.uid, 10);
      const password = (body.password || '').trim();

      if (!uid || isNaN(uid)) {
        return res.status(400).json({ ok: false, error: 'Не указан UID пользователя' });
      }
      if (!password) {
        return res.status(400).json({ ok: false, error: 'Для подтверждения удаления введите пароль' });
      }

      const user = await db.getUserByUid(uid);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
      }
      if (user.password !== password) {
        return res.status(401).json({ ok: false, error: 'Неверный пароль' });
      }

      // Safeguard: protect root admin UID 1
      if (uid === 1 || user.username.toLowerCase() === 'tomoro') {
        return res.status(403).json({ ok: false, error: 'Основной аккаунт администратора не может быть удален' });
      }

      const deleted = await db.deleteUser(uid);
      if (!deleted) {
        return res.status(500).json({ ok: false, error: 'Не удалось удалить аккаунт' });
      }

      return res.status(200).json({ ok: true, message: 'Аккаунт успешно удален' });
    }

    // 4. GET PROFILE BY UID (Refreshes user data)
    if (action === 'get_profile') {
      const uid = parseInt(body.uid || req.query.uid, 10);
      if (!uid || isNaN(uid)) {
        return res.status(400).json({ ok: false, error: 'Не указан UID' });
      }
      const user = await db.getUserByUid(uid);
      if (!user) {
        return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
      }
      const safeUser = { ...user };
      delete safeUser.password;
      return res.status(200).json({ ok: true, user: safeUser });
    }

    // 5. LOGIN
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    if (!username) {
      return res.status(400).json({ ok: false, error: 'Введите ваш логин или никнейм' });
    }
    if (!password) {
      return res.status(400).json({ ok: false, error: 'Введите пароль' });
    }

    const user = await db.getUserByName(username);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Пользователь с таким никнеймом не найден' });
    }

    if (user.password !== password) {
      return res.status(401).json({ ok: false, error: 'Неверный пароль' });
    }

    const safeUser = { ...user };
    delete safeUser.password;
    return res.status(200).json({ ok: true, user: safeUser, message: 'Авторизация успешна' });

  } catch (err) {
    console.error('[API/auth] Error:', err);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера: ' + err.message });
  }
};
