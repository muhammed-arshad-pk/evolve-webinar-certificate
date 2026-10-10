const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';
const DATA_FILE = path.join(__dirname, 'data', 'feedback.jsonl');

// Upstash Redis (used on Vercel). The Vercel/Upstash integration sets one of these pairs.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATING_FIELDS = ['overall', 'content', 'speaker'];

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ===== Storage: Redis when configured, otherwise a local JSONL file =====
async function redis(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  const out = await res.json();
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(failed.error);
  return out.map((r) => r.result);
}

function readFileEntries() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs.readFileSync(DATA_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

const store = REDIS_URL && REDIS_TOKEN ? {
  async add(entry) {
    await redis([
      ['RPUSH', 'feedback', JSON.stringify(entry)],
      ['HSET', 'feedback:names', entry.email, entry.name],
    ]);
  },
  async findName(email) {
    const [name] = await redis([['HGET', 'feedback:names', email]]);
    return name || null;
  },
  async all() {
    const [rows] = await redis([['LRANGE', 'feedback', 0, -1]]);
    return rows.map((r) => JSON.parse(r));
  },
} : {
  async add(entry) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + '\n');
  },
  async findName(email) {
    const match = readFileEntries().filter((e) => e.email === email).pop();
    return match ? match.name : null;
  },
  async all() {
    return readFileEntries();
  },
};

app.post('/api/feedback', async (req, res) => {
  const b = req.body || {};
  const entry = {
    name: clean(b.name, 60),
    email: clean(b.email, 120).toLowerCase(),
    phone: clean(b.phone, 20),
    organization: clean(b.organization, 120),
    designation: clean(b.designation, 80),
    liked: clean(b.liked, 1000),
    suggestions: clean(b.suggestions, 1000),
    recommend: clean(b.recommend, 10),
  };

  const errors = [];
  if (entry.name.length < 2) errors.push('Please enter your full name.');
  if (!EMAIL_RE.test(entry.email)) errors.push('Please enter a valid email address.');
  for (const f of RATING_FIELDS) {
    const n = Number(b[f]);
    if (!Number.isInteger(n) || n < 1 || n > 5) errors.push('Please answer all rating questions.');
    entry[f] = n;
  }
  if (!['yes', 'maybe', 'no'].includes(entry.recommend)) errors.push('Please tell us if you would recommend this webinar.');
  if (errors.length) return res.status(400).json({ ok: false, error: [...new Set(errors)][0] });

  entry.submittedAt = new Date().toISOString();
  try {
    await store.add(entry);
  } catch (err) {
    console.error('Failed to save feedback:', err);
    return res.status(500).json({ ok: false, error: 'Could not save your feedback. Please try again.' });
  }
  res.json({ ok: true, name: entry.name });
});

// Lets returning participants re-download their certificate.
app.get('/api/certificate', async (req, res) => {
  const email = clean(req.query.email, 120).toLowerCase();
  let name = null;
  try {
    name = EMAIL_RE.test(email) ? await store.findName(email) : null;
  } catch (err) {
    console.error('Lookup failed:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
  if (!name) return res.status(404).json({ ok: false, error: 'No feedback found for this email. Please fill the feedback form first.' });
  res.json({ ok: true, name });
});

// Admin export: /admin/feedback.csv?key=YOUR_ADMIN_KEY
app.get('/admin/feedback.csv', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).send('Unauthorized');
  const cols = ['submittedAt', 'name', 'email', 'phone', 'organization', 'designation',
    'overall', 'content', 'speaker', 'recommend', 'liked', 'suggestions'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  let entries;
  try {
    entries = await store.all();
  } catch (err) {
    console.error('Export failed:', err);
    return res.status(500).send('Could not load feedback.');
  }
  const rows = entries.map((e) => cols.map((c) => esc(e[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="webinar-feedback.csv"');
  res.send('﻿' + [cols.join(','), ...rows].join('\r\n'));
});

if (ADMIN_KEY === 'change-me') console.warn('WARNING: set the ADMIN_KEY environment variable before going live.');
if (!REDIS_URL && process.env.VERCEL) console.error('ERROR: no Redis configured — add Upstash Redis in Vercel Storage so feedback can be saved.');

// Run directly with `npm start`; on Vercel the exported app is used instead.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Certificate site running at http://localhost:${PORT}`));
}

module.exports = app;
