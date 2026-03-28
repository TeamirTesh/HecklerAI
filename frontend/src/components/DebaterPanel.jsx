import { motion } from 'framer-motion'

export default function DebaterPanel({ name, isMe, isRecording, isConnected, score, side }) {
  const colors =
    side === 'left'
      ? {
          border: 'border-blue-700/40',
          bg: 'bg-blue-950/20',
          text: 'text-blue-400',
          dot: 'bg-blue-400',
          ring: 'ring-blue-500',
        }
      : {
          border: 'border-purple-700/40',
          bg: 'bg-purple-950/20',
          text: 'text-purple-400',
          dot: 'bg-purple-400',
          ring: 'ring-purple-500',
        }

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-2xl p-4 flex flex-col items-center gap-2`}>
      {/* Avatar */}
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl font-black bg-gray-800 border-2 ${
          isRecording ? `${colors.ring} ring-2 ring-offset-2 ring-offset-gray-950` : 'border-gray-700'
        } transition-all duration-300`}
      >
        {name.charAt(0).toUpperCase()}
      </div>

      {/* Name */}
      <p className={`font-black text-lg uppercase tracking-wider ${colors.text}`}
         style={{ fontFamily: 'Impact, sans-serif' }}>
        {name}
      </p>

      {isMe && (
        <span className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full font-medium">
          YOU
        </span>
      )}

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            isRecording ? colors.dot + ' animate-pulse' : isConnected ? 'bg-green-500' : 'bg-gray-600'
          }`}
        />
        <span className="text-xs text-gray-400">
          {isRecording ? 'SPEAKING' : isConnected ? 'CONNECTED' : 'WAITING'}
        </span>
      </div>

      {/* Score badge */}
      {score > 0 && (
        <motion.div
          key={score}
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full"
        >
          🔥 {score} roast{score !== 1 ? 's' : ''}
        </motion.div>
      )}
    </div>
  )
}
