const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'users.json');

// Check for Postgres connection string from environment
const connectionString = process.env.POSTGRES_URL || 
                         process.env.DATABASE_URL || 
                         process.env.STORAGE_URL || 
                         process.env.STORAGE_POSTGRES_URL || 
                         process.env.STORAGE_DATABASE_URL || 
                         process.env.POSTGRES_URL_NON_POOLING || 
                         process.env.SUPABASE_DB_URL || 
                         process.env.NEON_DATABASE_URL;

let pool = null;
let tablesInitialized = false;

if (connectionString) {
  // SSL mode enabled for cloud databases (Neon, Supabase, Vercel Postgres, AWS RDS, Railway)
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
}

// Ensure database tables exist
async function initPostgres() {
  if (!pool || tablesInitialized) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          uid SERIAL PRIMARY KEY,
          username VARCHAR(64) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(32) DEFAULT 'User',
          subscription VARCHAR(64) DEFAULT 'Демо-период (24ч)',
          sub_expiry VARCHAR(32) DEFAULT '2099-12-31',
          hwid VARCHAR(255) DEFAULT '',
          created_at VARCHAR(32)
        );

        CREATE TABLE IF NOT EXISTS license_keys (
          key VARCHAR(64) PRIMARY KEY,
          duration VARCHAR(32) NOT NULL,
          duration_label VARCHAR(64) NOT NULL,
          created_at VARCHAR(32) NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          used_by_uid INTEGER,
          used_at VARCHAR(32)
        );
      `);

      // Check if default admin accounts exist
      const checkAdmin = await client.query(`SELECT uid FROM users WHERE LOWER(username) = 'tomoro' LIMIT 1`);
      if (checkAdmin.rows.length === 0) {
        await client.query(`
          INSERT INTO users (username, password, role, subscription, sub_expiry, hwid, created_at)
          VALUES 
            ('TOmoro', 'GENSIS2323', 'Admin', 'Lifetime', '2099-12-31', '', '2026-01-01'),
            ('admin', 'admin123', 'Admin', 'Lifetime', '2099-12-31', '', '2026-01-01')
          ON CONFLICT (username) DO NOTHING;
        `);
      }
      tablesInitialized = true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] Postgres init error:', err.message);
  }
}

const ALT_DB_PATH = path.join(__dirname, '..', 'Site', 'data', 'users.json');
const ROOT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'users.json');
const TMP_DB_PATH = path.join(process.platform === 'win32' ? (process.env.TEMP || 'C:\\Windows\\Temp') : '/tmp', 'luna_users.json');

// Local JSON file fallback (used when no cloud DB env var is provided)
function loadLocalDb() {
  const candidates = [TMP_DB_PATH, DB_PATH, ALT_DB_PATH, ROOT_DB_PATH];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data && Array.isArray(data.users) && data.users.length > 0) {
          if (!data.keys) data.keys = [];
          return data;
        }
      }
    } catch (e) {}
  }
  return {
    users: [
      { uid: 1, username: 'TOmoro', password: 'GENSIS2323', role: 'Admin', subscription: 'Lifetime', subExpiry: '2099-12-31', hwid: '', createdAt: '2026-01-01' },
      { uid: 2, username: 'admin', password: 'admin123', role: 'Admin', subscription: 'Lifetime', subExpiry: '2099-12-31', hwid: '', createdAt: '2026-01-01' }
    ],
    keys: []
  };
}

function saveLocalDb(db) {
  const json = JSON.stringify(db, null, 2);
  const targets = [TMP_DB_PATH, DB_PATH, ALT_DB_PATH, ROOT_DB_PATH];
  for (const t of targets) {
    try {
      const dir = path.dirname(t);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(t, json, 'utf8');
    } catch (e) {}
  }
}


function mapPgUser(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    username: row.username,
    password: row.password,
    role: row.role || 'User',
    subscription: row.subscription || 'Демо-период (24ч)',
    subExpiry: row.sub_expiry || '2099-12-31',
    hwid: row.hwid || '',
    createdAt: row.created_at || ''
  };
}

function mapPgKey(row) {
  if (!row) return null;
  return {
    key: row.key,
    duration: row.duration,
    durationLabel: row.duration_label,
    createdAt: row.created_at,
    used: !!row.used,
    usedByUid: row.used_by_uid,
    usedAt: row.used_at
  };
}

// ================= API METHODS =================

async function getUserByName(username) {
  if (pool) {
    await initPostgres();
    const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [username.trim()]);
    return mapPgUser(res.rows[0]);
  }
  const db = loadLocalDb();
  return db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
}

async function getUserByUid(uid) {
  const numericUid = parseInt(uid, 10);
  if (!numericUid || isNaN(numericUid)) return null;

  if (pool) {
    await initPostgres();
    const res = await pool.query('SELECT * FROM users WHERE uid = $1 LIMIT 1', [numericUid]);
    return mapPgUser(res.rows[0]);
  }
  const db = loadLocalDb();
  return db.users.find(u => u.uid === numericUid) || null;
}

async function createUser({ username, password, role = 'User', subscription = 'Не активна', subExpiry = '2000-01-01', hwid = '' }) {
  const now = new Date().toISOString().split('T')[0];
  if (pool) {
    await initPostgres();
    const res = await pool.query(
      `INSERT INTO users (username, password, role, subscription, sub_expiry, hwid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [username.trim(), password.trim(), role, subscription, subExpiry, hwid, now]
    );
    return mapPgUser(res.rows[0]);
  }

  const db = loadLocalDb();
  const maxUid = db.users.reduce((m, u) => Math.max(m, u.uid || 0), 0);
  const newUid = maxUid + 1;
  const newUser = {
    uid: newUid,
    username: username.trim(),
    password: password.trim(),
    role,
    subscription,
    subExpiry,
    hwid,
    createdAt: now
  };
  db.users.push(newUser);
  saveLocalDb(db);
  return newUser;
}

