const express = require('express');
const router = express.Router();
const { createUser, findUserByEmail, verifyPassword, getTokenInfo, readDB } = require('../utils/db');

router.post('/signup', (req, res) => {
  try {
    const { username, email, password, confirm, token } = req.body;
    if (!username || !email || !password || !confirm || !token)
      return res.status(400).json({ error: 'All fields required including hosting token' });
    if (password !== confirm) return res.status(400).json({ error: 'Passwords do not match' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Invalid email' });
    const user = createUser({ username, email, password, token: token.trim() });
    req.session.userId = user.id;
    res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = findUserByEmail(email);
    if (!user || !verifyPassword(user, password))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    req.session.userId = user.id;
    res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const db = readDB();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.banned) return res.status(403).json({ error: 'Account banned' });
  const tokenInfo = getTokenInfo(user.token) || { type: 'free', maxBots: 1 };
  const botCount = db.bots.filter(b => b.userId === user.id && b.status !== 'deleted').length;
  res.json({
    ok: true,
    user: {
      id: user.id, username: user.username, email: user.email, token: user.token,
      plan: tokenInfo.type || 'free', maxBots: tokenInfo.maxBots || 1, botCount
    }
  });
});

module.exports = router;
