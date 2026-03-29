import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../hooks/useSocket.js'
import { useAudio, playBase64Audio } from '../hooks/useAudio.js'

export default function EnhancedDebateScreen() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const myName = searchParams.get('name') || 'Debater'
  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'
  const roastLevel = searchParams.get('roastLevel') || sessionStorage.getItem('roastLevel') || 'intermediate'

  const [room, setRoom] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [roastAlerts, setRoastAlerts] = useState([])
  const [currentSpeaker, setCurrentSpeaker] = useState(null)
  const [roastCounter, setRoastCounter] = useState({
    totalRoasts: 0,
    fallacies: 0,
    factFlags: 0,
    interruptions: 0,
  })
  const [truthScores, setTruthScores] = useState({ [d1]: 85, [d2]: 85 })
  const [debateStatus, setDebateStatus] = useState('waiting')
  const [connectedPeers, setConnectedPeers] = useState(new Set())
  const [isHost, setIsHost] = useState(false)
  const [debateTimer, setDebateTimer] = useState(0)

  const openingPlayedRef = useRef(false)
  const debateStatusRef = useRef(debateStatus)

  const getUserTheme = (debaterName) => {
    if (debaterName === d1) {
      return {
        bg: 'from-blue-500/10 to-cyan-500/10',
        border: 'border-blue-500/40',
        text: 'text-blue-400',
        dot: 'bg-blue-400',
      }
    } else {
      return {
        bg: 'from-purple-500/10 to-pink-500/10',
        border: 'border-purple-500/40',
        text: 'text-purple-400',
        dot: 'bg-purple-400',
      }
    }
  }

  useEffect(() => { debateStatusRef.current = debateStatus }, [debateStatus])

  useEffect(() => {
    let interval
    if (debateStatus === 'active') {
      interval = setInterval(() => setDebateTimer((prev) => prev + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [debateStatus])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

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
    debate_started: ({ room: updatedRoom }) => {
      setRoom(updatedRoom)
      setDebateStatus('active')
      setDebateTimer(0)
    },
    opening_audio: async ({ audioBase64 }) => {
      if (audioBase64 && !openingPlayedRef.current) {
        openingPlayedRef.current = true
        await playBase64Audio(audioBase64)
      }
    },
    transcript: (entry) => {
      setTranscript((prev) => [...prev.slice(-50), entry])
      setCurrentSpeaker(entry.speaker)
    },
    roast: async (payload) => {
      const newAlert = {
        id: Date.now(),
        type: payload.fallacyName || payload.type || 'Logic Error',
        speaker: payload.speaker,
        message: payload.message || payload.text,
        timestamp: Date.now(),
      }

      setRoastAlerts((prev) => [newAlert, ...prev.slice(0, 9)])

      setRoastCounter((prev) => ({
        totalRoasts: prev.totalRoasts + 1,
        fallacies: payload.fallacyName ? prev.fallacies + 1 : prev.fallacies,
        factFlags: payload.type === 'FACTUAL_CLAIM' ? prev.factFlags + 1 : prev.factFlags,
        interruptions: prev.interruptions,
      }))

      if (payload.scores) setTruthScores(payload.scores)

      setTranscript((prev) => [
        ...prev,
        {
          speaker: 'AI_ROAST',
          text: `${payload.speaker}: ${payload.fallacyName || payload.type}`,
          timestamp: Date.now(),
        },
      ])

      if (payload.audioBase64) await playBase64Audio(payload.audioBase64)
    },
    debate_ended: () => setDebateStatus('ended'),
  })

  useEffect(() => {
    emit('join_room', { roomId, speakerName: myName }, (res) => {
      if (res?.error) { console.error('Join error:', res.error); return }
      if (res?.room) {
        setRoom(res.room)
        setTruthScores(res.room.scores || { [d1]: 85, [d2]: 85 })
        setDebateStatus(res.room.status || 'waiting')
        setIsHost(res.room.debaters[0] === myName)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChunk = useCallback(
    (base64Chunk) => {
      if (debateStatusRef.current !== 'active') return
      emit('audio_chunk', { roomId, speakerName: myName, chunk: base64Chunk })
    },
    [emit, roomId, myName]
  )

  const { start: startMic, stop: stopMic, isRecording, error: micError } = useAudio(handleChunk)

  async function handleStartDebate() {
    emit('start_debate', { roomId, roastMode: roastLevel }, (res) => {
      if (res?.error) console.error('Start error:', res.error)
    })
    await startMic()
  }

  async function handleToggleMic() {
    if (isRecording) stopMic()
    else await startMic()
  }

  function handleEndDebate() {
    stopMic()
    emit('end_debate', { roomId }, () => navigate(`/report/${roomId}`))
  }

  useEffect(() => {
    if (debateStatus === 'active' && !isRecording && !isHost) startMic()
  }, [debateStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* TOP BAR */}
      <div className="bg-gray-900 border-b border-gray-800 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          {/* Logo + live */}
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-red-500 tracking-tight">
              DEBATE<span className="text-white">ROAST</span>
            </h1>
            {debateStatus === 'active' && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
                <span className="text-gray-500">LIVE</span>
                <span className="text-white font-mono">{formatTime(debateTimer)}</span>
              </div>
            )}
          </div>

          {/* Topic */}
          <div className="text-center">
            {room?.topic && (
              <p className="text-white font-semibold">{room.topic}</p>
            )}
            <div className="flex items-center justify-center gap-3 mt-0.5 text-xs text-gray-500">
              <span>Room <span className="text-gray-300 font-mono">{roomId}</span></span>
              <span>·</span>
              <span className="capitalize text-gray-400">{roastLevel} mode</span>
            </div>
          </div>

          {/* Counters */}
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-red-400 font-bold text-lg leading-tight">{roastCounter.totalRoasts}</div>
              <div className="text-gray-600 text-xs uppercase tracking-wide">Roasts</div>
            </div>
            <div className="text-center">
              <div className="text-orange-400 font-bold text-lg leading-tight">{roastCounter.fallacies}</div>
              <div className="text-gray-600 text-xs uppercase tracking-wide">Fallacies</div>
            </div>
            <div className="text-center">
              <div className="text-yellow-400 font-bold text-lg leading-tight">{roastCounter.factFlags}</div>
              <div className="text-gray-600 text-xs uppercase tracking-wide">Fact Flags</div>
            </div>
          </div>
        </div>
      </div>

      {/* DEBATER STRIP */}
      <div className="border-b border-gray-800/60 px-8 py-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-6">
          {[d1, d2].map((name) => {
            const theme = getUserTheme(name)
            const online = connectedPeers.has(name) || myName === name
            return (
              <div key={name} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${theme.bg} border ${theme.border} flex items-center justify-center font-bold text-sm ${theme.text} ${myName === name ? 'ring-2 ring-offset-2 ring-offset-gray-950 ring-current' : ''}`}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">{name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${online ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span>Score {truthScores[name] ?? 85}</span>
                  </div>
                </div>
                {currentSpeaker === name && debateStatus === 'active' && (
                  <span className="ml-auto text-xs text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                    speaking
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* MAIN PANELS */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-8 py-6 flex gap-6 min-h-0">

        {/* TRANSCRIPT */}
        <div className="flex-1 bg-gray-900/40 border border-gray-800 rounded-2xl flex flex-col min-h-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800/60">
            <h3 className="text-gray-300 font-semibold text-sm uppercase tracking-wider">Live Transcript</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2">
            <AnimatePresence initial={false}>
              {transcript.slice(-20).map((entry, index) => {
                const theme = entry.speaker !== 'SYSTEM' && entry.speaker !== 'AI_ROAST'
                  ? getUserTheme(entry.speaker)
                  : null

                return (
                  <motion.div
                    key={`${entry.timestamp}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${
                      entry.speaker === 'SYSTEM'
                        ? 'text-gray-500 text-xs italic'
                        : entry.speaker === 'AI_ROAST'
                        ? 'bg-red-950/40 border border-red-500/20 text-red-300'
                        : `bg-gradient-to-r ${theme.bg} border ${theme.border} text-gray-100`
                    }`}
                  >
                    {entry.speaker !== 'SYSTEM' && (
                      <span className={`font-semibold mr-2 text-xs ${
                        entry.speaker === 'AI_ROAST' ? 'text-red-400' : theme.text
                      }`}>
                        {entry.speaker === 'AI_ROAST' ? 'AI' : entry.speaker}
                      </span>
                    )}
                    {entry.text}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* AI ANALYSIS */}
        <div className="w-88 bg-gray-900/40 border border-gray-800 rounded-2xl flex flex-col min-h-0 overflow-hidden" style={{ width: '22rem' }}>
          <div className="px-6 py-4 border-b border-gray-800/60 flex items-center justify-between">
            <h3 className="text-gray-300 font-semibold text-sm uppercase tracking-wider">AI Analysis</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse inline-block" />
              Listening
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
            <AnimatePresence initial={false}>
              {roastAlerts.length === 0 ? (
                <div className="text-center text-gray-600 py-12 text-sm">
                  Monitoring for fallacies and claims...
                </div>
              ) : (
                roastAlerts.map((alert) => {
                  const theme = getUserTheme(alert.speaker)
                  return (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-red-400 font-semibold text-xs uppercase tracking-wide">
                          {alert.type}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-gradient-to-r ${theme.bg} ${theme.text}`}>
                          {alert.speaker}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed border-l-2 border-red-500/40 pl-3">
                        {alert.message}
                      </p>
                    </motion.div>
                  )
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROLS */}
      <div className="bg-gray-900 border-t border-gray-800 px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-4">

          {debateStatus === 'waiting' && isHost && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartDebate}
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-lg px-14 py-3.5 rounded-xl shadow-lg transition-colors"
            >
              Start Debate
            </motion.button>
          )}

          {debateStatus === 'waiting' && !isHost && (
            <p className="text-gray-500 text-sm">Waiting for the host to start...</p>
          )}

          {debateStatus === 'active' && (
            <>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleToggleMic}
                className={`${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-gray-700 hover:bg-gray-600'
                } text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2`}
              >
                <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
                {isRecording ? 'Mic On' : 'Mic Off'}
              </motion.button>

              {micError && <p className="text-red-400 text-sm">{micError}</p>}

              {isHost && (
                <button
                  onClick={handleEndDebate}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-6 py-3 rounded-xl border border-gray-700 transition-colors text-sm font-medium"
                >
                  End Debate
                </button>
              )}
            </>
          )}

          {debateStatus === 'ended' && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/report/${roomId}`)}
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-lg px-14 py-3.5 rounded-xl shadow-lg transition-colors"
            >
              View Results
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )
}
