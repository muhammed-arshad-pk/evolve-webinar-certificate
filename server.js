const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'feedback.jsonl');

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/jspdf/dist')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATING_FIELDS = ['overall', 'content', 'speaker'];

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return fs.readFileSync(DATA_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function findByEmail(email) {
  const all = readAll();
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].email === email) return all[i];
  }
  return null;
}

app.post('/api/feedback', (req, res) => {
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
  fs.appendFileSync(DATA_FILE, JSON.stringify(entry) + '\n');
  res.json({ ok: true, name: entry.name });
});

// Lets returning participants re-download their certificate.
app.get('/api/certificate', (req, res) => {
  const email = clean(req.query.email, 120).toLowerCase();
  const entry = EMAIL_RE.test(email) && findByEmail(email);
  if (!entry) return res.status(404).json({ ok: false, error: 'No feedback found for this email. Please fill the feedback form first.' });
  res.json({ ok: true, name: entry.name });
});

// Admin export: /admin/feedback.csv?key=YOUR_ADMIN_KEY
app.get('/admin/feedback.csv', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).send('Unauthorized');
  const cols = ['submittedAt', 'name', 'email', 'phone', 'organization', 'designation',
    'overall', 'content', 'speaker', 'recommend', 'liked', 'suggestions'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // block spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = readAll().map((e) => cols.map((c) => esc(e[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="webinar-feedback.csv"');
  res.send('﻿' + [cols.join(','), ...rows].join('\r\n'));
});

app.listen(PORT, () => {
  console.log(`Certificate site running at http://localhost:${PORT}`);
  if (ADMIN_KEY === 'change-me') console.warn('WARNING: set the ADMIN_KEY environment variable before going live.');
});
