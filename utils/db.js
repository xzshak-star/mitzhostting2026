const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const defaultDB = {
  users: [],
  bots: [],
  tokens: {},
  bannedTokens: [],
  settings: { adminIds: [8632939616], defaultMaxBots: 1 }
};

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDB(defaultDB);
      return JSON.parse(JSON.stringify(defaultDB));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return JSON.parse(JSON.stringify(defaultDB));
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function initDB() {
  if (!fs.existsSync(DB_PATH)) {
    writeDB(defaultDB);
    console.log('DB initialized');
  }
}

function findUserByTelegramId(telegramId) {
  return readDB().users.find(u => String(u.telegramId) === String(telegramId));
}

function findUserById(id) {
  return readDB().users.find(u => u.id === id);
}

function createUser({ telegramId, password, token }) {
  const db = readDB();
  const tg = String(telegramId).trim();

  if (!/^\d+$/.test(tg)) throw new Error('Telegram ID must be numbers only');
  if (db.users.find(u => String(u.telegramId) === tg)) {
    throw new Error('This Telegram ID is already registered');
  }
  if (db.users.find(u => u.token === token)) {
    throw new Error('This hosting token is already linked to an account');
  }
  if (db.bannedTokens.includes(token)) throw new Error('This token is banned');
  if (!db.tokens[token]) {
    throw new Error('Invalid hosting token. Open the Telegram bot and send /start first.');
  }

  // Token must belong to this telegram id
  const tokenMeta = db.tokens[token];
  if (tokenMeta.telegramId && String(tokenMeta.telegramId) !== tg) {
    throw new Error('This token was generated for a different Telegram account');
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    telegramId: tg,
    password: hash,
    token,
    createdAt: new Date().toISOString(),
    banned: false
  };
  db.users.push(user);
  db.tokens[token].userId = user.id;
  if (!db.tokens[token].type) db.tokens[token].type = 'free';
  if (!db.tokens[token].maxBots) db.tokens[token].maxBots = db.settings.defaultMaxBots || 1;
  writeDB(db);
  return { id: user.id, telegramId: user.telegramId, token: user.token };
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password);
}

function getTokenInfo(token) {
  return readDB().tokens[token] || null;
}

function getUserBotCount(userId) {
  return readDB().bots.filter(b => b.userId === userId && b.status !== 'deleted').length;
}

function getUserMaxBots(user) {
  const info = readDB().tokens[user.token];
  if (!info) return 1;
  if (info.type === 'admin' || info.type === 'premium') return info.maxBots || 999;
  return info.maxBots || 1;
}

function isAdmin(telegramId) {
  return readDB().settings.adminIds.includes(Number(telegramId));
}

function banToken(token) {
  const db = readDB();
  if (!db.bannedTokens.includes(token)) db.bannedTokens.push(token);
  const user = db.users.find(u => u.token === token);
  if (user) user.banned = true;
  writeDB(db);
}

function unbanToken(token) {
  const db = readDB();
  db.bannedTokens = db.bannedTokens.filter(t => t !== token);
  const user = db.users.find(u => u.token === token);
  if (user) user.banned = false;
  writeDB(db);
}

function setTokenPremium(token, maxBots = 10) {
  const db = readDB();
  if (!db.tokens[token]) {
    db.tokens[token] = { type: 'premium', maxBots, createdAt: new Date().toISOString() };
  } else {
    db.tokens[token].type = 'premium';
    db.tokens[token].maxBots = maxBots;
  }
  writeDB(db);
}

function setTokenAdmin(token) {
  const db = readDB();
  if (!db.tokens[token]) {
    db.tokens[token] = { type: 'admin', maxBots: 999, createdAt: new Date().toISOString() };
  } else {
    db.tokens[token].type = 'admin';
    db.tokens[token].maxBots = 999;
  }
  writeDB(db);
}

function generateHostingToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = 'MITZ-';
  for (let i = 0; i < 4; i++) t += chars[Math.floor(Math.random() * chars.length)];
  t += '-';
  for (let i = 0; i < 4; i++) t += chars[Math.floor(Math.random() * chars.length)];
  t += '-';
  for (let i = 0; i < 4; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

// FIXED: only generate NEW token if user does not already have one
function registerOrGetToken(telegramId) {
  const db = readDB();
  const tg = Number(telegramId);

  // Already has a token linked to this telegram id?
  for (const [token, meta] of Object.entries(db.tokens)) {
    if (Number(meta.telegramId) === tg) {
      return { token, isNew: false };
    }
  }

  // Also check if they already registered as a user
  const existingUser = db.users.find(u => String(u.telegramId) === String(tg));
  if (existingUser) {
    return { token: existingUser.token, isNew: false };
  }

  const token = generateHostingToken();
  db.tokens[token] = {
    telegramId: tg,
    type: 'free',
    maxBots: db.settings.defaultMaxBots || 1,
    createdAt: new Date().toISOString(),
    userId: null
  };
  writeDB(db);
  return { token, isNew: true };
}

function getStats() {
  const db = readDB();
  const activeBots = db.bots.filter(b => b.status === 'running').length;
  const totalBots = db.bots.filter(b => b.status !== 'deleted').length;
  return {
    users: db.users.length,
    totalBots,
    activeBots,
    tokens: Object.keys(db.tokens).length,
    banned: db.bannedTokens.length,
    premium: Object.values(db.tokens).filter(t => t.type === 'premium' || t.type === 'admin').length
  };
}

module.exports = {
  readDB, writeDB, initDB,
  findUserByTelegramId, findUserById,
  createUser, verifyPassword,
  getTokenInfo, getUserBotCount, getUserMaxBots,
  isAdmin, banToken, unbanToken, setTokenPremium, setTokenAdmin,
  generateHostingToken, registerOrGetToken, getStats
};
