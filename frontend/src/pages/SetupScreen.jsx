import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function SetupScreen() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [debater1, setDebater1] = useState('')
  const [debater2, setDebater2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleStart(e) {
    e.preventDefault()
    if (!topic.trim() || !debater1.trim() || !debater2.trim()) {
      setError('All fields are required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          topic: topic.trim(),
          debater1: debater1.trim(),
          debater2: debater2.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to create room')
      const { roomId } = await res.json()
      // Navigate to AI preparation screen first
      navigate(`/preparing/${roomId}?topic=${encodeURIComponent(topic.trim())}&d1=${encodeURIComponent(debater1.trim())}&d2=${encodeURIComponent(debater2.trim())}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-10"
        >
          <h1 className="text-6xl font-black tracking-tighter text-red-500 drop-shadow-lg"
              style={{ fontFamily: 'Impact, Arial Black, sans-serif', textShadow: '0 0 30px rgba(239,68,68,0.5)' }}>
            DEBATE<span className="text-white">ROAST</span>
          </h1>
          <p className="text-gray-400 text-lg mt-2 font-medium">
            Real-time AI accountability for live debates.
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          onSubmit={handleStart}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl space-y-5"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5 uppercase tracking-wide">
              Debate Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Pineapple belongs on pizza"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1.5 uppercase tracking-wide">
                Debater 1
              </label>
              <input
                type="text"
                value={debater1}
                onChange={(e) => setDebater1(e.target.value)}
                placeholder="Name"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1.5 uppercase tracking-wide">
                Debater 2
              </label>
              <input
                type="text"
                value={debater2}
                onChange={(e) => setDebater2(e.target.value)}
                placeholder="Name"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm font-medium">{error}</p>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:cursor-not-allowed text-white font-black text-xl py-4 rounded-xl transition-colors shadow-lg shadow-red-900/40 tracking-wide"
            style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
          >
            {loading ? 'CREATING ROOM...' : '🔥 START DEBATE 🔥'}
          </motion.button>

          <p className="text-center text-gray-500 text-xs">
            Share the room link with the other debater to join on their device
          </p>
        </motion.form>

        {/* Join existing room */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center"
        >
          <JoinRoomForm />
        </motion.div>
      </div>
    </div>
  )
}

function JoinRoomForm() {
  const navigate = useNavigate()
  const [roomId, setRoomId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  async function handleJoin(e) {
    e.preventDefault()
    if (!roomId.trim() || !name.trim()) {
      setError('Room code and name required')
      return
    }
    const upperRoomId = roomId.trim().toUpperCase()
    const res = await fetch(`${BACKEND_URL}/api/rooms/${upperRoomId}`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
    if (!res.ok) {
      setError('Room not found')
      return
    }
    const room = await res.json()
    // Join also goes through the AI preparation flow  
    navigate(`/preparing/${upperRoomId}?topic=${encodeURIComponent(room.topic)}&d1=${encodeURIComponent(room.debaters[0])}&d2=${encodeURIComponent(room.debaters[1])}&joining=true`)
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-gray-500 hover:text-gray-300 text-sm transition select-none">
        Already have a room code? Join here ▾
      </summary>
      <form onSubmit={handleJoin} className="mt-3 flex gap-2 flex-col">
        <div className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room code (e.g. AB12CD34)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-lg transition"
        >
          Join Room
        </button>
      </form>
    </details>
  )
}
