import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

export default function SummaryScreen() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/rooms/${roomId}/summary`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [roomId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg animate-pulse">Loading results...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-red-400">Failed to load summary: {error}</div>
      </div>
    )
  }

  const { room, roasts } = data
  const scores = room?.scores || { [d1]: 0, [d2]: 0 }
  const debaters = room?.debaters || [d1, d2]

  const s1 = scores[debaters[0]] || 0
  const s2 = scores[debaters[1]] || 0
  const winner = s1 > s2 ? debaters[0] : s2 > s1 ? debaters[1] : null
  const loser = s1 > s2 ? debaters[1] : s2 > s1 ? debaters[0] : null

  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1
            className="text-5xl font-black text-red-500 mb-2"
            style={{ fontFamily: 'Impact, Arial Black, sans-serif', textShadow: '0 0 25px rgba(239,68,68,0.4)' }}
          >
            DEBATE<span className="text-white">ROAST</span>
          </h1>
          <p className="text-gray-400">Post-Debate Summary · Room {roomId}</p>
          {room?.topic && (
            <p className="text-gray-300 mt-1 italic">"{room.topic}"</p>
          )}
        </motion.div>

        {/* Verdict */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-6 text-center"
        >
          {winner ? (
            <>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Final Verdict</p>
              <p className="text-4xl font-black text-white mb-1" style={{ fontFamily: 'Impact, sans-serif' }}>
                {loser} GOT ROASTED THE MOST
              </p>
              <p className="text-red-400 text-lg font-semibold">
                🏆 {winner} survived with {Math.min(s1, s2)} roasts vs {Math.max(s1, s2)} roasts
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Final Verdict</p>
              <p className="text-3xl font-black text-yellow-400" style={{ fontFamily: 'Impact, sans-serif' }}>
                IT'S A TIE — BOTH OF THEM WERE TERRIBLE
              </p>
              <p className="text-gray-400 mt-1">{s1} roasts each</p>
            </>
          )}
        </motion.div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {debaters.map((name, i) => {
            const score = scores[name] || 0
            const fallacies = room?.fallacyTypes?.[name] || {}
            return (
              <motion.div
                key={name}
                initial={{ opacity: 0, x: i === 0 ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className={`bg-gray-900 border rounded-xl p-4 ${
                  i === 0 ? 'border-blue-700/40' : 'border-purple-700/40'
                }`}
              >
                <p
                  className={`font-black text-lg uppercase ${
                    i === 0 ? 'text-blue-400' : 'text-purple-400'
                  }`}
                  style={{ fontFamily: 'Impact, sans-serif' }}
                >
                  {name}
                </p>
                <p className="text-3xl font-black text-white mt-1">
                  {score} <span className="text-gray-500 text-base font-normal">roasts</span>
                </p>
                {Object.keys(fallacies).length > 0 && (
                  <div className="mt-2">
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Fallacy Breakdown</p>
                    {Object.entries(fallacies).map(([f, count]) => (
                      <div key={f} className="flex justify-between text-xs text-gray-400">
                        <span>{f}</span>
                        <span className="font-bold text-red-400">×{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>

        {/* Roast log */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-6"
        >
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-gray-200 font-bold uppercase tracking-wide text-sm">
              🔥 All Roasts ({roasts.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-800/50">
            {roasts.length === 0 && (
              <p className="text-gray-500 text-center py-8 italic">
                No one got roasted... either you're both Aristotle or nobody talked.
              </p>
            )}
            {roasts.map((roast, i) => (
              <RoastLogEntry key={i} roast={roast} index={i} />
            ))}
          </div>
        </motion.div>

        {/* New debate button */}
        <div className="text-center">
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-500 text-white font-black text-xl px-10 py-4 rounded-xl shadow-lg transition-colors"
            style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
          >
            🔥 NEW DEBATE 🔥
          </button>
        </div>
      </div>
    </div>
  )
}

function RoastLogEntry({ roast, index }) {
  const time = new Date(roast.timestamp).toLocaleTimeString()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index }}
      className="px-4 py-4 hover:bg-gray-800/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="text-gray-600 text-xs font-mono mt-0.5 flex-shrink-0">{String(index + 1).padStart(2, '0')}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="bg-red-900/50 text-red-300 text-xs font-bold px-2 py-0.5 rounded-full uppercase">
              {roast.speaker}
            </span>
            {roast.type === 'FALLACY' && roast.fallacyName && (
              <span className="bg-orange-900/50 text-orange-300 text-xs px-2 py-0.5 rounded-full">
                {roast.fallacyName}
              </span>
            )}
            {roast.type === 'FACTUAL_CLAIM' && (
              <span className="bg-yellow-900/50 text-yellow-300 text-xs px-2 py-0.5 rounded-full">
                Fact Check {roast.factVerdict && `· ${roast.factVerdict}`}
              </span>
            )}
            <span className="text-gray-600 text-xs ml-auto">{time}</span>
          </div>
          <p className="text-gray-500 text-xs italic mb-1.5">"{roast.utterance}"</p>
          <p className="text-red-500 font-black text-sm">{roast.stopPhrase}</p>
          <p className="text-gray-300 text-sm mt-1 leading-relaxed">{roast.roast}</p>
          {roast.factSource && (
            <p className="text-gray-500 text-xs mt-1 italic">Source: {roast.factSource}</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
