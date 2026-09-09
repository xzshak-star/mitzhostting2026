const express = require('express');
const router = express.Router();
const { readDB, getStats, banToken, unbanToken, setTokenPremium, setTokenAdmin, findUserById } = require('../utils/db');

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const info = readDB().tokens[user.token];
  if (!info || info.type !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

router.use(requireAdmin);

router.get('/stats', (req, res) => {
  res.json({ ok: true, stats: getStats() });
});

router.get('/users', (req, res) => {
  const db = readDB();
  const users = db.users.map(u => ({
    id: u.id, username: u.username, email: u.email, token: u.token,
    banned: u.banned, createdAt: u.createdAt,
    plan: (db.tokens[u.token] || {}).type || 'free',
    maxBots: (db.tokens[u.token] || {}).maxBots || 1,
    botCount: db.bots.filter(b => b.userId === u.id && b.status !== 'deleted').length
  }));
  res.json({ ok: true, users });
});

router.get('/bots', (req, res) => {
  const db = readDB();
  res.json({ ok: true, bots: db.bots.filter(b => b.status !== 'deleted') });
});

router.post('/ban', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  banToken(token);
  res.json({ ok: true });
});

router.post('/unban', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  unbanToken(token);
  res.json({ ok: true });
});

router.post('/premium', (req, res) => {
  const { token, maxBots } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  setTokenPremium(token, parseInt(maxBots) || 10);
  res.json({ ok: true });
});

router.post('/admin', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  setTokenAdmin(token);
  res.json({ ok: true });
});

module.exports = router;
