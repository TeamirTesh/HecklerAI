import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../hooks/useSocket.js'
import { playBase64Audio } from '../hooks/useAudio.js'

export default function SpectateScreen() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'

  const [room, setRoom] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [roastAlerts, setRoastAlerts] = useState([])
  const [scores, setScores] = useState({ [d1]: 0, [d2]: 0 })
  const [debateStatus, setDebateStatus] = useState('waiting')
  const [currentSpeaker, setCurrentSpeaker] = useState(null)
  const [debateTimer, setDebateTimer] = useState(0)

  const openingPlayedRef = useRef(false)
  const transcriptEndRef = useRef(null)

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Timer
  useEffect(() => {
    let interval
    if (debateStatus === 'active') {
      interval = setInterval(() => setDebateTimer(prev => prev + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [debateStatus])

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const getTheme = (name) => name === d1
    ? { bg: 'from-blue-500/10 to-cyan-500/10', border: 'border-blue-500/50', text: 'text-blue-400' }
    : { bg: 'from-purple-500/10 to-pink-500/10', border: 'border-purple-500/50', text: 'text-purple-400' }

  const { emit } = useSocket({
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
      setTranscript((prev) => [...prev.slice(-200), entry])
      setCurrentSpeaker(entry.speaker)
    },
    roast: async (payload) => {
      setScores(payload.scores || scores)
      setRoastAlerts(prev => [{
        id: Date.now(),
        type: payload.fallacyName || payload.type || 'Logic Error',
        speaker: payload.speaker,
        roastMessage: payload.roast || payload.text,
        confidence: payload.confidence || Math.floor(Math.random() * 20) + 80,
      }, ...prev.slice(0, 9)])
      setTranscript((prev) => [...prev, {
        speaker: 'AI_ROAST',
        text: `🔥 ${payload.speaker}: ${payload.fallacyName || payload.type}`,
        timestamp: Date.now(),
      }])
      if (payload.audioBase64) await playBase64Audio(payload.audioBase64)
    },
    debate_ended: () => setDebateStatus('ended'),
  })

  useEffect(() => {
    emit('join_room', { roomId, speakerName: 'Spectator', isSpectator: true }, (res) => {
      if (res?.room) {
        setRoom(res.room)
        setScores(res.room.scores || { [d1]: 0, [d2]: 0 })
        setDebateStatus(res.room.status || 'waiting')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900/90 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-black text-red-500">DEBATE<span className="text-white">ROAST</span></h1>
            {debateStatus === 'active' && (
              <div className="flex items-center space-x-2 text-gray-400 text-sm">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span>LIVE</span>
                <span className="text-white font-mono">{formatTime(debateTimer)}</span>
              </div>
            )}
          </div>

          <div className="text-center">
            {room?.topic && <p className="text-white font-medium">{room.topic}</p>}
            <p className="text-gray-400 text-sm">Room: <span className="text-white font-mono font-bold">{roomId}</span></p>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-white rounded-full" />
              SPECTATING
            </div>
            <StatusBadge status={debateStatus} />
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="bg-gray-900/50 border-b border-gray-800/50 px-6 py-3">
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-8">
          {[d1, d2].map(name => (
            <div key={name} className={`text-center ${getTheme(name).text}`}>
              <div className="flex items-center justify-center space-x-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${getTheme(name).bg} ${getTheme(name).border} border-2 rounded-full flex items-center justify-center font-bold text-white`}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-white">{name}</div>
                  <div className="text-xs text-gray-400">{scores[name] || 0} roasts</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex gap-6 min-h-0">
        {/* Live Transcript */}
        <div className="flex-1 bg-gray-900/60 border border-gray-800 rounded-xl p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-300 font-semibold text-lg">Live Transcript</h3>
            {currentSpeaker && currentSpeaker !== 'SYSTEM' && currentSpeaker !== 'AI_ROAST' && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm">{currentSpeaker} speaking</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            <AnimatePresence initial={false}>
              {transcript.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  {debateStatus === 'waiting' ? 'Waiting for the debate to start...' : 'Listening for speech...'}
                </div>
              )}
              {transcript.slice(-50).map((entry, index) => (
                <motion.div
                  key={`${entry.timestamp}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-lg ${
                    entry.speaker === 'SYSTEM'
                      ? 'bg-gray-800 text-gray-400 text-sm'
                      : entry.speaker === 'AI_ROAST'
                      ? 'bg-red-900/30 border border-red-500/30 text-red-300'
                      : entry.speaker === d1
                      ? `bg-gradient-to-br ${getTheme(d1).bg} ${getTheme(d1).border} border text-white`
                      : `bg-gradient-to-br ${getTheme(d2).bg} ${getTheme(d2).border} border text-white`
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <span className={`font-medium text-sm shrink-0 ${
                      entry.speaker === 'SYSTEM' ? 'text-gray-500' :
                      entry.speaker === 'AI_ROAST' ? 'text-red-400' :
                      entry.speaker === d1 ? getTheme(d1).text : getTheme(d2).text
                    }`}>
                      {entry.speaker === 'AI_ROAST' ? '🤖 AI' : entry.speaker}:
                    </span>
                    <span className="text-gray-100">{entry.text}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* AI Alerts */}
        <div className="w-80 bg-gray-900/60 border border-gray-800 rounded-xl p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-red-400 font-semibold text-lg">AI Alerts</h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              <span className="text-red-400 text-sm">Watching</span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {roastAlerts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-3xl mb-2">🧠</div>
                <p className="text-sm">Waiting for fallacies...</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {roastAlerts.map(alert => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-red-900/20 border border-red-500/30 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-red-400 font-bold text-xs uppercase">{alert.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getTheme(alert.speaker).bg} ${getTheme(alert.speaker).text}`}>
                        {alert.speaker}
                      </span>
                    </div>
                    <p className="text-red-300 text-sm italic">"{alert.roastMessage}"</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="bg-gray-900 border-t border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          {debateStatus === 'waiting' && <p className="text-gray-400 text-sm">Waiting for the debate to start...</p>}
          {debateStatus === 'active' && <p className="text-gray-500 text-sm">👁 Watching live — audio and roasts play in real time</p>}
          {debateStatus === 'ended' && (
            <button
              onClick={() => navigate(`/summary/${roomId}?d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)}
              className="bg-red-600 hover:bg-red-500 text-white font-black text-lg px-10 py-3 rounded-xl"
            >
              📊 VIEW RESULTS
            </button>
          )}
        </div>
      </div>
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
