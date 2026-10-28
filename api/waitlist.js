// Vercel serverless function: POST /api/waitlist
// Saves each signup to a Google Sheet (via an Apps Script web app) and/or emails you a copy (via Resend).
// Secrets live in Vercel environment variables, never in the browser.
//
// Environment variables:
//   WAITLIST_WEBHOOK_URL    Apps Script web-app URL (see google-apps-script.gs)   [recommended]
//   WAITLIST_WEBHOOK_SECRET Same secret you put in the Apps Script properties
//   RESEND_API_KEY          Optional: email yourself each signup
//   NOTIFY_EMAIL            Where that email goes
//   RESEND_FROM             Optional sender, default "PlotDesk <onboarding@resend.dev>"

const ROLES = ['agency', 'landlord', 'renter'];
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map(); // best-effort, per warm server instance

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (typeof xf === 'string' && xf.split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) { for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); }
  return false;
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validate(b) {
  const errors = {};
  const rec = {
    role: clean(b.role, 20),
    name: clean(b.name, 100),
    email: clean(b.email, 254).toLowerCase(),
    phone: clean(b.phone, 20),
    city: clean(b.city, 80),
  };
  if (!ROLES.includes(rec.role)) errors.role = 'Please choose who you are.';
  if (rec.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rec.email)) errors.email = 'Please enter a valid email address.';
  if (rec.phone && !/^\+234\d{10}$/.test(rec.phone)) errors.phone = 'Enter the 10 digits after +234.';
  if (rec.city.length < 2) errors.city = 'Please enter your city.';
  if (b.consent !== true) errors.consent = 'Please tick the box so we can email you.';
  return { errors, rec };
}

// Spreadsheet formula injection guard: a cell that starts with = + - @ becomes text.
function safeCell(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function saveToSheet(rec) {
  const url = process.env.WAITLIST_WEBHOOK_URL;
  if (!url) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight on Apps Script
    body: JSON.stringify({
      secret: process.env.WAITLIST_WEBHOOK_SECRET || '',
      createdAt: new Date().toISOString(),
      role: rec.role, name: safeCell(rec.name), email: safeCell(rec.email), phone: safeCell(rec.phone), city: safeCell(rec.city),
    }),
    redirect: 'follow',
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
  return !!(res.ok && data && data.ok);
}

async function emailCopy(rec) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return null;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'PlotDesk <onboarding@resend.dev>',
      to: [to],
      reply_to: rec.email,
      subject: 'New PlotDesk early-access signup: ' + rec.name.replace(/[\r\n]/g, ' '),
      html: '<p><b>' + esc(rec.name) + '</b> joined the early-access list.</p><ul>' +
        '<li>I am: ' + esc(rec.role) + '</li><li>Email: ' + esc(rec.email) + '</li>' +
        '<li>Phone: ' + esc(rec.phone || '—') + '</li><li>City: ' + esc(rec.city) + '</li></ul>',
    }),
  });
  return res.ok;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body && typeof body === 'object' ? body : {};

  // Bots: filled the hidden field, or submitted within 3 seconds of loading the page. Pretend it worked.
  const tooFast = typeof body.ts === 'number' && Date.now() - body.ts < 3000;
  if (clean(body.company, 50) || tooFast) return res.status(200).json({ ok: true });

  if (rateLimited(clientIp(req))) return res.status(429).json({ ok: false, error: 'rate_limited' });

  const { errors, rec } = validate(body);
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  let saved = false;
  try { const r = await saveToSheet(rec); if (r) saved = true; if (r === false) console.error('Sheet webhook rejected the signup'); }
  catch (e) { console.error('Sheet webhook failed:', e && e.message); }
  try { const r = await emailCopy(rec); if (r) saved = true; if (r === false) console.error('Resend rejected the email'); }
  catch (e) { console.error('Resend failed:', e && e.message); }

  if (!saved) {
    console.error('Signup was NOT stored. Configure WAITLIST_WEBHOOK_URL and/or RESEND_API_KEY + NOTIFY_EMAIL.');
    return res.status(500).json({ ok: false, error: 'not_saved' });
  }
  return res.status(200).json({ ok: true });
};
