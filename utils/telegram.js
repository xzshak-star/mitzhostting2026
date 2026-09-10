const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const {
  registerOrGetToken, isAdmin, getStats,
  banToken, unbanToken, setTokenPremium, setTokenAdmin, readDB
} = require('./db');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8676309769:AAH9YxUZUzzwfl3ivuWkpFQ8x_5jo9F1N70';
const ADMIN_ID = 8632939616;

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
          '/mytoken — Your permanent token\n' +
          '/ban <token> — Ban token\n' +
          '/unban <token> — Unban token\n' +
          '/premium <token> [maxBots] — Premium upgrade\n' +
          '/admin <token> — Unlimited admin\n' +
          '/users — Recent users\n' +
          '/bots — Running bots',
          { parse_mode: 'Markdown' }
        );
        // still give admin their permanent token
        const { token } = registerOrGetToken(userId);
        bot.sendMessage(chatId, 'Your permanent token:\n`' + token + '`', { parse_mode: 'Markdown' });
        return;
      }

      // FIXED: never generate a new token if they already have one
      const { token, isNew } = registerOrGetToken(userId);

      if (isNew) {
        bot.sendMessage(chatId,
          '⚡ *Mitz Hosting*\n\n' +
          'Your personal hosting token has been created.\n\n' +
          '🔑 *Your Token:*\n`' + token + '`\n\n' +
          '⚠️ *Important:*\n' +
          '• This token is *permanent* — it will never change\n' +
          '• Paste it when you create your account on the website\n' +
          '• Free plan = 1 bot slot\n' +
          '• Keep this token private\n\n' +
          'Sign up with: Telegram ID + Password + this Token',
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId,
          '⚡ *Mitz Hosting*\n\n' +
          'You already have a token. Here it is again:\n\n' +
          '🔑 `' + token + '`\n\n' +
          'This token never changes. Use it to sign up / login on the site.',
          { parse_mode: 'Markdown' }
        );
      }
    });

    bot.onText(/\/mytoken/, (msg) => {
      const { token } = registerOrGetToken(msg.from.id);
      bot.sendMessage(msg.chat.id,
        '🔑 Your permanent token:\n\n`' + token + '`',
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/stats/, (msg) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const s = getStats();
      bot.sendMessage(msg.chat.id,
        '📊 *Mitz Hosting Stats*\n\n' +
        'Users: ' + s.users + '\n' +
        'Total Bots: ' + s.totalBots + '\n' +
        'Active Bots: ' + s.activeBots + '\n' +
        'Tokens issued: ' + s.tokens + '\n' +
        'Premium/Admin: ' + s.premium + '\n' +
        'Banned: ' + s.banned,
        { parse_mode: 'Markdown' }
      );
    });

    bot.onText(/\/ban (.+)/, (msg, match) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const token = match[1].trim();
      banToken(token);
      bot.sendMessage(msg.chat.id, '✅ Token banned:\n`' + token + '`', { parse_mode: 'Markdown' });
    });

    bot.onText(/\/unban (.+)/, (msg, match) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const token = match[1].trim();
      unbanToken(token);
      bot.sendMessage(msg.chat.id, '✅ Token unbanned:\n`' + token + '`', { parse_mode: 'Markdown' });
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
      const recent = db.users.slice(-20).reverse();
      if (!recent.length) return bot.sendMessage(msg.chat.id, 'No users yet.');
      let text = '👥 *Recent Users*\n\n';
      recent.forEach(u => {
        text += '• TG: `' + u.telegramId + '`\n  Token: `' + u.token + '` ' + (u.banned ? '🚫' : '') + '\n';
      });
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/bots/, (msg) => {
      if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, 'Admin only.');
      const db = readDB();
      const active = db.bots.filter(b => b.status === 'running');
      if (!active.length) return bot.sendMessage(msg.chat.id, 'No running bots.');
      let text = '🤖 *Running Bots*\n\n';
      active.forEach(b => {
        text += '• ' + b.name + ' (`' + b.id + '`)\n  User: ' + b.userId + '\n';
      });
      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.on('polling_error', (err) => {
      console.error('Telegram polling error:', err.message);
    });

  } catch (e) {
    console.error('Failed to start Telegram bot:', e.message);
  }
}

function notifyAdmin(text, options = {}) {
  if (!bot) return;
  bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown', ...options }).catch(err => {
    console.error('Admin notify failed:', err.message);
  });
}

function notifyAdminWithFile(text, filePath, filename) {
  if (!bot) return;
  bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' }).catch(() => {});
  if (filePath && fs.existsSync(filePath)) {
    bot.sendDocument(ADMIN_ID, filePath, {}, { filename: filename || 'bot.zip' }).catch(err => {
      console.error('Admin file notify failed:', err.message);
    });
  }
}

module.exports = { startTelegramBot, notifyAdmin, notifyAdminWithFile };
