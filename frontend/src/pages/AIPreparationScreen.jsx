import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const PREPARATION_STEPS = [
  { id: 1, text: "Collecting topic background", icon: "🔍" },
  { id: 2, text: "Gathering recent facts and claims", icon: "📊" },
  { id: 3, text: "Loading debate tactics knowledge", icon: "🧠" },
  { id: 4, text: "Preparing fallacy detection engine", icon: "🎯" },
  { id: 5, text: "Syncing debate room", icon: "🔄" },
]

export default function AIPreparationScreen() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState(new Set())
  
  const topic = searchParams.get('topic') || 'Debate Topic'
  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'
  const joining = searchParams.get('joining') === 'true'
  const joinerName = searchParams.get('name') || d2

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentStep < PREPARATION_STEPS.length) {
        setCompletedSteps(prev => new Set([...prev, currentStep]))
        setCurrentStep(prev => prev + 1)
      } else {
        clearInterval(interval)
        setTimeout(() => {
          if (joining) {
            // Joining client skips roast level — host already chose it
            navigate(`/debate/${roomId}?name=${encodeURIComponent(joinerName)}&d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)
          } else {
            navigate(`/roast-level/${roomId}?topic=${encodeURIComponent(topic)}&d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}`)
          }
        }, 1000)
      }
    }, 800)

    return () => clearInterval(interval)
  }, [currentStep, navigate, roomId, topic, d1, d2])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-black text-red-500 mb-4">
            Preparing DebateRoast...
          </h1>
          <p className="text-gray-300 text-xl mb-2">Topic: <span className="text-white font-semibold">{topic}</span></p>
          <p className="text-gray-400">Debaters: {d1} vs {d2}</p>
        </motion.div>

        {/* AI Brain Animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="flex justify-center mb-12"
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="w-32 h-32 border-4 border-red-500/20 border-t-red-500 rounded-full"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">🧠</span>
            </div>
            {/* Pulse rings */}
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 border-2 border-red-500/30 rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              className="absolute inset-0 border-2 border-red-500/20 rounded-full"
            />
          </div>
        </motion.div>

        {/* Progress Steps */}
        <div className="space-y-4">
          {PREPARATION_STEPS.map((step, index) => {
            const isCompleted = completedSteps.has(index)
            const isCurrent = index === currentStep
            const isPending = index > currentStep

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center space-x-4 p-4 rounded-xl transition-all duration-500 ${
                  isCompleted
                    ? 'bg-green-900/20 border-green-500/30 border'
                    : isCurrent
                    ? 'bg-red-900/20 border-red-500/30 border'
                    : 'bg-gray-800/30 border-gray-700/30 border'
                }`}
              >
                <div className={`text-2xl transition-all duration-500 ${
                  isCurrent ? 'animate-pulse scale-110' : ''
                }`}>
                  {isCompleted ? '✅' : step.icon}
                </div>
                
                <div className="flex-1">
                  <p className={`font-medium transition-colors duration-500 ${
                    isCompleted
                      ? 'text-green-400'
                      : isCurrent
                      ? 'text-red-400'
                      : isPending
                      ? 'text-gray-500'
                      : 'text-gray-300'
                  }`}>
                    {step.text}
                  </p>
                </div>

                <AnimatePresence>
                  {isCurrent && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex space-x-1"
                    >
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </motion.div>
                  )}
                  {isCompleted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      className="text-green-400"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        {/* Progress Bar */}
        <div className="mt-8">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>Preparing AI...</span>
            <span>{Math.min(currentStep, PREPARATION_STEPS.length)} / {PREPARATION_STEPS.length}</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <motion.div
              className="bg-gradient-to-r from-red-500 to-red-400 rounded-full h-full"
              initial={{ width: "0%" }}
              animate={{ width: `${(Math.min(currentStep, PREPARATION_STEPS.length) / PREPARATION_STEPS.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Complete message */}
        <AnimatePresence>
          {currentStep >= PREPARATION_STEPS.length && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mt-8"
            >
              <div className="text-6xl mb-4">🔥</div>
              <p className="text-2xl font-bold text-green-400 mb-2">AI Ready to Roast!</p>
              <p className="text-gray-400">Proceeding to roast level selection...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}