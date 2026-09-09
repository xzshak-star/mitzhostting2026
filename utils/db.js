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
    if (!fs.existsSync(DB_PATH)) { writeDB(defaultDB); return JSON.parse(JSON.stringify(defaultDB)); }
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

function findUserByEmail(email) {
  return readDB().users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
}

function findUserById(id) {
  return readDB().users.find(u => u.id === id);
}

function createUser({ username, email, password, token }) {
  const db = readDB();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already registered');
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('Username already taken');
  if (db.users.find(u => u.token === token)) throw new Error('This hosting token is already linked');
  if (db.bannedTokens.includes(token)) throw new Error('This token is banned');
  if (!db.tokens[token]) throw new Error('Invalid hosting token. Get one from our Telegram bot first (/start).');

  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    username, email, password: hash, token,
    createdAt: new Date().toISOString(), banned: false
  };
  db.users.push(user);
  db.tokens[token].userId = user.id;
  if (!db.tokens[token].type) db.tokens[token].type = 'free';
  if (!db.tokens[token].maxBots) db.tokens[token].maxBots = db.settings.defaultMaxBots || 1;
  writeDB(db);
  return { id: user.id, username: user.username, email: user.email, token: user.token };
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
  if (!db.tokens[token]) db.tokens[token] = { type: 'premium', maxBots, createdAt: new Date().toISOString() };
  else { db.tokens[token].type = 'premium'; db.tokens[token].maxBots = maxBots; }
  writeDB(db);
}

function setTokenAdmin(token) {
  const db = readDB();
  if (!db.tokens[token]) db.tokens[token] = { type: 'admin', maxBots: 999, createdAt: new Date().toISOString() };
  else { db.tokens[token].type = 'admin'; db.tokens[token].maxBots = 999; }
  writeDB(db);
}

function generateHostingToken() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let t = 'MITZ-';
  for (let i = 0; i < 4; i++) t += c[Math.floor(Math.random() * c.length)];
  t += '-';
  for (let i = 0; i < 4; i++) t += c[Math.floor(Math.random() * c.length)];
  t += '-';
  for (let i = 0; i < 4; i++) t += c[Math.floor(Math.random() * c.length)];
  return t;
}

function registerToken(token, telegramId) {
  const db = readDB();
  if (db.tokens[token]) return false;
  db.tokens[token] = {
    telegramId: Number(telegramId), type: 'free',
    maxBots: db.settings.defaultMaxBots || 1,
    createdAt: new Date().toISOString(), userId: null
  };
  writeDB(db);
  return true;
}

function getStats() {
  const db = readDB();
  return {
    users: db.users.length,
    totalBots: db.bots.filter(b => b.status !== 'deleted').length,
    activeBots: db.bots.filter(b => b.status === 'running').length,
    tokens: Object.keys(db.tokens).length,
    banned: db.bannedTokens.length,
    premium: Object.values(db.tokens).filter(t => t.type === 'premium' || t.type === 'admin').length
  };
}

module.exports = {
  readDB, writeDB, initDB, findUserByEmail, findUserById, createUser, verifyPassword,
  getTokenInfo, getUserBotCount, getUserMaxBots, isAdmin, banToken, unbanToken,
  setTokenPremium, setTokenAdmin, generateHostingToken, registerToken, getStats
};
