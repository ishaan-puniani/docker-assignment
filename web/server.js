const express = require('express');
const os = require('os');

const NOTES_API = process.env.NOTES_API_URL || 'http://notes-api:5000';
const app = express();
app.use(express.json());
app.use(express.static(`${__dirname}/static`));

app.use((req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`));
  next();
});

// Call notes-api over REST. Returns the fetch Response, or null if unreachable.
async function callApi(method, path, body) {
  try {
    return await fetch(NOTES_API + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return null;
  }
}

async function relay(res, r) {
  if (!r) return res.status(503).json({ error: 'notes-api unavailable' });
  res.status(r.status).set({
    'Content-Type': 'application/json',
    'X-Web-Pod': os.hostname(),
    'X-Notes-Api-Pod': r.headers.get('X-Served-By') || '',
  }).send(await r.text());
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/notes', async (req, res) => relay(res, await callApi('GET', '/notes')));
app.post('/api/notes', async (req, res) => relay(res, await callApi('POST', '/notes', req.body)));
app.delete('/api/notes/:id', async (req, res) => relay(res, await callApi('DELETE', `/notes/${encodeURIComponent(req.params.id)}`)));

// web's own logic: aggregates data fetched from notes-api
app.get('/api/stats', async (req, res) => {
  const r = await callApi('GET', '/notes');
  if (!r?.ok) return res.status(503).json({ error: 'notes-api unavailable' });
  const texts = (await r.json()).map((n) => n.text);
  const total = texts.reduce((sum, t) => sum + t.length, 0);
  res.json({
    count: texts.length,
    avg_length: texts.length ? Math.round((total / texts.length) * 10) / 10 : 0,
    web_pod: os.hostname(),
    notes_api_pod: r.headers.get('X-Served-By') || '',
  });
});

app.listen(process.env.PORT || 5000, () => console.log('web listening'));
