# HecklerAI 🔥

Real-time AI debate referee. Two debaters. One unhinged AI that interrupts with vulgar, comedic callouts the moment it detects a logical fallacy or false factual claim.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + Tailwind CSS + Framer Motion + Socket.io client |
| Backend | Node.js + Express + Socket.io + Redis |
| Transcription | Deepgram (nova-2, real-time streaming) |
| Roast AI | Groq LLaMA 3.3 70B |
| Fact-checking | Perplexity API (sonar-small-online) |
| TTS | Cartesia Sonic |

---

## Project Structure

```
DebateRoast/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express + Socket.io server
│   │   ├── roomManager.js    # Redis room/score/exchange management
│   │   ├── deepgram.js       # Live transcription streams
│   │   ├── groq.js           # LLaMA 3 analysis + roast generation
│   │   ├── perplexity.js     # Fact-checking
│   │   ├── cartesia.js       # TTS audio generation
│   │   └── analysisQueue.js  # Pipeline orchestration
│   ├── package.json
│   └── railway.toml
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── SetupScreen.jsx
    │   │   ├── DebateScreen.jsx
    │   │   └── SummaryScreen.jsx
    │   ├── components/
    │   │   ├── RoastCard.jsx       # Framer Motion animated overlay
    │   │   ├── ScoreTracker.jsx
    │   │   ├── TranscriptFeed.jsx
    │   │   └── DebaterPanel.jsx
    │   └── hooks/
    │       ├── useSocket.js    # Socket.io connection hook
    │       └── useAudio.js     # Mic capture + base64 streaming
    ├── vite.config.js
    └── vercel.json
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- Redis running locally (`redis-server`) or a Redis URL

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in your API keys in .env
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Set VITE_BACKEND_URL=http://localhost:3001
npm install
npm run dev
```

### 3. Test with two browser tabs

1. Open `http://localhost:5173` in Tab 1
2. Fill in topic + debater names → Start Debate
3. Copy the room code shown
4. Open `http://localhost:5173` in Tab 2
5. Use "Join existing room" → enter the room code + debater 2's name
6. Both tabs: mics open, debate begins, roasts fly

---

## Required API Keys

| Key | Where to get it |
|-----|-----------------|
| `DEEPGRAM_API_KEY` | https://console.deepgram.com |
| `GROQ_API_KEY` | https://console.groq.com |
| `CARTESIA_API_KEY` | https://play.cartesia.ai |
| `PERPLEXITY_API_KEY` | https://www.perplexity.ai/settings/api |
| `REDIS_URL` | Local: `redis://localhost:6379` / Railway Redis addon |

---

## Deployment

### Backend → Railway
1. Connect your GitHub repo to Railway
2. Set root directory to `backend/`
3. Add all env vars
4. Add a Redis plugin — copy the `REDIS_URL` to your env vars
5. Deploy — Railway uses `railway.toml` config automatically

### Frontend → Vercel
1. Connect your GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Set `VITE_BACKEND_URL` to your Railway backend URL
4. Deploy — `vercel.json` handles SPA routing

---

## How It Works

```
Browser Mic (getUserMedia)
    ↓ base64 audio chunks via Socket.io
Backend (Node.js)
    ↓ binary chunks
Deepgram Live Transcription
    ↓ is_final transcript
Analysis Pipeline
    ├── Groq LLaMA 3.3 70B → detect fallacy / factual claim
    ├── (if FACTUAL_CLAIM) Perplexity → verify + get source
    └── Cartesia TTS → stop phrase (fast) + roast (normal pace)
        ↓ base64 MP3
Both Browser Clients
    ├── Play audio
    └── Animate RoastCard (slide in → shake → 8s → fade out)
```

---

## Environment Variables

### Backend (`backend/.env`)
```
DEEPGRAM_API_KEY=
GROQ_API_KEY=
CARTESIA_API_KEY=
PERPLEXITY_API_KEY=
REDIS_URL=redis://localhost:6379
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)
```
VITE_BACKEND_URL=http://localhost:3001
```
