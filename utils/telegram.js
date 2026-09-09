const TelegramBot = require('node-telegram-bot-api');
const {
  generateHostingToken, registerToken, isAdmin, getStats,
  banToken, unbanToken, setTokenPremium, setTokenAdmin, readDB
} = require('./db');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8676309769:AAH9YxUZUzzwfl3ivuWkpFQ8x_5jo9F1N70';

let bot = null;

function startTelegramBot() {
  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log('Telegram bot started');

    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;

      if (isAdmin(userId)) {
        bot.sendMessage(chatId,
          '👑 *Admin Panel — Mitz Hosting*\n\n' +
          'Commands:\n' +
          '/stats — Platform stats\n' +
          '/token — Generate hosting token\n' +
          '/ban <token> — Ban token\n' +
          '/unban <token> — Unban token\n' +
          '/premium <token> [maxBots] — Premium upgrade\n' +
          '/admin <token> — Unlimited admin\n' +
          '/users — Recent users\n' +
          '/bots — Running bots',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const token = generateHostingToken();
      registerToken(token, userId);
      bot.sendMessage(chatId,
        '⚡ *Mitz Hosting*\n\n' +
        'Your personal hosting token:\n\n' +
        '`' + token + '`\n\n' +
        '⚠️ This token is permanent — cannot be changed or revoked by you.\n' +
        'Paste it when you Sign Up on the website.\n' +
        'Free plan = 1 bot slot.',
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/token/, (msg) => {
      const token = generateHostingToken();
      registerToken(token, msg.from.id);
      bot.sendMessage(msg.chat.id,
        '🔑 New token:\n\n`' + token + '`\n\nPaste on Sign Up. Free = 1 bot.',
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/stats/, (msg) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const s = getStats();
      bot.sendMessage(msg.chat.id,
        '📊 *Stats*\n\nUsers: ' + s.users +
        '\nTotal Bots: ' + s.totalBots +
        '\nActive: ' + s.activeBots +
        '\nTokens: ' + s.tokens +
        '\nPremium: ' + s.premium +
        '\nBanned: ' + s.banned,
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/ban (.+)/, (msg, match) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      banToken(match[1].trim());
      bot.sendMessage(msg.chat.id, '✅ Banned:\n`' + match[1].trim() + '`', { parse_mode: 'Markdown' });
    });

    bot.onText(/\/unban (.+)/, (msg, match) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      unbanToken(match[1].trim());
      bot.sendMessage(msg.chat.id, '✅ Unbanned:\n`' + match[1].trim() + '`', { parse_mode: 'Markdown' });
    });

    bot.onText(/\/premium (.+)/, (msg, match) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const parts = match[1].trim().split(/\s+/);
      const token = parts[0];
      const maxBots = parseInt(parts[1]) || 10;
      setTokenPremium(token, maxBots);
      bot.sendMessage(msg.chat.id,
        'Success!\n\nYou can host up to *' + maxBots + '* bots.\n\nToken: `' + token + '`',
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/admin (.+)/, (msg, match) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const token = match[1].trim();
      setTokenAdmin(token);
      bot.sendMessage(msg.chat.id,
        'Success!\n\nYou can host unlimited bots.\n\nToken: `' + token + '`',
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/users/, (msg) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const db = readDB();
      const recent = db.users.slice(-15).reverse();
      if (!recent.length) return bot.sendMessage(msg.chat.id, 'No users yet.');
      let text = '👥 *Users*\n\n';
      recent.forEach(u => {
        text += '• ' + u.username + ' | ' + u.email + '\n  `' + u.token + '` ' + (u.banned ? '🚫' : '') + '\n';
      });
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/bots/, (msg) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const active = readDB().bots.filter(b => b.status === 'running');
      if (!active.length) return bot.sendMessage(msg.chat.id, 'No running bots.');
      let text = '🤖 *Running*\n\n';
      active.forEach(b => { text += '• ' + b.name + ' (' + b.id + ')\n'; });
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.on('polling_error', (err) => console.error('TG error:', err.message));
  } catch (e) {
    console.error('TG start failed:', e.message);
  }
}

module.exports = { startTelegramBot };
