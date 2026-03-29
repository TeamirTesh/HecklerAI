# HecklerAI

Two debaters. One unhinged AI that interrupts in real time when someone says something wrong, commits a logical fallacy, or makes an exceptionally strong point. No waiting until the end. No softening it. Called out live, in front of everyone, equally, regardless of who is speaking.

---

## 📋 Overview

DebateRoast is a real-time AI debate referee. Two people join a room, pick a roast intensity level, and debate a topic. As they speak, the system transcribes their audio, analyzes every sentence for logical fallacies, verifiable false claims, and manipulation tactics. When something is caught, the AI interrupts with a voiced roast delivered through the speakers of both participants. Strong arguments get vulgar compliments. Bad arguments get destroyed. A full post-debate report is generated at the end.

---

## 🛠️ Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite | Single-page application |
| Styling | Tailwind CSS + Framer Motion | UI and animations |
| Real-time | Socket.io | Bidirectional communication between clients and server |
| Backend | Node.js + Express | HTTP server and WebSocket server |
| Database | Redis (via Docker) | Room state, scores, rolling context, roast records |
| Transcription | AssemblyAI Streaming v3 | Real-time speech-to-text via WebSocket |
| AI Analysis | Groq LLaMA 3.3 70B | Fallacy detection, roast/compliment generation, post-debate analytics |
| Fact-Checking | Tavily Search API | Verifies factual claims in real time |
| Text-to-Speech | Cartesia Sonic | Generates voiced roasts and announcements as MP3 |
| Tunneling | ngrok | Exposes local backend to HTTPS for mic access and multi-device use |

---

## 🏗️ Architecture

```
Browser (Debater 1)                    Browser (Debater 2)
      |                                        |
      | PCM audio chunks (base64)              | PCM audio chunks (base64)
      |                                        |
      +-----------------> Backend (Express + Socket.io) <-----------------+
                                    |
                    +---------------+---------------+
                    |               |               |
              AssemblyAI      Groq LLaMA         Tavily
           (transcription)   (analysis +        (fact-check)
                              roast gen)
                    |               |               |
                    +---------------+---------------+
                                    |
                               Cartesia
                           (TTS audio MP3)
                                    |
                    Roast payload (audio + metadata)
                    broadcast to ALL clients in room
                                    |
              +---------------------+---------------------+
              |                                           |
    Browser (Debater 1)                       Browser (Debater 2)
    plays audio, shows roast card             plays audio, shows roast card
```

**Analysis pipeline per utterance:**
1. AssemblyAI fires `end_of_turn` with a complete sentence
2. Grace period check (5s after debate start) and cooldown check (4s since last roast) — skip if too soon
3. Minimum word count check (8 words) — skip fragments
4. Single Groq call — classifies the utterance AND generates the roast/compliment in one shot
5. If `CLEAN` or `interrupt: false` — discard, done
6. If `FALLACY` — generate TTS immediately, emit to clients
7. If `FACTUAL_CLAIM` — fire Tavily and generate stop-phrase TTS in parallel. Stop phrase plays while Tavily resolves. Roast with real facts plays immediately after
8. If `GOOD_POINT` — generate compliment TTS, emit to clients

---

## 📁 File Structure

```
HecklerAI/
├── backend/
│   ├── src/
│   │   ├── index.js            Express server, Socket.io handlers, audio routing
│   │   ├── transcription.js    AssemblyAI StreamingTranscriber per socket
│   │   ├── analysisQueue.js    Pipeline orchestration, grace period, cooldown
│   │   ├── groq.js             LLaMA analysis, roast generation, debate analytics
│   │   ├── cartesia.js         TTS generation (roasts, compliments, announcements)
│   │   ├── tavily.js           Fact-checking via Tavily Search API
│   │   ├── roomManager.js      Redis abstraction, room state, scores, roasts
│   │   └── perplexity.js       Legacy fact-checker (unused, kept for reference)
│   ├── package.json
│   └── railway.toml            Railway deployment config
│
├── frontend/
│   ├── public/
│   │   └── pcm-processor.js    AudioWorklet processor for 16kHz PCM capture
│   ├── src/
│   │   ├── App.jsx             Route definitions
│   │   ├── main.jsx            React entry point
│   │   ├── hooks/
│   │   │   ├── useSocket.js    Socket.io connection hook (singleton)
│   │   │   └── useAudio.js     Mic capture (16kHz PCM) + audio playback
│   │   ├── components/
│   │   │   ├── RoastCard.jsx       Full-screen roast overlay with animation
│   │   │   ├── ScoreTracker.jsx    Live score display
│   │   │   ├── DebaterPanel.jsx    Per-debater status card
│   │   │   └── TranscriptFeed.jsx  Auto-scrolling live transcript
│   │   └── pages/
│   │       ├── SetupScreen.jsx             Room creation and join forms
│   │       ├── AIPreparationScreen.jsx     Animated prep sequence before debate
│   │       ├── RoastLevelScreen.jsx        Roast intensity selector (Easy/Intermediate/Savage)
│   │       ├── EnhancedDebateScreen.jsx    Live debate interface
│   │       ├── EnhancedSummaryScreen.jsx   Post-debate summary with analytics
│   │       ├── SpectateScreen.jsx          Read-only spectator view
│   │       └── PostDebateReport.jsx        Full printable post-debate report
│   ├── vite.config.js
│   ├── package.json
│   └── vercel.json             Vercel deployment config
│
└── Dockerfile                  Full-stack container (frontend built into backend)
```

