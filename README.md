# Scribe — The Intelligence Company

AI-powered executive intelligence brief platform.

## Deploy to Render (Free)

1. Upload this folder to GitHub (see steps below)
2. Go to render.com and sign up free
3. Click "New +" → "Web Service"
4. Connect your GitHub repo
5. Render auto-detects the settings from render.yaml
6. Add environment variable: ANTHROPIC_API_KEY = your key from console.anthropic.com
7. Click Deploy — your app will be live at https://scribe-intelligence.onrender.com

## Upload to GitHub

1. Go to github.com and sign up free
2. Click "New repository" — name it "scribe-intelligence"
3. Click "uploading an existing file"
4. Drag all files from this folder into the upload area
5. Click "Commit changes"
6. Now connect to Render as above

## Local Development

```bash
npm install
ANTHROPIC_API_KEY=your-key-here node server.js
```

Then open http://localhost:3000
