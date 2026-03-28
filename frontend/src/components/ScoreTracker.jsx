import { motion, AnimatePresence } from 'framer-motion'

export default function ScoreTracker({ debaters, scores }) {
  const [d1, d2] = debaters
  const s1 = scores[d1] || 0
  const s2 = scores[d2] || 0

  return (
    <div className="flex items-center justify-center gap-6">
      <DebaterScore name={d1} score={s1} color="text-blue-400" />
      <div className="text-gray-600 font-black text-2xl" style={{ fontFamily: 'Impact, sans-serif' }}>
        VS
      </div>
      <DebaterScore name={d2} score={s2} color="text-purple-400" reverse />
    </div>
  )
}

function DebaterScore({ name, score, color, reverse }) {
  return (
    <div className={`flex items-center gap-3 ${reverse ? 'flex-row-reverse' : ''}`}>
      <div className="text-right">
        <p className={`text-sm font-semibold uppercase tracking-wider ${color}`}>{name}</p>
        <div className="flex items-baseline gap-1 justify-end">
          <AnimatePresence mode="wait">
            <motion.span
              key={score}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-3xl font-black text-white"
              style={{ fontFamily: 'Impact, sans-serif' }}
            >
              {score}
            </motion.span>
          </AnimatePresence>
          <span className="text-gray-500 text-sm">roasts</span>
        </div>
      </div>
      {/* Flame icons */}
      <div className="text-2xl">{score > 0 ? '🔥'.repeat(Math.min(score, 3)) : '💤'}</div>
    </div>
  )
}