---

## 💻 Local Setup

### ✅ Prerequisites

- Node.js 18 or higher
- Docker Desktop (for Redis)
- ngrok account and CLI installed
- API keys for: Groq, AssemblyAI, Cartesia, Tavily

### 1. 📥 Clone the repo

```bash
git clone https://github.com/your-org/HecklerAI.git
cd HecklerAI
```

### 2. 🐳 Start Redis

```bash
docker run -d -p 6379:6379 redis:alpine
```

### 3. ⚙️ Configure backend environment

Create `backend/.env`:

```
GROQ_API_KEY=your_groq_api_key
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
CARTESIA_API_KEY=your_cartesia_api_key
TAVILY_API_KEY=your_tavily_api_key
REDIS_URL=redis://localhost:6379
FRONTEND_URL=*
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### 4. ⚙️ Configure frontend environment

Create `frontend/.env`:

```
VITE_BACKEND_URL=https://your-ngrok-url.ngrok-free.app
```

This must point to the HTTPS ngrok URL for the backend. See step 6.

### 5. 📦 Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 6. 🌐 Start ngrok for the backend

```bash
ngrok http 3001
```

Copy the `https://xxxx.ngrok-free.app` URL into `frontend/.env` as `VITE_BACKEND_URL`, then proceed to step 8.

### 7. ▶️ Start the backend

```bash
cd backend && npm start
```

### 8. 🏗️ Build and serve the frontend

```bash
cd frontend && npm run build && npm run preview -- --host
```

The `--host` flag makes the frontend accessible on your local network IP (shown in terminal output). This is required for a second person to join from another device on the same network.

### 9. 🌍 Open the app

- Person 1 (host): open `https://localhost:4173` in browser
- Person 2 (guest): open `https://YOUR_LOCAL_IP:4173` in browser
  - Accept the self-signed certificate warning
  - Use the "Already have a room code? Join here" form at the bottom of the setup page

If Person 2 is on a different network entirely, run a second ngrok tunnel for the frontend:

```bash
ngrok http 4173 --pooling-enabled
```

Share that HTTPS URL with Person 2 instead of the local IP.

---

## 🔧 Environment Variables

### 📄 backend/.env

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | LLaMA 3.3 70B analysis and roast generation |
| `ASSEMBLYAI_API_KEY` | Yes | Real-time speech-to-text streaming |
| `CARTESIA_API_KEY` | Yes | Text-to-speech for roasts and announcements |
| `TAVILY_API_KEY` | Yes | Fact-checking factual claims |
| `REDIS_URL` | Yes | Redis connection string. Default: `redis://localhost:6379` |
| `FRONTEND_URL` | Yes | CORS allowed origin. Use `*` for local dev |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Yes | Set to `0` on networks with custom TLS certificates |
| `PORT` | No | Backend port. Default: `3001` |
| `CARTESIA_VOICE_ID` | No | Override the default Cartesia voice |

### 📄 frontend/.env

| Variable | Required | Description |
|---|---|---|
| `VITE_BACKEND_URL` | Yes | Full HTTPS URL of the backend (ngrok URL locally, production URL in prod) |

---

## 🎬 How a Session Works

1. Person 1 opens the frontend, enters a debate topic and both debater names, clicks Start
2. The app creates a room in Redis and navigates through the AI preparation screen and roast level selection
3. Person 1 shares the room code with Person 2
4. Person 2 opens the frontend, uses the join form with the room code and their exact name (must match what Person 1 entered exactly, case-sensitive)
5. Person 1 clicks Start Debate — opening announcement plays on both devices, both mics activate
6. Both debaters speak — audio is captured as 16kHz PCM via AudioWorklet and streamed to the backend
7. AssemblyAI transcribes in real time, firing on complete sentences
8. Each sentence runs through the analysis pipeline (Groq + Tavily if needed + Cartesia TTS)
9. Roasts and compliments are broadcast to all clients in the room with audio
10. Person 1 (host) clicks End Debate — both devices navigate to the summary screen
11. Groq generates a full post-debate analytics report from the transcript

Spectators can join via the "Spectate a debate" form on the setup page using the room code. They receive all events in read-only mode.

---

## 🔥 Roast Levels

| Level | Behavior |
|---|---|
| Easy | Lower interruption frequency, conversational tone, profanity used sparingly |
| Intermediate | Balanced interruption rate, sharp and specific, moderately vulgar |
| Savage | Interrupts on anything borderline, profanity in every single sentence, no mercy |

---

## 🚀 Deployment

**Backend — Railway:**
- Connect the repo to Railway
- Set all backend environment variables in the Railway dashboard
- Add a Redis plugin (Railway sets `REDIS_URL` automatically)
- Deploy from the `main` branch — `railway.toml` handles the rest

**Frontend — Vercel:**
- Connect the `frontend/` directory to Vercel
- Set `VITE_BACKEND_URL` to the Railway backend URL in Vercel environment variables
- `vercel.json` handles SPA routing automatically

**Full-stack Docker:**
- The `Dockerfile` builds the frontend and serves it from the backend
- `docker build -t debateroast . && docker run -p 3001:3001 --env-file backend/.env debateroast`

---

## 🔑 API Keys

| Service | Link |
|---|---|
| Groq | https://console.groq.com |
| AssemblyAI | https://www.assemblyai.com |
| Cartesia | https://cartesia.ai |
| Tavily | https://tavily.com |
