const db = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET: list configs or get single config
    if (req.method === 'GET') {
      const id = req.query.id;
      if (id) {
        const cfg = await db.getConfigById(id);
        if (!cfg) return res.status(404).json({ ok: false, error: 'Конфиг не найден' });
        await db.incrementConfigDownloads(id);
        return res.status(200).json({ ok: true, config: cfg });
      }
      const configs = await db.listConfigs();
      return res.status(200).json({ ok: true, configs });
    }

    // POST: publish a new config
    if (req.method === 'POST') {
      const body = req.body || {};
      const name = (body.name || '').trim();
      const author = (body.author || 'Player').trim();
      const description = (body.description || '').trim();
      let data = body.data || body.config;

      if (!name) {
        return res.status(400).json({ ok: false, error: 'Укажите название конфига' });
      }

      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return res.status(400).json({ ok: false, error: 'Некорректный JSON конфига' });
        }
      }

      if (!data || typeof data !== 'object') {
        return res.status(400).json({ ok: false, error: 'Данные конфига пусты или некорректны' });
      }

      const created = await db.createConfig({
        name,
        author,
        description,
        data
      });

      return res.status(201).json({
        ok: true,
        message: `Конфиг "${name}" успешно опубликован на сайте!`,
        config: created
      });
    }

    // DELETE: remove a config
    if (req.method === 'DELETE') {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) return res.status(400).json({ ok: false, error: 'ID конфига не указан' });
      const deleted = await db.deleteConfig(id);
      return res.status(200).json({ ok: deleted, message: deleted ? 'Конфиг удален' : 'Конфиг не найден' });
    }

    return res.status(405).json({ ok: false, error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('[API/configs] Error:', err);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера: ' + err.message });
  }
};
