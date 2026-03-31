const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.0' });
});

app.get('/api/diagnostics', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  const checks = [];
  checks.push({ id: 'server', name: 'Server Running', status: 'pass', message: 'Scribe server is online.', fix: null });
  if (!key) {
    checks.push({ id: 'apikey', name: 'Anthropic API Key', status: 'fail', message: 'ANTHROPIC_API_KEY is not set.', fix: 'Go to render.com your service Environment add ANTHROPIC_API_KEY' });
    checks.push({ id: 'claude', name: 'Claude AI', status: 'skip', message: 'Skipped no API key.', fix: null });
  } else {
    checks.push({ id: 'apikey', name: 'Anthropic API Key', status: 'pass', message: 'Key present: ' + key.substring(0, 16) + '...', fix: null });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
      });
      if (r.ok) {
        checks.push({ id: 'claude', name: 'Claude AI', status: 'pass', message: 'Connected to claude-sonnet-4-20250514.', fix: null });
      } else if (r.status === 401) {
        checks.push({ id: 'claude', name: 'Claude AI', status: 'fail', message: 'API key rejected (401).', fix: 'Create a new key at console.anthropic.com and update in Render.' });
      } else if (r.status === 429) {
        checks.push({ id: 'claude', name: 'Claude AI', status: 'fail', message: 'Insufficient credits (429).', fix: 'Add credits at console.anthropic.com Plans and Billing.' });
      } else {
        checks.push({ id: 'claude', name: 'Claude AI', status: 'fail', message: 'Claude API error ' + r.status, fix: 'Check console.anthropic.com for account issues.' });
      }
    } catch (e) {
      checks.push({ id: 'claude', name: 'Claude AI', status: 'fail', message: 'Cannot reach Anthropic: ' + e.message, fix: 'Check Render logs.' });
    }
  }
  try {
    const wr = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Microsoft');
    checks.push({ id: 'wiki', name: 'Wikipedia', status: wr.ok ? 'pass' : 'warn', message: wr.ok ? 'Wikipedia reachable.' : 'Status ' + wr.status, fix: wr.ok ? null : 'Auto-fill may not work temporarily.' });
  } catch (e) {
    checks.push({ id: 'wiki', name: 'Wikipedia', status: 'warn', message: 'Unreachable: ' + e.message, fix: 'Auto-fill will not work but generation will.' });
  }
  checks.push({ id: 'env', name: 'Environment', status: 'pass', message: 'Node ' + process.version + ' port ' + PORT, fix: null });
  const hasFail = checks.some(c => c.status === 'fail');
  const hasWarn = checks.some(c => c.status === 'warn');
  res.json({ overall: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass', timestamp: new Date().toISOString(), checks });
});

app.post('/api/claude', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Render environment.' });
  const { prompt, max_tokens } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: max_tokens || 6000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error ? data.error.message : 'Error ' + r.status });
    const text = data.content && data.content[0] ? data.content[0].text : '';
    res.json({ text: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wiki/:query', async (req, res) => {
  try {
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(req.params.query));
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Wikipedia failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function() {
  console.log('Scribe running on port ' + PORT);
});
