import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import {
  createRoom,
  getRoom,
  updateRoomStatus,
  getRoasts,
  deleteRoom,
} from './roomManager.js'
import { createWhisperLiveSession } from './whisperTranscription.js'
import { processUtterance } from './analysisQueue.js'
import { generateOpeningAnnouncement } from './cartesia.js'

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
  const roasts = await getRoasts(req.params.roomId)
  res.json({ room, roasts })
})

// ── In-memory: active Whisper transcription sessions per socket ─────────────
// Map<socketId, { session, roomId, speakerName }>
const activeTranscriptionSessions = new Map()

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`)

  // Debater joins a room
  socket.on('join_room', async ({ roomId, speakerName }, ack) => {
    const room = await getRoom(roomId)
    if (!room) {
      ack?.({ error: 'Room not found' })
      return
    }
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.speakerName = speakerName

    console.log(`[Socket] ${speakerName} joined room ${roomId}`)
    socket.to(roomId).emit('peer_joined', { speakerName })
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

    // Generate opening announcement
    const audioBuffer = await generateOpeningAnnouncement()
    io.to(roomId).emit('debate_started', {
      room,
      openingAudioBase64: audioBuffer ? audioBuffer.toString('base64') : null,
    })
    ack?.({ ok: true })
  })

  // Audio chunk from a debater's mic
  socket.on('audio_chunk', async ({ roomId, speakerName, chunk }) => {
    const streamKey = socket.id

    if (!activeTranscriptionSessions.has(streamKey)) {
      console.log(`[Whisper] Starting transcription session for ${speakerName} in ${roomId}`)

      const session = createWhisperLiveSession({
        speakerName,
        onFinal: async (speaker, transcript) => {
          io.to(roomId).emit('transcript', {
            speaker,
            text: transcript,
            timestamp: Date.now(),
          })

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
          console.error(`[Whisper] Session error for ${speakerName}:`, err)
        },
      })

      activeTranscriptionSessions.set(streamKey, { session, roomId, speakerName })
    }

    const { session } = activeTranscriptionSessions.get(streamKey)
    const buffer = Buffer.from(chunk, 'base64')
    session.send(buffer)
  })

  // End debate
  socket.on('end_debate', async ({ roomId }, ack) => {
    await updateRoomStatus(roomId, 'ended')
    io.to(roomId).emit('debate_ended', { roomId })
    ack?.({ ok: true })
  })

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`)
    const sessionData = activeTranscriptionSessions.get(socket.id)
    if (sessionData) {
      activeTranscriptionSessions.delete(socket.id)
      sessionData.session.close().catch((err) => {
        console.error('[Whisper] Error closing session on disconnect:', err)
      })
    }
    if (socket.data.speakerName && socket.data.roomId) {
      socket.to(socket.data.roomId).emit('peer_left', {
        speakerName: socket.data.speakerName,
      })
    }
  })
})

// ── Healthcheck ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

httpServer.listen(PORT, () => {
  console.log(`[Server] DebateRoast backend running on port ${PORT}`)
})
