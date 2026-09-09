const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { readDB, writeDB } = require('./db');

const processes = new Map();

function detectEntryPoint(dir) {
  const files = fs.readdirSync(dir);
  const preferred = ['main.py', 'bot.py', 'app.py', 'index.py', 'run.py'];
  for (const p of preferred) if (files.includes(p)) return p;
  const pyFiles = files.filter(f => f.endsWith('.py') && fs.statSync(path.join(dir, f)).isFile());
  if (pyFiles.length === 1) return pyFiles[0];
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      const sub = fs.readdirSync(full).filter(x => x.endsWith('.py'));
      if (sub.includes('main.py')) return path.join(f, 'main.py');
      if (sub.length === 1) return path.join(f, sub[0]);
    }
  }
  return pyFiles[0] || null;
}

function extractZip(zipPath, destDir) {
  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  const items = fs.readdirSync(destDir);
  if (items.length === 1) {
    const only = path.join(destDir, items[0]);
    if (fs.statSync(only).isDirectory()) {
      fs.readdirSync(only).forEach(f => fs.renameSync(path.join(only, f), path.join(destDir, f)));
      fs.rmSync(only, { recursive: true, force: true });
    }
  }
  return destDir;
}

function startBot(botId) {
  const db = readDB();
  const bot = db.bots.find(b => b.id === botId);
  if (!bot) return { ok: false, error: 'Bot not found' };
  if (processes.has(botId)) {
    try { processes.get(botId).kill(); } catch (_) {}
    processes.delete(botId);
  }
  const workDir = path.join(__dirname, '..', 'data', 'bots', botId);
  if (!fs.existsSync(workDir)) return { ok: false, error: 'Bot files missing' };
  const entry = bot.entryPoint || detectEntryPoint(workDir);
  if (!entry) return { ok: false, error: 'No Python entry point found (.py)' };
  bot.entryPoint = entry;
  bot.status = 'starting';
  writeDB(db);

  const logFile = path.join(workDir, 'bot.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const child = spawn('python3', [entry], {
    cwd: workDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  processes.set(botId, child);
  child.stdout.on('data', d => logStream.write(d));
  child.stderr.on('data', d => logStream.write(d));
  child.on('exit', (code) => {
    processes.delete(botId);
    logStream.end();
    const db2 = readDB();
    const b = db2.bots.find(x => x.id === botId);
    if (b && b.status !== 'stopped' && b.status !== 'deleted') {
      b.status = 'stopped';
      b.lastExit = code;
      writeDB(db2);
    }
  });
  bot.status = 'running';
  bot.startedAt = new Date().toISOString();
  bot.pid = child.pid;
  writeDB(db);
  return { ok: true, entry, pid: child.pid };
}

function stopBot(botId) {
  const child = processes.get(botId);
  if (child) { try { child.kill('SIGTERM'); } catch (_) {} processes.delete(botId); }
  const db = readDB();
  const bot = db.bots.find(b => b.id === botId);
  if (bot) { bot.status = 'stopped'; writeDB(db); }
  return { ok: true };
}

function getLogs(botId, lines = 120) {
  const logFile = path.join(__dirname, '..', 'data', 'bots', botId, 'bot.log');
  if (!fs.existsSync(logFile)) return '';
  return fs.readFileSync(logFile, 'utf8').split('\n').slice(-lines).join('\n');
}

function deleteBotFiles(botId) {
  stopBot(botId);
  const dir = path.join(__dirname, '..', 'data', 'bots', botId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { detectEntryPoint, extractZip, startBot, stopBot, getLogs, deleteBotFiles, processes };
