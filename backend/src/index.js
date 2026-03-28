import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
import {
  createRoom,
  getRoom,
  updateRoomStatus,
  getRoasts,
  deleteRoom,
  pushTranscript,
  getTranscript,
  storeAnalytics,
  getAnalytics,
} from './roomManager.js'
import { createDeepgramStream } from './deepgram.js'
import { processUtterance } from './analysisQueue.js'
import { generateOpeningAnnouncement } from './cartesia.js'
import { generateDebateAnalytics } from './groq.js'

const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const app = express()
app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 1e7, // 10MB for audio chunks
})

// ── REST: create a new room ────────────────────────────────────────────────────
app.post('/api/rooms', async (req, res) => {
  const { topic, debater1, debater2 } = req.body
  if (!topic || !debater1 || !debater2) {
    return res.status(400).json({ error: 'topic, debater1, debater2 are required' })
  }
  const roomId = uuidv4().slice(0, 8).toUpperCase()
  const room = await createRoom({ roomId, topic, debater1, debater2 })
  res.json({ roomId, room })
})

// ── REST: get room state ───────────────────────────────────────────────────────
app.get('/api/rooms/:roomId', async (req, res) => {
  const room = await getRoom(req.params.roomId)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.json(room)
})

// ── REST: get post-debate summary ──────────────────────────────────────────────
app.get('/api/rooms/:roomId/summary', async (req, res) => {
  const room = await getRoom(req.params.roomId)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  const [roasts, analyticsData] = await Promise.all([
    getRoasts(req.params.roomId),
    getAnalytics(req.params.roomId),
  ])
  res.json({ room, roasts, analytics: analyticsData })
})

// ── In-memory: active Deepgram streams per socket ─────────────────────────────
// Map<socketId, { stream, roomId, speakerName }>
const activeStreams = new Map()

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`)

  // Debater (or spectator) joins a room
  socket.on('join_room', async ({ roomId, speakerName, isSpectator }, ack) => {
    const room = await getRoom(roomId)
    if (!room) {
      ack?.({ error: 'Room not found' })
      return
    }
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.speakerName = speakerName
    socket.data.isSpectator = !!isSpectator

    if (isSpectator) {
      console.log(`[Socket] Spectator joined room ${roomId}`)
    } else {
      console.log(`[Socket] ${speakerName} joined room ${roomId}`)
      socket.to(roomId).emit('peer_joined', { speakerName })
    }
    ack?.({ ok: true, room })
  })

  // Start debate — emit opening announcement
  socket.on('start_debate', async ({ roomId }, ack) => {
    const room = await updateRoomStatus(roomId, 'active')
    if (!room) {
      ack?.({ error: 'Room not found' })
      return
    }

    console.log(`[Socket] Starting debate in room ${roomId}`)

    // Emit debate_started IMMEDIATELY so the mic and debateStatus activate without delay
    io.to(roomId).emit('debate_started', { room, openingAudioBase64: null })
    ack?.({ ok: true })

    // Generate opening audio in background — send when ready (non-blocking)
    generateOpeningAnnouncement().then((audioBuffer) => {
      if (audioBuffer) {
        io.to(roomId).emit('opening_audio', { audioBase64: audioBuffer.toString('base64') })
      }
    })
  })

  // Audio chunk from a debater's mic
  socket.on('audio_chunk', async ({ roomId, speakerName, chunk }) => {
    const streamKey = socket.id

    // Create Deepgram stream if it doesn't exist for this socket
    if (!activeStreams.has(streamKey)) {
      console.log(`[Deepgram] Creating stream for ${speakerName} in ${roomId}`)

      const stream = createDeepgramStream({
        speakerName,
        onFinal: async (speaker, transcript) => {
          // Broadcast transcript to everyone in the room
          io.to(roomId).emit('transcript', {
            speaker,
            text: transcript,
            timestamp: Date.now(),
          })
          // Store full transcript for end-of-debate analytics
          await pushTranscript(roomId, speaker, transcript)

          // Run analysis pipeline
          await processUtterance({
            roomId,
            speaker,
            utterance: transcript,
            onRoast: async (payload) => {
              console.log(`[Roast] Emitting roast for ${payload.speaker} in ${roomId}`)
              io.to(roomId).emit('roast', payload)
            },
          })
        },
        onError: (err) => {
          console.error(`[Deepgram] Stream error for ${speakerName}:`, err)
        },
      })

      activeStreams.set(streamKey, { stream, roomId, speakerName })
    }

    const { stream } = activeStreams.get(streamKey)
    // chunk comes as base64 string from the browser
    const buffer = Buffer.from(chunk, 'base64')
    stream.send(buffer)
  })

  // End debate
  socket.on('end_debate', async ({ roomId }, ack) => {
    const room = await updateRoomStatus(roomId, 'ended')
    io.to(roomId).emit('debate_ended', { roomId })
    ack?.({ ok: true })

    // Generate real analytics in the background
    if (room) {
      const [transcript, roasts] = await Promise.all([getTranscript(roomId), getRoasts(roomId)])
      console.log(`[Analytics] Generating analytics for room ${roomId}`)
      const analyticsData = await generateDebateAnalytics({
        topic: room.topic,
        debaters: room.debaters,
        transcript,
        roasts,
        scores: room.scores,
        fallacyTypes: room.fallacyTypes,
      })
      if (analyticsData) await storeAnalytics(roomId, analyticsData)
      console.log(`[Analytics] Done for room ${roomId}`)
    }
  })

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`)
    const streamData = activeStreams.get(socket.id)
    if (streamData) {
      streamData.stream.close()
      activeStreams.delete(socket.id)
    }
    if (socket.data.speakerName && socket.data.roomId && !socket.data.isSpectator) {
      socket.to(socket.data.roomId).emit('peer_left', {
        speakerName: socket.data.speakerName,
      })
    }
  })
})

// ── Healthcheck ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

// ── Serve frontend static files (production) ──────────────────────────────────
const frontendDist = join(__dirname, '../../frontend/dist')
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('*', (req, res) => res.sendFile(join(frontendDist, 'index.html')))
}

httpServer.listen(PORT, () => {
  console.log(`[Server] DebateRoast backend running on port ${PORT}`)
})
