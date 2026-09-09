const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { readDB, writeDB, getUserMaxBots, findUserById } = require('../utils/db');
const { extractZip, startBot, stopBot, getLogs, deleteBotFiles, detectEntryPoint } = require('../utils/runner');

const upload = multer({ dest: path.join(__dirname, '..', 'data', 'uploads') });

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const db = readDB();
  const bots = db.bots.filter(b => b.userId === req.session.userId && b.status !== 'deleted');
  res.json({ ok: true, bots });
});

router.post('/deploy', upload.single('file'), (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Bot name required' });
    if (!req.file) return res.status(400).json({ error: 'ZIP file required' });

    const user = findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });

    const db = readDB();
    const current = db.bots.filter(b => b.userId === user.id && b.status !== 'deleted').length;
    const max = getUserMaxBots(user);
    if (current >= max) {
      return res.status(403).json({ error: 'Bot limit reached (' + max + '). Delete a bot or upgrade.' });
    }

    const botId = 'bot_' + uuidv4().slice(0, 8);
    const workDir = path.join(__dirname, '..', 'data', 'bots', botId);
    extractZip(req.file.path, workDir);
    try { fs.unlinkSync(req.file.path); } catch (_) {}

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

    const result = startBot(botId);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to start', bot });
    }
    res.json({ ok: true, bot: readDB().bots.find(b => b.id === botId), entry: result.entry });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/start', (req, res) => {
  const db = readDB();
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  const result = startBot(bot.id);
  if (!result.ok) return res.status(500).json({ error: result.error });
  res.json({ ok: true, bot: readDB().bots.find(b => b.id === bot.id) });
});

router.post('/:id/stop', (req, res) => {
  const db = readDB();
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  stopBot(bot.id);
  res.json({ ok: true, bot: readDB().bots.find(b => b.id === bot.id) });
});

router.post('/:id/restart', (req, res) => {
  const db = readDB();
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  stopBot(bot.id);
  setTimeout(() => {
    const result = startBot(bot.id);
    res.json({ ok: result.ok, bot: readDB().bots.find(b => b.id === bot.id), error: result.error });
  }, 800);
});

router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  const db = readDB();
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  if (name && name.trim()) bot.name = name.trim();
  if (description !== undefined) bot.description = String(description).trim();
  writeDB(db);
  res.json({ ok: true, bot });
});

router.delete('/:id', (req, res) => {
  const db = readDB();
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  deleteBotFiles(bot.id);
  bot.status = 'deleted';
  writeDB(db);
  res.json({ ok: true });
});

router.get('/:id/logs', (req, res) => {
  const db = readDB();
  const bot = db.bots.find(b => b.id === req.params.id && b.userId === req.session.userId);
  if (!bot) return res.status(404).json({ error: 'Bot not found' });
  res.json({ ok: true, logs: getLogs(bot.id) });
});

module.exports = router;
