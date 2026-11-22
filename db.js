import Database from 'better-sqlite3';

const db = new Database('oxygen.sqlite');
db.pragma('journal_mode = WAL');

// Таблица для временных кодов подтверждения при регистрации
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_registrations (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    verified INTEGER DEFAULT 0
  )
`);

// Таблица зарегистрированных пользователей OxyGen
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;
