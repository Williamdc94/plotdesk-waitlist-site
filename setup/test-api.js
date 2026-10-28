// Local test: node setup/test-api.js
process.env.WAITLIST_WEBHOOK_URL = 'https://script.example/exec';
process.env.WAITLIST_WEBHOOK_SECRET = 's3cret';
process.env.RESEND_API_KEY = 're_test'; process.env.NOTIFY_EMAIL = 'me@example.com';
const calls = [];
global.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) });
  return url.includes('resend') ? { ok: true, text: async () => '{}' } : { ok: true, text: async () => '{"ok":true}' }; };
const handler = require('../api/waitlist.js');
function run(body, method = 'POST', ip = '1.1.1.1') {
  return new Promise((resolve) => { const r = { headers: {}, status(c) { this.code = c; return this; }, setHeader() {}, json(o) { resolve({ code: this.code, o }); return this; } };
    handler({ method, body, headers: { 'x-forwarded-for': ip }, socket: {} }, r); });
}
const good = { role: 'agency', name: 'Amaka Obi', email: 'Amaka@Example.com', phone: '+2348030000000', city: 'Port Harcourt', consent: true, company: '', ts: Date.now() - 10000 };
(async () => {
  console.log('good', await run(good), calls.length, calls[0].body.email, calls[0].body.phone);
  console.log('bad email', await run({ ...good, email: 'nope' }, 'POST', '2.2.2.2'));
  console.log('no consent', await run({ ...good, consent: false }, 'POST', '2.2.2.3'));
  console.log('honeypot', await run({ ...good, company: 'x' }, 'POST', '2.2.2.4'), calls.length);
  console.log('too fast', await run({ ...good, ts: Date.now() }, 'POST', '2.2.2.5'), calls.length);
  console.log('GET', await run(good, 'GET'));
  console.log('formula', await run({ ...good, name: '=HYPERLINK("x")' }, 'POST', '3.3.3.3'), calls[calls.length - 2].body.name);
  let last; for (let i = 0; i < 6; i++) last = await run(good, 'POST', '9.9.9.9');
  console.log('rate limit', last);
})();
