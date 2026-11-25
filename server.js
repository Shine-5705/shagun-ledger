// Shagun Ledger — tiny zero-dependency Node server (Node 18+).
// Serves the static UI, keeps the ledger in data/ledger.json, and proxies Sarvam AI,
// Flagsmith and NudgeBee so no secret key ever reaches the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseEntry, thankYouTemplate } = require('./public/parse.js');

const PORT = process.env.PORT || 8787;
const SARVAM_KEY = process.env.SARVAM_API_KEY || '';
const FLAGSMITH_KEY = process.env.FLAGSMITH_ENVIRONMENT_KEY || '';
const FLAGSMITH_API = process.env.FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/';
const NB_TOKEN = process.env.NUDGEBEE_API_TOKEN || '';
const NB_URL = process.env.NUDGEBEE_API_URL || 'https://app.nudgebee.com';
const DATA = path.join(__dirname, 'data', 'ledger.json');
const started = Date.now();
const metrics = { requests: 0, errors: 0, sarvam_calls: 0, sarvam_errors: 0, entries_added: 0 };

// Defaults used when Flagsmith is not configured or unreachable (shown in the UI as "defaults").
const DEFAULT_FLAGS = {
  voice_entry: { enabled: true, value: null },
  thank_you_generator: { enabled: true, value: null },
  rsvp_tracker: { enabled: true, value: null },
  languages: { enabled: true, value: 'hi-IN,en-IN,ta-IN,bn-IN,mr-IN,gu-IN' },
  shagun_suggestion: { enabled: false, value: '501,1100,2100,5100' },
};
let flagCache = { at: 0, flags: DEFAULT_FLAGS, source: 'defaults' };

async function getFlags() {
  if (!FLAGSMITH_KEY) return { flags: DEFAULT_FLAGS, source: 'defaults (no FLAGSMITH_ENVIRONMENT_KEY)' };
  if (Date.now() - flagCache.at < 15000) return flagCache;
  try {
    const r = await fetch(FLAGSMITH_API + 'flags/', { headers: { 'X-Environment-Key': FLAGSMITH_KEY } });
    if (!r.ok) throw new Error('Flagsmith HTTP ' + r.status);
    const arr = await r.json();
    const flags = { ...DEFAULT_FLAGS };
    for (const f of arr) flags[f.feature.name] = { enabled: f.enabled, value: f.feature_state_value };
    flagCache = { at: Date.now(), flags, source: 'flagsmith' };
  } catch (e) { flagCache = { at: Date.now(), flags: DEFAULT_FLAGS, source: 'defaults (Flagsmith error: ' + e.message + ')' }; }
  return flagCache;
}

async function sarvam(pathname, body, isForm) {
  metrics.sarvam_calls++;
  const r = await fetch('https://api.sarvam.ai' + pathname, {
    method: 'POST',
    headers: isForm ? { 'api-subscription-key': SARVAM_KEY } : { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { metrics.sarvam_errors++; throw new Error('Sarvam ' + r.status + ' ' + JSON.stringify(j).slice(0, 200)); }
  return j;
}

function load() { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return { entries: [], rsvps: [] }; } }
function save(d) { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); }
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
async function readBody(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); }

