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
  normalizeRoomId,
} from './roomManager.js'
import { transcribeWhisperToText } from './whisperTranscription.js'
import { processUtterance } from './analysisQueue.js'
import { generateOpeningAnnouncement } from './cartesia.js'

const PORT = process.env.PORT || 3001

const app = express()
// Echo request Origin so dev works on localhost vs 127.0.0.1 and odd Vite ports (a single fixed allowlist was blocking fetch before the request hit the server).
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '12mb' }))

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  maxHttpBufferSize: 1e7,
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
  const room = await getRoom(normalizeRoomId(req.params.roomId))
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.json(room)
})

// ── REST: get post-debate summary ──────────────────────────────────────────────
app.get('/api/rooms/:roomId/summary', async (req, res) => {
  const rid = normalizeRoomId(req.params.roomId)
  const room = await getRoom(rid)
  if (!room) return res.status(404).json({ error: 'Room not found' })
  const roasts = await getRoasts(rid)
  res.json({ room, roasts })
})

/**
 * Mic audio upload (WAV base64). Socket.IO nested binary was unreliable (wrong WebM/float bytes).
 */
app.post('/api/transcription-chunk', async (req, res) => {
  try {
    const { roomId: rawRoomId, speakerName, chunk: b64, mimeType } = req.body || {}
    const roomId = normalizeRoomId(rawRoomId)
    if (!roomId || !speakerName || typeof b64 !== 'string') {
      console.warn('[API] transcription-chunk 400: missing fields', {
        hasRoom: !!rawRoomId,
        hasSpeaker: !!speakerName,
        chunkType: typeof b64,
      })
      return res.status(400).json({ error: 'roomId, speakerName, and chunk (base64) are required' })
    }
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 64) {
      console.warn('[API] transcription-chunk 400: chunk too small', roomId, buf.length)
      return res.status(400).json({ error: 'chunk too small' })
    }

    const headHex = buf.subarray(0, 4).toString('hex')
    console.log(
      `[API] transcription-chunk room=${roomId} speaker=${speakerName} bytes=${buf.length} head=${headHex}`
    )

    const room = await getRoom(roomId)
    if (!room || room.status !== 'active') {
      console.warn('[API] transcription-chunk 400: room not active', roomId, room?.status ?? 'missing')
      return res.status(400).json({ error: 'Room not active' })
    }

    const transcript = await transcribeWhisperToText(buf, mimeType)
    if (!transcript) {
      console.log(`[API] transcription-chunk empty transcript room=${roomId}`)
    }
    if (transcript) {
      io.to(roomId).emit('transcript', {
        speaker: speakerName,
        text: transcript,
        timestamp: Date.now(),
      })
      await processUtterance({
        roomId,
        speaker: speakerName,
        utterance: transcript,
        onRoast: async (payload) => {
          console.log(`[Roast] Emitting roast for ${payload.speaker} in ${roomId}`)
          io.to(roomId).emit('roast', payload)
        },
      })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[API] transcription-chunk:', err.message || err)
    res.status(500).json({ error: 'transcription failed' })
  }
})

// ── Socket.io (signalling only — audio uses POST /api/transcription-chunk) ────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`)

  socket.on('join_room', async ({ roomId: rawRoomId, speakerName }, ack) => {
    const roomId = normalizeRoomId(rawRoomId)
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

  socket.on('start_debate', async ({ roomId: rawRoomId }, ack) => {
    const roomId = normalizeRoomId(rawRoomId)
    const room = await updateRoomStatus(roomId, 'active')
    if (!room) {
      ack?.({ error: 'Room not found' })
      return
    }

    console.log(`[Socket] Starting debate in room ${roomId}`)

    // Emit immediately so clients set debate active and start mic POSTs; do not block on Cartesia.
    io.to(roomId).emit('debate_started', {
      room,
      openingAudioBase64: null,
    })
    ack?.({ ok: true })

    generateOpeningAnnouncement()
      .then((audioBuffer) => {
        if (audioBuffer) {
          io.to(roomId).emit('opening_audio', {
            openingAudioBase64: audioBuffer.toString('base64'),
          })
        }
      })
      .catch((err) => {
        console.error('[Socket] Opening announcement failed:', err.message || err)
      })
  })

  socket.on('end_debate', async ({ roomId: rawRoomId }, ack) => {
    const roomId = normalizeRoomId(rawRoomId)
    await updateRoomStatus(roomId, 'ended')
    io.to(roomId).emit('debate_ended', { roomId })
    ack?.({ ok: true })
  })

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`)
    if (socket.data.speakerName && socket.data.roomId) {
      socket.to(socket.data.roomId).emit('peer_left', {
        speakerName: socket.data.speakerName,
      })
    }
  })
})

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }))

httpServer.listen(PORT, () => {
  console.log(`[Server] DebateRoast backend running on port ${PORT}`)
})
