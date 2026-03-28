import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSocket } from '../hooks/useSocket.js'
import { useAudio, playBase64Audio } from '../hooks/useAudio.js'
import RoastCard from '../components/RoastCard.jsx'
import ScoreTracker from '../components/ScoreTracker.jsx'
import TranscriptFeed from '../components/TranscriptFeed.jsx'
import DebaterPanel from '../components/DebaterPanel.jsx'

export default function DebateScreen() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const myName = searchParams.get('name') || 'Debater'
  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'
  const debaters = [d1, d2]

  const [room, setRoom] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [currentRoast, setCurrentRoast] = useState(null)
  const [scores, setScores] = useState({ [d1]: 0, [d2]: 0 })
  const [debateStatus, setDebateStatus] = useState('waiting') // waiting | active | ended
  const [connectedPeers, setConnectedPeers] = useState(new Set())
  const [isHost, setIsHost] = useState(false)

  // Track if we've played the opening
  const openingPlayedRef = useRef(false)

  // ── Socket handlers ──────────────────────────────────────────────────────────
  const { emit } = useSocket({
    peer_joined: ({ speakerName }) => {
      setConnectedPeers((prev) => new Set([...prev, speakerName]))
      setTranscript((prev) => [
        ...prev,
        { speaker: 'SYSTEM', text: `${speakerName} joined the debate`, timestamp: Date.now() },
      ])
    },
    peer_left: ({ speakerName }) => {
      setConnectedPeers((prev) => {
        const next = new Set(prev)
        next.delete(speakerName)
        return next
      })
    },
    debate_started: async ({ room: updatedRoom, openingAudioBase64 }) => {
      setRoom(updatedRoom)
      setDebateStatus('active')
      if (openingAudioBase64 && !openingPlayedRef.current) {
        openingPlayedRef.current = true
        await playBase64Audio(openingAudioBase64)
      }
    },
    transcript: (entry) => {
      setTranscript((prev) => [...prev.slice(-200), entry])
    },
    roast: async (payload) => {
      setCurrentRoast(payload)
      setScores(payload.scores || scores)

      // Add roast to transcript
      setTranscript((prev) => [
        ...prev,
        {
          speaker: 'SYSTEM',
          text: `🔥 ROAST: ${payload.speaker} got called out — ${payload.fallacyName || payload.type}`,
          timestamp: Date.now(),
        },
      ])

      // Play audio
      if (payload.audioBase64) {
        await playBase64Audio(payload.audioBase64)
      }
    },
    debate_ended: () => {
      setDebateStatus('ended')
    },
  })

  // ── Join room on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    emit('join_room', { roomId, speakerName: myName }, (res) => {
      if (res?.error) {
        console.error('Join error:', res.error)
        return
      }
      if (res?.room) {
        setRoom(res.room)
        setScores(res.room.scores || { [d1]: 0, [d2]: 0 })
        setDebateStatus(res.room.status || 'waiting')
        // If I'm debater1, I'm the host
        setIsHost(res.room.debaters[0] === myName)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio chunk handler ──────────────────────────────────────────────────────
  const handleChunk = useCallback(
    (base64Chunk) => {
      if (debateStatus !== 'active') return
      emit('audio_chunk', { roomId, speakerName: myName, chunk: base64Chunk })
    },
    [emit, roomId, myName, debateStatus]
  )

  const { start: startMic, stop: stopMic, isRecording, error: micError } = useAudio(handleChunk)

  // ── Start debate (host only) ─────────────────────────────────────────────────
  async function handleStartDebate() {
    emit('start_debate', { roomId }, (res) => {
      if (res?.error) console.error('Start error:', res.error)
    })
    await startMic()
  }

  // ── Toggle mic (non-host) ────────────────────────────────────────────────────
  async function handleToggleMic() {
    if (isRecording) {
      stopMic()
    } else {
      await startMic()
    }
  }

  // ── End debate ───────────────────────────────────────────────────────────────
  function handleEndDebate() {
    stopMic()
    emit('end_debate', { roomId }, () => {
      navigate(`/summary/${roomId}?d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)
    })
  }

  // Start mic automatically when debate becomes active (for non-hosts)
  useEffect(() => {
    if (debateStatus === 'active' && !isRecording && !isHost) {
      startMic()
    }
  }, [debateStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1
            className="text-2xl font-black text-red-500"
            style={{ fontFamily: 'Impact, Arial Black, sans-serif', textShadow: '0 0 15px rgba(239,68,68,0.4)' }}
          >
            DEBATE<span className="text-white">ROAST</span>
          </h1>

          <div className="text-center">
            <p className="text-gray-400 text-xs uppercase tracking-widest">Room</p>
            <p className="text-white font-mono font-bold text-lg tracking-widest">{roomId}</p>
          </div>

          <StatusBadge status={debateStatus} />
        </div>
      </div>

      {/* Score tracker */}
      <div className="bg-gray-900/50 border-b border-gray-800/50 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <ScoreTracker debaters={debaters} scores={scores} />
          {room?.topic && (
            <p className="text-center text-gray-500 text-sm mt-2 italic">
              Topic: <span className="text-gray-300">"{room.topic}"</span>
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 flex gap-4 min-h-0">
        {/* Left debater */}
        <div className="w-44 flex-shrink-0">
          <DebaterPanel
            name={d1}
            isMe={myName === d1}
            isRecording={myName === d1 && isRecording}
            isConnected={myName === d1 || connectedPeers.has(d1)}
            score={scores[d1] || 0}
            side="left"
          />
        </div>

        {/* Transcript feed */}
        <div className="flex-1 bg-gray-900/40 border border-gray-800/60 rounded-2xl p-4 flex flex-col min-h-0 max-h-[calc(100vh-280px)]">
          <p className="text-gray-500 text-xs uppercase tracking-widest font-semibold mb-2 flex-shrink-0">
            Live Transcript
          </p>
          <div className="flex-1 min-h-0">
            <TranscriptFeed entries={transcript} debaters={debaters} />
          </div>
        </div>

        {/* Right debater */}
        <div className="w-44 flex-shrink-0">
          <DebaterPanel
            name={d2}
            isMe={myName === d2}
            isRecording={myName === d2 && isRecording}
            isConnected={myName === d2 || connectedPeers.has(d2)}
            score={scores[d2] || 0}
            side="right"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 border-t border-gray-800 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-4">
          {debateStatus === 'waiting' && isHost && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartDebate}
              className="bg-red-600 hover:bg-red-500 text-white font-black text-lg px-10 py-3 rounded-xl shadow-lg shadow-red-900/40 tracking-wide"
              style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
            >
              🔥 START DEBATE 🔥
            </motion.button>
          )}

          {debateStatus === 'waiting' && !isHost && (
            <p className="text-gray-400 text-sm">Waiting for host to start the debate...</p>
          )}

          {debateStatus === 'active' && (
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleToggleMic}
                className={`${
                  isRecording
                    ? 'bg-red-700 hover:bg-red-600 animate-pulse'
                    : 'bg-gray-700 hover:bg-gray-600'
                } text-white font-bold px-6 py-3 rounded-xl transition-colors`}
              >
                {isRecording ? '🎙️ Mic ON' : '🔇 Mic OFF'}
              </motion.button>

              {micError && (
                <p className="text-red-400 text-xs">Mic error: {micError}</p>
              )}

              {isHost && (
                <button
                  onClick={handleEndDebate}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-700 transition-colors"
                >
                  End Debate
                </button>
              )}
            </>
          )}

          {debateStatus === 'ended' && (
            <button
              onClick={() =>
                navigate(`/summary/${roomId}?d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)
              }
              className="bg-red-600 hover:bg-red-500 text-white font-black text-lg px-10 py-3 rounded-xl"
              style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
            >
              📊 VIEW RESULTS
            </button>
          )}
        </div>
      </div>

      {/* Roast card overlay */}
      <RoastCard roast={currentRoast} onDismiss={() => setCurrentRoast(null)} />
    </div>
  )
}

function StatusBadge({ status }) {
  const configs = {
    waiting: { color: 'bg-yellow-600', label: 'WAITING', pulse: false },
    active: { color: 'bg-green-600', label: 'LIVE', pulse: true },
    ended: { color: 'bg-gray-600', label: 'ENDED', pulse: false },
  }
  const { color, label, pulse } = configs[status] || configs.waiting

  return (
    <div className={`${color} text-white text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5`}>
      {pulse && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
      {label}
    </div>
  )
}