// Parse a spoken/typed entry: Sarvam LLM (sarvam-m) → JSON, else rule-based parser.
async function smartParse(text) {
  const rules = parseEntry(text);
  if (!SARVAM_KEY) return rules;
  try {
    const j = await sarvam('/v1/chat/completions', {
      model: 'sarvam-m', temperature: 0,
      messages: [
        { role: 'system', content: 'Extract a wedding shagun (gift) ledger entry from Hindi/Hinglish/English text. Reply ONLY with JSON: {"guest": string, "amount": number|null (rupees), "gift": string|null, "relation": string|null, "language": "hi-IN"|"en-IN"|other BCP-47}.' },
        { role: 'user', content: text },
      ],
    });
    const content = j.choices[0].message.content.replace(/<think>[\s\S]*?<\/think>/g, '');
    const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    return { ...rules, ...parsed, raw: text, parser: 'sarvam-m' };
  } catch (e) { return { ...rules, parser: 'rules (sarvam fallback: ' + e.message.slice(0, 80) + ')' }; }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  metrics.requests++;
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, uptime_s: Math.round((Date.now() - started) / 1000) });
    if (url.pathname === '/metrics') { // Prometheus text format, scraped in-cluster and visible to NudgeBee
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(Object.entries(metrics).map(([k, v]) => `shagun_${k}_total ${v}`).join('\n') + '\n');
    }
    if (url.pathname === '/api/status') {
      const f = await getFlags();
      return send(res, 200, { sarvam: !!SARVAM_KEY, flagsmith: f.source, nudgebee: !!NB_TOKEN });
    }
    if (url.pathname === '/api/flags') return send(res, 200, await getFlags());
    if (url.pathname === '/api/ledger' && req.method === 'GET') return send(res, 200, load());
    if (url.pathname === '/api/parse' && req.method === 'POST') {
      const { text } = JSON.parse(await readBody(req)); return send(res, 200, await smartParse(text));
    }
    if (url.pathname === '/api/entries' && req.method === 'POST') {
      const e = JSON.parse(await readBody(req)); const d = load();
      e.id = Date.now().toString(36); e.at = new Date().toISOString(); d.entries.unshift(e); save(d); metrics.entries_added++;
      return send(res, 200, e);
    }
    if (url.pathname.startsWith('/api/entries/') && req.method === 'DELETE') {
      const id = url.pathname.split('/').pop(); const d = load(); d.entries = d.entries.filter(x => x.id !== id); save(d); return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/rsvps' && req.method === 'POST') {
      const r = JSON.parse(await readBody(req)); const d = load(); r.id = Date.now().toString(36);
      d.rsvps = d.rsvps.filter(x => x.name.toLowerCase() !== r.name.toLowerCase()); d.rsvps.unshift(r); save(d); return send(res, 200, r);
    }
    if (url.pathname === '/api/stt' && req.method === 'POST') { // body: raw audio (wav/webm)
      const { flags } = await getFlags();
      if (!flags.voice_entry.enabled) return send(res, 403, { error: 'voice_entry flag is off' });
      if (!SARVAM_KEY) return send(res, 503, { error: 'SARVAM_API_KEY not set' });
      const buf = await readBody(req); const fd = new FormData();
      fd.append('file', new Blob([buf], { type: req.headers['content-type'] || 'audio/wav' }), 'entry.wav');
      fd.append('model', 'saarika:v2.5'); fd.append('language_code', 'unknown');
      const j = await sarvam('/speech-to-text', fd, true);
      return send(res, 200, { transcript: j.transcript, language: j.language_code, entry: await smartParse(j.transcript) });
    }
    if (url.pathname === '/api/thankyou' && req.method === 'POST') {
      const { flags } = await getFlags();
      if (!flags.thank_you_generator.enabled) return send(res, 403, { error: 'thank_you_generator flag is off' });
      const { entry, lang } = JSON.parse(await readBody(req));
      const english = thankYouTemplate(entry, 'en-IN');
      if (!SARVAM_KEY) return send(res, 200, { note: thankYouTemplate(entry, lang), engine: 'template (no SARVAM_API_KEY)' });
      if (lang === 'en-IN') return send(res, 200, { note: english, engine: 'template' });
      const j = await sarvam('/translate', { input: english, source_language_code: 'en-IN', target_language_code: lang, model: 'mayura:v1', mode: 'formal' });
      return send(res, 200, { note: j.translated_text, engine: 'sarvam mayura:v1 translate' });
    }
    if (url.pathname === '/api/tts' && req.method === 'POST') {
      if (!SARVAM_KEY) return send(res, 503, { error: 'SARVAM_API_KEY not set' });
      const { text, lang } = JSON.parse(await readBody(req));
      const j = await sarvam('/text-to-speech', { text, target_language_code: lang, model: 'bulbul:v2', speaker: 'anushka' });
      return send(res, 200, { audio: j.audios && j.audios[0] });
    }
    if (url.pathname === '/api/ops' && req.method === 'GET') { // NudgeBee: list recent events/recommendations for our account
      if (!NB_TOKEN) return send(res, 200, { source: 'local', note: 'NUDGEBEE_API_TOKEN not set — showing local metrics only', metrics });
      const r = await fetch(NB_URL + '/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + NB_TOKEN },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'recommendations_list', params: { limit: 5 } }) });
      return send(res, 200, { source: 'nudgebee', result: await r.json(), metrics });
    }
    // static
    let p = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!p.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  } catch (e) { metrics.errors++; send(res, 500, { error: e.message }); }
});
server.listen(PORT, () => console.log(`Shagun Ledger on http://localhost:${PORT}  sarvam=${!!SARVAM_KEY} flagsmith=${!!FLAGSMITH_KEY} nudgebee=${!!NB_TOKEN}`));
