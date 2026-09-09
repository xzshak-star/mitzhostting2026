const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bots');
const adminRoutes = require('./routes/admin');
const { initDB } = require('./utils/db');
const { startTelegramBot } = require('./utils/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

['data', 'data/bots', 'data/uploads'].forEach(d => {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'mitz-hosting-secret-axion-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'signup.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'docs.html')));
app.get('/help', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'help.html')));
app.get('/get-started', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'get-started.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'admin.html')));

startTelegramBot();

app.listen(PORT, () => console.log('Mitz Hosting running on port ' + PORT));
