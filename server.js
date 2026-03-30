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
