const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

try { process.loadEnvFile(); } catch {}

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

app.post('/api/summary', async (req, res) => {
  const rows = db
    .prepare('SELECT name, message FROM messages ORDER BY id ASC')
    .all();

  if (rows.length === 0) {
    return res.json({ summary: 'No notes yet — the guestbook is empty.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const notesText = rows.map((r) => `- ${r.name}: ${r.message}`).join('\n');
  const prompt = `Summarize the following guestbook notes in exactly one sentence, capturing the overall tone and any common themes:\n\n${notesText}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'The AI summary service returned an error.' });
    }

    const data = await response.json();
    const summary = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text.trim()
      : 'The AI did not return a summary.';
    res.json({ summary });
  } catch (err) {
    console.error('Anthropic API request failed:', err);
    res.status(502).json({ error: 'Could not reach the AI summary service.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
