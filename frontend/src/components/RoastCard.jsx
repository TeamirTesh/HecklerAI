import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FALLACY_COLORS = {
  'Ad Hominem': 'bg-orange-700',
  'Straw Man': 'bg-yellow-700',
  'False Dichotomy': 'bg-purple-700',
  'Slippery Slope': 'bg-blue-700',
  default: 'bg-gray-700',
}

function getFallacyColor(name) {
  if (!name) return FALLACY_COLORS.default
  return (
    Object.entries(FALLACY_COLORS).find(([k]) =>
      name.toLowerCase().includes(k.toLowerCase())
    )?.[1] ?? FALLACY_COLORS.default
  )
}

/**
 * @param {object} props
 * @param {object|null} props.roast    - roast payload or null to hide
 * @param {function} props.onDismiss  - called when card auto-dismisses
 */
export default function RoastCard({ roast, onDismiss }) {
  useEffect(() => {
    if (!roast) return
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [roast, onDismiss])

  return (
    <AnimatePresence>
      {roast && (
        <motion.div
          key={roast.timestamp}
          initial={{ x: '110%', opacity: 0 }}
          animate={[
            { x: 0, opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } },
            {
              x: [0, -8, 8, -6, 6, -4, 4, 0],
              transition: { delay: 0.25, duration: 0.5, ease: 'easeInOut' },
            },
          ]}
          exit={{ x: '110%', opacity: 0, transition: { duration: 0.4, ease: 'easeIn' } }}
          className="fixed top-24 right-4 z-50 w-full max-w-sm pointer-events-none"
          style={{ maxWidth: '380px' }}
        >
          <div className="bg-red-600 border-4 border-red-400 rounded-2xl shadow-2xl shadow-red-900/60 p-5 overflow-hidden">
            {/* Stop phrase */}
            <p
              className="text-white text-2xl font-black leading-tight mb-3 tracking-wide"
              style={{
                fontFamily: 'Impact, Arial Black, sans-serif',
                textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
              }}
            >
              {roast.stopPhrase}
            </p>

            {/* Speaker badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-black/30 text-red-200 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                {roast.speaker}
              </span>
              {roast.type === 'FALLACY' && roast.fallacyName && (
                <span
                  className={`${getFallacyColor(roast.fallacyName)} text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider`}
                >
                  {roast.fallacyName}
                </span>
              )}
              {roast.type === 'FACTUAL_CLAIM' && (
                <span className="bg-yellow-600 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  FACT CHECK {roast.factVerdict && `· ${roast.factVerdict}`}
                </span>
              )}
            </div>

            {/* Roast text */}
            <p className="text-red-100 text-sm leading-relaxed font-medium">
              {roast.roast}
            </p>

            {/* Fact source */}
            {roast.factSource && (
              <p className="mt-2 text-red-300 text-xs italic border-t border-red-500/40 pt-2 pointer-events-auto">
                Source:{' '}
                <a
                  href={roast.factSource}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white break-all"
                  title={roast.factSource}
                >
                  {roast.factSource.length > 60
                    ? roast.factSource.slice(0, 57) + '…'
                    : roast.factSource}
                </a>
              </p>
            )}

            {/* Timer bar */}
            <motion.div
              className="absolute bottom-0 left-0 h-1 bg-white/40 rounded-b-2xl"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 8, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
