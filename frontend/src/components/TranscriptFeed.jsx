import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function TranscriptFeed({ entries, debaters }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const [d1, d2] = debaters

  return (
    <div className="h-full overflow-y-auto scrollbar-thin flex flex-col gap-2 py-2 pr-1">
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => (
          <TranscriptEntry key={`${entry.timestamp}-${i}`} entry={entry} d1={d1} d2={d2} />
        ))}
      </AnimatePresence>
      {entries.length === 0 && (
        <p className="text-gray-600 text-sm text-center mt-8 italic">
          Waiting for someone to speak...
        </p>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

function TranscriptEntry({ entry, d1, d2 }) {
  const isD1 = entry.speaker === d1
  const isSystem = entry.speaker === 'SYSTEM'

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-red-950/40 border border-red-800/30 rounded-lg px-3 py-2 text-center"
      >
        <span className="text-red-400 text-xs font-bold uppercase tracking-wider">
          🔥 {entry.text}
        </span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: isD1 ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 ${isD1 ? '' : 'flex-row-reverse'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isD1
            ? 'bg-blue-950/60 border border-blue-800/40 text-blue-100 rounded-tl-sm'
            : 'bg-purple-950/60 border border-purple-800/40 text-purple-100 rounded-tr-sm'
        }`}
      >
        <span
          className={`text-xs font-bold uppercase tracking-wide block mb-0.5 ${
            isD1 ? 'text-blue-400' : 'text-purple-400'
          }`}
        >
          {entry.speaker}
        </span>
        {entry.text}
      </div>
    </motion.div>
  )
}
