import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocket } from '../hooks/useSocket.js'
import { playBase64Audio } from '../hooks/useAudio.js'
import { useTranscription } from '../hooks/useTranscription.js'
import RoastCard from '../components/RoastCard.jsx'

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
    interruptions: 0
  })
  const [truthScores, setTruthScores] = useState({ [d1]: 85, [d2]: 85 })
  const [debateStatus, setDebateStatus] = useState('waiting')
  const [connectedPeers, setConnectedPeers] = useState(new Set())
  const [isHost, setIsHost] = useState(false)
  const [debateTimer, setDebateTimer] = useState(0)
  const [interimText, setInterimText] = useState('')
  const [otherInterimText, setOtherInterimText] = useState({ speaker: null, text: '' })
  const [currentRoast, setCurrentRoast] = useState(null)

  const openingPlayedRef = useRef(false)
  const debateStatusRef = useRef(debateStatus)

  // Get user color theme
  const getUserTheme = (debaterName) => {
    if (debaterName === d1) {
      return {
        primary: 'blue',
        accent: 'cyan',
        bg: 'from-blue-500/10 to-cyan-500/10',
        border: 'border-blue-500/50',
        text: 'text-blue-400',
        ring: 'ring-blue-500/30',
        glow: 'shadow-blue-500/20'
      }
    } else {
      return {
        primary: 'purple', 
        accent: 'pink',
        bg: 'from-purple-500/10 to-pink-500/10',
        border: 'border-purple-500/50',
        text: 'text-purple-400',
        ring: 'ring-purple-500/30',
        glow: 'shadow-purple-500/20'
      }
    }
  }

  const myTheme = getUserTheme(myName)

  // Keep debateStatusRef in sync so handleChunk never has a stale closure
  useEffect(() => { debateStatusRef.current = debateStatus }, [debateStatus])

  // Timer effect
  useEffect(() => {
    let interval
    if (debateStatus === 'active') {
      interval = setInterval(() => {
        setDebateTimer(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [debateStatus])

  // Format timer
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Socket handlers
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
      setOtherInterimText(prev => prev.speaker === entry.speaker ? { speaker: null, text: '' } : prev)
    },
    roast: async (payload) => {
      // Add to roast alerts
      const newAlert = {
        id: Date.now(),
        type: payload.fallacyName || payload.type || 'Logic Error',
        speaker: payload.speaker,
        message: payload.roast || payload.text,
        roastMessage: payload.roast || payload.text,
        confidence: payload.confidence || Math.floor(Math.random() * 20) + 80,
        timestamp: Date.now()
      }

      setCurrentRoast(payload)
      setRoastAlerts(prev => [newAlert, ...prev.slice(0, 9)])
      
      // Update counters
      setRoastCounter(prev => ({
        totalRoasts: prev.totalRoasts + 1,
        fallacies: payload.fallacyName ? prev.fallacies + 1 : prev.fallacies,
        factFlags: payload.type === 'FACTUAL_CLAIM' ? prev.factFlags + 1 : prev.factFlags,
        interruptions: payload.reactionType === 'ROAST' ? prev.interruptions + 1 : prev.interruptions
      }))
      
      // Update truth scores
      if (payload.scores) {
        setTruthScores(payload.scores)
      }

      // Add to transcript
      setTranscript((prev) => [
        ...prev,
        {
          speaker: 'AI_ROAST',
          text: `🔥 ${payload.speaker}: ${payload.fallacyName || payload.type}`,
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
    interim_transcript: ({ speaker, text }) => {
      setOtherInterimText({ speaker, text })
    },
  })

  // Join room on mount
  useEffect(() => {
    emit('join_room', { roomId, speakerName: myName }, (res) => {
      if (res?.error) {
        console.error('Join error:', res.error)
        return
      }
      if (res?.room) {
        setRoom(res.room)
        setTruthScores(res.room.scores || { [d1]: 85, [d2]: 85 })
        setDebateStatus(res.room.status || 'waiting')
        setIsHost(res.room.debaters[0] === myName)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When speech is finalized, send text to backend for broadcast + Groq analysis
  const handleFinal = useCallback((text) => {
    if (debateStatusRef.current !== 'active') return
    emit('transcript_text', { roomId, speakerName: myName, text })
    setInterimText('')
  }, [emit, roomId, myName])

  const handleInterim = useCallback((text) => {
    setInterimText(text)
    if (debateStatusRef.current === 'active') {
      emit('interim_transcript', { roomId, speakerName: myName, text })
    }
  }, [emit, roomId, myName])

  const { start: startMic, stop: stopMic, isListening: isRecording, error: micError } = useTranscription(handleFinal, handleInterim)

  // Start debate
  function handleStartDebate() {
    emit('start_debate', { roomId }, (res) => {
      if (res?.error) console.error('Start error:', res.error)
    })
    startMic()
  }

  // Toggle mic
  function handleToggleMic() {
    if (isRecording) {
      stopMic()
    } else {
      startMic()
    }
  }

  // End debate
  function handleEndDebate() {
    stopMic()
    setInterimText('')
    emit('end_debate', { roomId }, () => {
      navigate(`/summary/${roomId}?d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)
    })
  }

  // Auto start mic for non-hosts when debate goes active
  useEffect(() => {
    if (debateStatus === 'active' && !isRecording && !isHost) {
      startMic()
    }
  }, [debateStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`min-h-screen bg-gray-950 flex flex-col overflow-hidden ${myTheme.ring} ring-1`} 
         style={{ boxShadow: `inset 0 0 100px ${myTheme.glow}` }}>
      
      {/* TOP BAR */}
      <div className="bg-gray-900/90 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-black text-red-500 tracking-tight">
              DEBATE<span className="text-white">ROAST</span>
            </h1>
            {debateStatus === 'active' && (
              <div className="flex items-center space-x-2 text-gray-400 text-sm">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span>LIVE</span>
                <span className="text-white font-mono">{formatTime(debateTimer)}</span>
              </div>
            )}
          </div>

          {/* Center: Topic & Room Details */}
          <div className="text-center">
            {room?.topic && (
              <p className="text-white font-medium text-lg mb-1">{room.topic}</p>
            )}
            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>Room: <span className="text-white font-mono font-bold">{roomId}</span></span>
              <span>Mode: <span className="text-red-400 capitalize">{roastLevel}</span></span>
            </div>
          </div>

          {/* Right: Roast Counters */}
          <div className="flex items-center space-x-6 text-sm">
            <div className="text-center">
              <div className="text-red-400 font-bold text-lg">{roastCounter.totalRoasts}</div>
              <div className="text-gray-500 text-xs uppercase">Roasts</div>
            </div>
            <div className="text-center">
              <div className="text-orange-400 font-bold text-lg">{roastCounter.fallacies}</div>
              <div className="text-gray-500 text-xs uppercase">Fallacies</div>
            </div>
            <div className="text-center">
              <div className="text-yellow-400 font-bold text-lg">{roastCounter.factFlags}</div>
              <div className="text-gray-500 text-xs uppercase">Fact Flags</div>
            </div>
            <div className="text-center">
              <div className="text-purple-400 font-bold text-lg">{roastCounter.interruptions}</div>
              <div className="text-gray-500 text-xs uppercase">Interrupts</div>
            </div>
          </div>
        </div>
      </div>

      {/* SPEAKER COMPARISON WIDGET */}
      <div className="bg-gray-900/50 border-b border-gray-800/50 px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 gap-8">
            {/* Debater 1 */}
            <div className={`text-center ${getUserTheme(d1).text}`}>
              <div className="flex items-center justify-center space-x-4">
                <div className={`w-12 h-12 ${getUserTheme(d1).bg} ${getUserTheme(d1).border} border-2 rounded-full flex items-center justify-center font-bold text-lg ${myName === d1 ? 'animate-pulse' : ''}`}>
                  {d1.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-white">{d1}</div>
                  <div className="text-xs text-gray-400">
                    Truth Score: {truthScores[d1] || 85}%
                    {connectedPeers.has(d1) || myName === d1 ? (
                      <span className="ml-2 text-green-400">●</span>
                    ) : (
                      <span className="ml-2 text-red-400">●</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Debater 2 */}
            <div className={`text-center ${getUserTheme(d2).text}`}>
              <div className="flex items-center justify-center space-x-4">
                <div className={`w-12 h-12 ${getUserTheme(d2).bg} ${getUserTheme(d2).border} border-2 rounded-full flex items-center justify-center font-bold text-lg ${myName === d2 ? 'animate-pulse' : ''}`}>
                  {d2.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-white">{d2}</div>
                  <div className="text-xs text-gray-400">
                    Truth Score: {truthScores[d2] || 85}%
                    {connectedPeers.has(d2) || myName === d2 ? (
                      <span className="ml-2 text-green-400">●</span>
                    ) : (
                      <span className="ml-2 text-red-400">●</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex gap-6 min-h-0">
        
        {/* LEFT: LIVE TRANSCRIPT PANEL */}
        <div className="flex-1 bg-gray-900/60 border border-gray-800 rounded-xl p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-300 font-semibold text-lg">Live Transcript</h3>
            {currentSpeaker && currentSpeaker !== 'SYSTEM' && (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm">{currentSpeaker} speaking</span>
              </div>
            )}
          </div>
          
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            <AnimatePresence initial={false}>
              {transcript.slice(-20).map((entry, index) => (
                <motion.div
                  key={`${entry.timestamp}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`p-3 rounded-lg ${
                    entry.speaker === 'SYSTEM'
                      ? 'bg-gray-800 text-gray-400 text-sm'
                      : entry.speaker === 'AI_ROAST'
                      ? 'bg-red-900/30 border border-red-500/30 text-red-300'
                      : entry.speaker === d1
                      ? `${getUserTheme(d1).bg} ${getUserTheme(d1).border} border text-white`
                      : `${getUserTheme(d2).bg} ${getUserTheme(d2).border} border text-white`
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <span className={`font-medium text-sm ${
                      entry.speaker === 'SYSTEM' ? 'text-gray-500' :
                      entry.speaker === 'AI_ROAST' ? 'text-red-400' :
                      entry.speaker === d1 ? getUserTheme(d1).text :
                      getUserTheme(d2).text
                    }`}>
                      {entry.speaker === 'AI_ROAST' ? '🤖 AI' : entry.speaker}:
                    </span>
                    <span className="text-gray-100">{entry.text}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Other speaker's live interim speech */}
            {otherInterimText.text && (
              <div className={`p-3 rounded-lg opacity-70 border border-dashed ${
                otherInterimText.speaker === d1
                  ? `${getUserTheme(d1).border} ${getUserTheme(d1).bg}`
                  : `${getUserTheme(d2).border} ${getUserTheme(d2).bg}`
              }`}>
                <div className="flex items-start space-x-3">
                  <span className={`font-medium text-sm ${
                    otherInterimText.speaker === d1 ? getUserTheme(d1).text : getUserTheme(d2).text
                  }`}>
                    {otherInterimText.speaker}:
                  </span>
                  <span className="text-gray-300 italic">{otherInterimText.text}</span>
                  <span className="w-2 h-4 bg-current animate-pulse ml-1 inline-block" />
                </div>
              </div>
            )}

            {/* My own live interim speech */}
            {interimText && (
              <div className={`p-3 rounded-lg opacity-70 border border-dashed ${myTheme.border} ${myTheme.bg}`}>
                <div className="flex items-start space-x-3">
                  <span className={`font-medium text-sm ${myTheme.text}`}>{myName}:</span>
                  <span className="text-gray-300 italic">{interimText}</span>
                  <span className="w-2 h-4 bg-current animate-pulse ml-1 inline-block" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: AI REAL-TIME ALERT PANEL */}
        <div className="w-96 bg-gray-900/60 border border-gray-800 rounded-xl p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-red-400 font-semibold text-lg">AI Analysis</h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
              <span className="text-red-400 text-sm">Listening</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            <AnimatePresence initial={false}>
              {roastAlerts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-2">🧠</div>
                  <p>Analyzing debate for fallacies...</p>
                </div>
              ) : (
                roastAlerts.map((alert) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: 50, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -50 }}
                    className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 hover:bg-red-900/30 transition-colors"
                  >
                    {/* Alert Header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-red-400 font-bold text-sm uppercase tracking-wide">
                        {alert.type}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-400">
                          {alert.confidence}% confident
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          alert.speaker === d1 ? 
                          `${getUserTheme(d1).bg} ${getUserTheme(d1).text}` :
                          `${getUserTheme(d2).bg} ${getUserTheme(d2).text}`
                        }`}>
                          {alert.speaker}
                        </span>
                      </div>
                    </div>

                    {/* Explanation */}
                    <p className="text-gray-300 text-sm mb-3">{alert.message}</p>

                    {/* Roast Message */}
                    <div className="bg-gray-800/50 rounded p-2 border-l-4 border-red-500">
                      <p className="text-red-300 font-medium text-sm italic">
                        "{alert.roastMessage}"
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ROAST POPUP */}
      <RoastCard roast={currentRoast} onDismiss={() => setCurrentRoast(null)} />

      {/* BOTTOM CONTROLS */}
      <div className="bg-gray-900/90 backdrop-blur border-t border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-center space-x-6">
          
          {debateStatus === 'waiting' && isHost && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartDebate}
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xl px-12 py-4 rounded-xl shadow-lg"
            >
              🔥 START DEBATE 🔥
            </motion.button>
          )}

          {debateStatus === 'waiting' && !isHost && (
            <div className="text-center">
              <div className="text-gray-400 mb-2">👥 Both debaters connected</div>
              <p className="text-gray-500 text-sm">Waiting for host to start the debate...</p>
            </div>
          )}

          {debateStatus === 'active' && (
            <>
              {/* Mic control */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleToggleMic}
                className={`${
                  isRecording
                    ? 'bg-red-600 hover:bg-red-500 animate-pulse'
                    : 'bg-gray-700 hover:bg-gray-600'
                } text-white font-bold px-8 py-3 rounded-xl transition-all flex items-center space-x-2`}
              >
                <span>{isRecording ? '🎙️' : '🔇'}</span>
                <span>{isRecording ? 'Mic ON' : 'Mic OFF'}</span>
              </motion.button>

              {micError && (
                <p className="text-red-400 text-sm">Mic error: {micError}</p>
              )}

              {/* Pause option */}
              <button className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-xl transition-colors">
                ⏸️ Pause Analysis
              </button>

              {/* End debate (host only) */}
              {isHost && (
                <button
                  onClick={handleEndDebate}
                  className="bg-gray-800 hover:bg-gray-700 text-red-400 hover:text-red-300 px-6 py-3 rounded-xl border border-gray-700 hover:border-red-500/30 transition-colors"
                >
                  🏁 End Debate
                </button>
              )}
            </>
          )}

          {debateStatus === 'ended' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() =>
                navigate(`/summary/${roomId}?d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)
              }
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xl px-12 py-4 rounded-xl shadow-lg"
            >
              📊 VIEW RESULTS 📊
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )
}