import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'

const ROAST_LEVELS = [
  {
    id: 'easy',
    name: 'Easy',
    description: 'Polite & Educational',
    subtitle: 'Calm explanations',
    color: 'green',
    bgGradient: 'from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-500/50',
    textColor: 'text-green-400',
    example: '"Consider providing evidence for that claim."',
    icon: '😊',
    features: ['Respectful tone', 'Educational focus', 'Constructive feedback']
  },
  {
    id: 'intermediate', 
    name: 'Intermediate',
    description: 'Sharp & Direct',
    subtitle: 'Slight sarcasm allowed',
    color: 'yellow',
    bgGradient: 'from-yellow-500/20 to-orange-500/20',
    borderColor: 'border-yellow-500/50',
    textColor: 'text-yellow-400',
    example: '"That\'s a bold claim with zero evidence backing it."',
    icon: '🔥',
    features: ['Direct language', 'Moderate sarcasm', 'Clear callouts']
  },
  {
    id: 'savage',
    name: 'Full-On Roast',
    description: 'Maximum Entertainment',
    subtitle: 'Aggressive, funny, brutal',
    color: 'red',
    bgGradient: 'from-red-500/20 to-rose-500/20', 
    borderColor: 'border-red-500/50',
    textColor: 'text-red-400',
    example: '"You just mansplained correlation into causation like a freshman stats dropout."',
    icon: '💀',
    features: ['No mercy', 'Comedic brutality', 'Viral potential']
  }
]

export default function RoastLevelScreen() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  const topic = searchParams.get('topic') || 'Debate Topic'
  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'

  const handleLevelSelect = (level) => {
    setSelectedLevel(level)
  }

  const handleStartDebate = () => {
    if (!selectedLevel) return
    setIsTransitioning(true)
    
    // Save roast level to session storage or pass as param
    sessionStorage.setItem('roastLevel', selectedLevel.id)
    
    setTimeout(() => {
      navigate(`/debate/${roomId}?name=${encodeURIComponent(d1)}&d1=${encodeURIComponent(d1)}&d2=${encodeURIComponent(d2)}&roastLevel=${selectedLevel.id}`)
    }, 800)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl font-black text-white mb-4">
            Choose <span className="text-red-500">Roast</span> Intensity
          </h1>
          <p className="text-gray-300 text-xl mb-2">
            How savage should the AI feedback be?
          </p>
          <p className="text-gray-400">Topic: <span className="text-white font-medium">{topic}</span></p>
          <p className="text-gray-500 text-sm mt-1">{d1} vs {d2}</p>
        </motion.div>

        {/* Roast Level Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {ROAST_LEVELS.map((level, index) => (
            <motion.div
              key={level.id}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleLevelSelect(level)}
              className={`relative cursor-pointer rounded-2xl border-2 transition-all duration-300 transform hover:shadow-xl ${
                selectedLevel?.id === level.id
                  ? `${level.borderColor} bg-gradient-to-br ${level.bgGradient} shadow-lg ring-2 ring-${level.color}-500/30`
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              {/* Selection indicator */}
              {selectedLevel?.id === level.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`absolute -top-3 -right-3 w-8 h-8 ${level.textColor} bg-gray-900 rounded-full flex items-center justify-center border-2 ${level.borderColor}`}
                >
                  ✓
                </motion.div>
              )}

              <div className="p-8">
                {/* Icon and Title */}
                <div className="text-center mb-6">
                  <div className="text-6xl mb-4">{level.icon}</div>
                  <h3 className={`text-2xl font-bold ${selectedLevel?.id === level.id ? level.textColor : 'text-white'}`}>
                    {level.name}
                  </h3>
                  <p className="text-gray-400 font-medium">{level.description}</p>
                  <p className="text-gray-500 text-sm">{level.subtitle}</p>
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-6">
                  {level.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-gray-300 text-sm">
                      <span className={`text-xs mr-2 ${selectedLevel?.id === level.id ? level.textColor : 'text-gray-500'}`}>
                        •
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Example */}
                <div className="bg-gray-900/80 rounded-lg p-4 border border-gray-700">
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Example:</p>
                  <p className={`text-sm italic ${selectedLevel?.id === level.id ? level.textColor : 'text-gray-300'}`}>
                    {level.example}
                  </p>
                </div>
              </div>

              {/* Glow effect when selected */}
              {selectedLevel?.id === level.id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${level.bgGradient} -z-10 blur-xl`}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Start Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <button
            onClick={handleStartDebate}
            disabled={!selectedLevel || isTransitioning}
            className={`px-12 py-4 rounded-xl font-bold text-xl transition-all duration-300 transform ${
              selectedLevel && !isTransitioning
                ? `${selectedLevel.textColor} bg-gradient-to-r ${selectedLevel.bgGradient} ${selectedLevel.borderColor} border-2 hover:scale-105 shadow-lg hover:shadow-xl`
                : 'text-gray-500 bg-gray-800 border-2 border-gray-700 cursor-not-allowed'
            }`}
          >
            {isTransitioning ? (
              <div className="flex items-center">
                <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full mr-3"></div>
                Starting Debate...
              </div>
            ) : selectedLevel ? (
              `Start ${selectedLevel.name} Mode Debate`
            ) : (
              'Select Roast Level'
            )}
          </button>
          
          {selectedLevel && !isTransitioning && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-gray-400 text-sm mt-3"
            >
              Ready to roast with {selectedLevel.description.toLowerCase()} mode 🔥
            </motion.p>
          )}
        </motion.div>

        {/* Warning for Savage Mode */}
        {selectedLevel?.id === 'savage' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center max-w-2xl mx-auto"
          >
            <div className="text-2xl mb-2">⚠️</div>
            <p className="text-red-400 font-bold mb-1">Savage Mode Warning</p>
            <p className="text-gray-300 text-sm">
              The AI will be ruthlessly entertaining. Perfect for demos, maybe not for your ego.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}