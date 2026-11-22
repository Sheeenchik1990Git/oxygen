import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { sendVerificationCode } from './mailer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'oxygen_fallback_secret_2026';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { error: 'Слишком много запросов. Попробуйте через 15 минут.' },
});

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Шаг 1 регистрации: ввод почты и отправка 6-значного кода
app.post('/api/register/send-code', authLimiter, async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Введите корректный email' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Эта почта уже зарегистрирована. Попробуйте войти.' });
    }

    const code = generateCode();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    db.prepare(`
      INSERT INTO pending_registrations (email, code, expires_at, verified)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, verified = 0
    `).run(email, code, expiresAt);

    const delivery = await sendVerificationCode(email, code);

    res.json({
      message: delivery.mode === 'smtp'
        ? 'Код отправлен на вашу почту'
        : 'SMTP не настроен — код выведен в логи сервера',
    });
  } catch (err) {
    console.error('Ошибка отправки кода:', err);
    res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте настройки SMTP.' });
  }
});

// Шаг 2 регистрации: проверка 6-значного кода
app.post('/api/register/verify-code', authLimiter, (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  const code = req.body.code?.trim();

  const record = db.prepare('SELECT * FROM pending_registrations WHERE email = ?').get(email);
  if (!record) {
    return res.status(404).json({ error: 'Сначала запросите код подтверждения' });
  }
  if (record.code !== code) {
    return res.status(400).json({ error: 'Неверный код подтверждения' });
  }
  if (Date.now() > record.expires_at) {
    return res.status(400).json({ error: 'Срок действия кода истек. Запросите новый.' });
  }

  db.prepare('UPDATE pending_registrations SET verified = 1 WHERE email = ?').run(email);
  res.json({ message: 'Почта подтверждена! Придумайте пароль.' });
});

// Шаг 3 регистрации: установка пароля и создание аккаунта
app.post('/api/register/complete', authLimiter, async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 8 символов' });
    }

    const record = db.prepare('SELECT * FROM pending_registrations WHERE email = ?').get(email);
    if (!record || record.verified !== 1) {
      return res.status(403).json({ error: 'Сначала подтвердите почту кодом' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
    db.prepare('DELETE FROM pending_registrations WHERE email = ?').run(email);

    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '14d' });
    res.cookie('oxygen_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: 'Добро пожаловать в OxyGen!', email });
  } catch (err) {
    console.error('Ошибка завершения регистрации:', err);
    res.status(500).json({ error: 'Ошибка при создании аккаунта' });
  }
});

// Вход в аккаунт
app.post('/api/login', authLimiter, async (req, res) => {
  const email = req.body.email?.toLowerCase().trim();
  const password = req.body.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'Введите почту и пароль' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Неверная почта или пароль' });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Неверная почта или пароль' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '14d' });
  res.cookie('oxygen_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });

  res.json({ message: 'Вход выполнен', email: user.email });
});

// Проверка сессии
app.get('/api/me', (req, res) => {
  const token = req.cookies.oxygen_token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ email: decoded.email });
  } catch {
    res.clearCookie('oxygen_token');
    res.status(401).json({ error: 'Сессия истекла' });
  }
});

// Выход
app.post('/api/logout', (req, res) => {
  res.clearCookie('oxygen_token');
  res.json({ message: 'Вы вышли из OxyGen' });
});

app.listen(PORT, () => {
  console.log(`OxyGen запущен на порту ${PORT}`);
});
