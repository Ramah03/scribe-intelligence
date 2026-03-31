const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH CHECK ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Scribe Intelligence Platform', version: '1.0.0' });
});

// ── FULL DIAGNOSTICS ─────────────────────────
// Runs all checks server-side and returns detailed results
app.get('/api/diagnostics', async (req, res) => {
  const results = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // CHECK 1: Server is running
  results.push({
    id: 'server',
    name: 'Server Running',
    status: 'pass',
    message: 'Scribe server is online and responding.',
    fix: null
  });

  // CHECK 2: API key present
  if (!apiKey) {
    results.push({
      id: 'apikey',
      name: 'Anthropic API Key',
      status: 'fail',
      message: 'ANTHROPIC_API_KEY environment variable is not set.',
      fix: 'Go to render.com → your service → Environment → add ANTHROPIC_API_KEY with your key from console.anthropic.com'
    });
  } else if (!apiKey.startsWith('sk-ant')) {
    results.push({
      id: 'apikey',
      name: 'Anthropic API Key',
      status: 'warn',
      message: 'API key is set but format looks unusual (should start with sk-ant-).',
      fix: 'Double-check your key at console.anthropic.com → API Keys. Copy it fresh and update in Render environment.'
    });
  } else {
    results.push({
      id: 'apikey',
      name: 'Anthropic API Key',
      status: 'pass',
      message: 'API key is present and correctly formatted (' + apiKey.substring(0,16) + '••••).',
      fix: null
    });
  }

  // CHECK 3: Claude API reachability
  if (apiKey) {
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] })
      });
      if (claudeRes.ok) {
        results.push({ id: 'claude', name: 'Claude AI Connection', status: 'pass', message: 'Successfully connected to Claude claude-sonnet-4-20250514.', fix: null });
      } else if (claudeRes.status === 401) {
        results.push({ id: 'claude', name: 'Claude AI Connection', status: 'fail', message: 'API key rejected — authentication failed (401).', fix: 'Your API key may be invalid or expired. Go to console.anthropic.com → API Keys → create a new key and update it in Render.' });
      } else if (claudeRes.status === 429) {
        results.push({ id: 'claude', name: 'Claude AI Connection', status: 'fail', message: 'Rate limit or insufficient credits (429).', fix: 'Go to console.anthropic.com → Plans & Billing → add more credits. $5 is enough for hundreds of briefs.' });
      } else {
        const errData = await claudeRes.json().catch(() => ({}));
        results.push({ id: 'claude', name: 'Claude AI Connection', status: 'fail', message: 'Claude API returned error ' + claudeRes.status + ': ' + (errData?.error?.message || 'unknown'), fix: 'Check console.anthropic.com for account issues.' });
      }
    } catch (e) {
      results.push({ id: 'claude', name: 'Claude AI Connection', status: 'fail', message: 'Could not reach Anthropic servers: ' + e.message, fix: 'Render server may have network restrictions. Check your service logs on render.com.' });
    }
  } else {
    results.push({ id: 'claude', name: 'Claude AI Connection', status: 'skip', message: 'Skipped — API key not set.', fix: null });
  }

  // CHECK 4: Wikipedia reachability
  try {
    const wikiRes = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Microsoft');
    if (wikiRes.ok) {
      results.push({ id: 'wiki', name: 'Wikipedia Data Source', status: 'pass', message: 'Wikipedia API is reachable and returning data.', fix: null });
    } else {
      results.push({ id: 'wiki', name: 'Wikipedia Data Source', status: 'warn', message: 'Wikipedia returned status ' + wikiRes.status + '. Company auto-fill may not work.', fix: 'This is usually temporary. Try again in a few minutes.' });
    }
  } catch (e) {
    results.push({ id: 'wiki', name: 'Wikipedia Data Source', status: 'warn', message: 'Wikipedia unreachable: ' + e.message, fix: 'Auto-fill will not work but brief generation still will. Usually resolves itself.' });
  }

  // CHECK 5: Environment
  results.push({
    id: 'env',
    name: 'Environment',
    status: 'pass',
    message: 'Node ' + process.version + ' · ' + (process.env.NODE_ENV || 'development') + ' · Port ' + PORT,
    fix: null
  });

  const allPass = results.every(r => r.status === 'pass' || r.status === 'skip');
  const hasFail = results.some(r => r.status === 'fail');

  res.json({
    overall: hasFail ? 'fail' : allPass ? 'pass' : 'warn',
    timestamp: new Date().toISOString(),
    checks: results
  });
});

// ── ANTHROPIC PROXY ───────────────────────────
// All Claude API calls go through here — no CORS issues, API key stays on server
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY environment variable not set. Add it in your Render dashboard under Environment.'
    });
  }

  try {
    const { prompt, max_tokens = 6000 } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || `Anthropic API error ${response.status}`
      });
    }

    const text = data.content?.find(c => c.type === 'text')?.text || '';
    res.json({ text });

  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── WIKIPEDIA PROXY ───────────────────────────
app.get('/api/wiki/:query', async (req, res) => {
  try {
    const query = encodeURIComponent(req.params.query);
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${query}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Wikipedia fetch failed' });
  }
});

// ── FALLBACK → SERVE APP ──────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Scribe Intelligence Platform running on port ${PORT}`);
});
