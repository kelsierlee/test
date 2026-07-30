const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'guestbook.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/messages', (req, res) => {
  const rows = db
    .prepare('SELECT id, name, message, created_at FROM messages ORDER BY id DESC LIMIT 200')
    .all();
  res.json(rows);
});

app.post('/api/messages', (req, res) => {
  const { name, message } = req.body || {};
  if (typeof name !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ error: 'name and message are required' });
  }
  const cleanName = name.trim().slice(0, 60);
  const cleanMessage = message.trim().slice(0, 300);
  if (!cleanName || !cleanMessage) {
    return res.status(400).json({ error: 'name and message cannot be empty' });
  }
  const result = db
    .prepare('INSERT INTO messages (name, message) VALUES (?, ?)')
    .run(cleanName, cleanMessage);
  const row = db
    .prepare('SELECT id, name, message, created_at FROM messages WHERE id = ?')
    .get(result.lastInsertRowid);
  res.status(201).json(row);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