async function updateUser(uid, fields) {
  const numericUid = parseInt(uid, 10);
  if (!numericUid) return null;

  if (pool) {
    await initPostgres();
    const sets = [];
    const values = [];
    let idx = 1;

    if (fields.password !== undefined) {
      sets.push(`password = $${idx++}`);
      values.push(fields.password);
    }
    if (fields.role !== undefined) {
      sets.push(`role = $${idx++}`);
      values.push(fields.role);
    }
    if (fields.subscription !== undefined) {
      sets.push(`subscription = $${idx++}`);
      values.push(fields.subscription);
    }
    if (fields.subExpiry !== undefined) {
      sets.push(`sub_expiry = $${idx++}`);
      values.push(fields.subExpiry);
    }
    if (fields.hwid !== undefined) {
      sets.push(`hwid = $${idx++}`);
      values.push(fields.hwid);
    }

    if (sets.length === 0) return await getUserByUid(numericUid);

    values.push(numericUid);
    const query = `UPDATE users SET ${sets.join(', ')} WHERE uid = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return mapPgUser(res.rows[0]);
  }

  const db = loadLocalDb();
  const user = db.users.find(u => u.uid === numericUid);
  if (!user) return null;
  if (fields.password !== undefined) user.password = fields.password;
  if (fields.role !== undefined) user.role = fields.role;
  if (fields.subscription !== undefined) user.subscription = fields.subscription;
  if (fields.subExpiry !== undefined) user.subExpiry = fields.subExpiry;
  if (fields.hwid !== undefined) user.hwid = fields.hwid;
  saveLocalDb(db);
  return user;
}

async function deleteUser(uid) {
  const numericUid = parseInt(uid, 10);
  if (!numericUid) return false;

  if (pool) {
    await initPostgres();
    const res = await pool.query('DELETE FROM users WHERE uid = $1 RETURNING uid', [numericUid]);
    return res.rowCount > 0;
  }

  const db = loadLocalDb();
  const idx = db.users.findIndex(u => u.uid === numericUid);
  if (idx !== -1) {
    db.users.splice(idx, 1);
    saveLocalDb(db);
    return true;
  }
  return false;
}

async function listUsers() {
  if (pool) {
    await initPostgres();
    const res = await pool.query('SELECT uid, username, role, subscription, sub_expiry, hwid, created_at FROM users ORDER BY uid ASC');
    return res.rows.map(mapPgUser);
  }
  const db = loadLocalDb();
  return db.users.map(u => {
    const c = { ...u };
    delete c.password;
    return c;
  });
}

// License Key Methods
async function getKey(keyStr) {
  if (!keyStr) return null;
  const cleanKey = keyStr.trim().toUpperCase();

  if (pool) {
    await initPostgres();
    const res = await pool.query('SELECT * FROM license_keys WHERE UPPER(key) = $1 LIMIT 1', [cleanKey]);
    return mapPgKey(res.rows[0]);
  }
  const db = loadLocalDb();
  return (db.keys || []).find(k => k.key.toUpperCase() === cleanKey) || null;
}

async function createKey(keyObj) {
  if (pool) {
    await initPostgres();
    await pool.query(
      `INSERT INTO license_keys (key, duration, duration_label, created_at, used, used_by_uid, used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [keyObj.key.toUpperCase(), keyObj.duration, keyObj.durationLabel, keyObj.createdAt, false, null, null]
    );
    return keyObj;
  }
  const db = loadLocalDb();
  if (!db.keys) db.keys = [];
  db.keys.unshift(keyObj);
  saveLocalDb(db);
  return keyObj;
}

async function redeemKeyInDb(keyStr, uid, newExpiry, subscriptionLabel) {
  const numericUid = parseInt(uid, 10);
  const cleanKey = keyStr.trim().toUpperCase();
  const now = new Date().toISOString().split('T')[0];

  if (pool) {
    await initPostgres();
    await pool.query(
      `UPDATE license_keys SET used = TRUE, used_by_uid = $1, used_at = $2 WHERE UPPER(key) = $3`,
      [numericUid, now, cleanKey]
    );
    const updatedUser = await pool.query(
      `UPDATE users SET subscription = $1, sub_expiry = $2 WHERE uid = $3 RETURNING *`,
      [subscriptionLabel, newExpiry, numericUid]
    );
    return mapPgUser(updatedUser.rows[0]);
  }

  const db = loadLocalDb();
  const k = (db.keys || []).find(item => item.key.toUpperCase() === cleanKey);
  if (k) {
    k.used = true;
    k.usedByUid = numericUid;
    k.usedAt = now;
  }
  const u = db.users.find(item => item.uid === numericUid);
  if (u) {
    u.subscription = subscriptionLabel;
    u.subExpiry = newExpiry;
  }
  saveLocalDb(db);
  return u;
}

async function listKeys() {
  if (pool) {
    await initPostgres();
    const res = await pool.query('SELECT * FROM license_keys ORDER BY created_at DESC');
    return res.rows.map(mapPgKey);
  }
  const db = loadLocalDb();
  return db.keys || [];
}

module.exports = {
  isPostgres: !!pool,
  getUserByName,
  getUserByUid,
  createUser,
  updateUser,
  deleteUser,
  listUsers,
  getKey,
  createKey,
  redeemKeyInDb,
  listKeys
};
