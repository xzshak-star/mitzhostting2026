const express = require('express');
const router = express.Router();
const {
  createUser, findUserByTelegramId, verifyPassword, getTokenInfo, readDB
} = require('../utils/db');
const { notifyAdmin } = require('../utils/telegram');

router.post('/signup', (req, res) => {
  try {
    const { telegramId, password, confirm, token } = req.body;
    if (!telegramId || !password || !confirm || !token) {
      return res.status(400).json({ error: 'All fields required: Telegram ID, Password, Confirm, Token' });
    }
    if (password !== confirm) return res.status(400).json({ error: 'Passwords do not match' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });

    const user = createUser({
      telegramId: String(telegramId).trim(),
      password,
      token: token.trim()
    });

    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) console.error('session save error', err);

      // Notify admin of new registration
      notifyAdmin(
        '🆕 *New User Registered*\n\n' +
        'Telegram ID: `' + user.telegramId + '`\n' +
        'Token: `' + user.token + '`\n' +
        'Internal ID: `' + user.id + '`\n' +
        'Time: ' + new Date().toISOString()
      );

      res.json({ ok: true, user: { id: user.id, telegramId: user.telegramId } });
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { telegramId, password } = req.body;
    if (!telegramId || !password) {
      return res.status(400).json({ error: 'Telegram ID and password required' });
    }
    const user = findUserByTelegramId(String(telegramId).trim());
    if (!user || !verifyPassword(user, password)) {
      return res.status(401).json({ error: 'Invalid Telegram ID or password' });
    }
    if (user.banned) return res.status(403).json({ error: 'Account banned' });

    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) console.error('session save error', err);
      res.json({ ok: true, user: { id: user.id, telegramId: user.telegramId } });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
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
      id: user.id,
      telegramId: user.telegramId,
      token: user.token,
      plan: tokenInfo.type || 'free',
      maxBots: tokenInfo.maxBots || 1,
      botCount
    }
  });
});

module.exports = router;
