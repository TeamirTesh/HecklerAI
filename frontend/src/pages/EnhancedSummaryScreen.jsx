import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const FALLACY_TYPES = [
  'Strawman', 'Ad Hominem', 'False Cause', 'Cherry Picking', 
  'Appeal to Emotion', 'False Dilemma', 'Circular Logic', 'Red Herring'
]

const ANALYSIS_DIMENSIONS = [
  'Logic', 'Clarity', 'Evidence', 'Relevance', 'Fairness'
]

export default function EnhancedSummaryScreen() {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const d1 = searchParams.get('d1') || 'Debater 1'
  const d2 = searchParams.get('d2') || 'Debater 2'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/rooms/${roomId}/summary`)
        if (!res.ok) throw new Error('Failed to fetch')
        const summaryData = await res.json()

        // If analytics aren't ready yet (Groq still processing), poll once after 3s
        if (!summaryData.analytics) {
          setTimeout(async () => {
            try {
              const retry = await fetch(`${BACKEND_URL}/api/rooms/${roomId}/summary`)
              const retryData = await retry.json()
              setData({ ...retryData, roastMode: sessionStorage.getItem('roastLevel') || 'standard' })
            } catch (_) {}
          }, 3000)
        }

        setData({ ...summaryData, roastMode: sessionStorage.getItem('roastLevel') || 'standard' })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [roomId, d1, d2])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-red-500/20 border-t-red-500 rounded-full mb-4"></div>
          <div className="text-gray-400 text-lg">Analyzing debate results...</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <div className="text-red-400 text-xl mb-2">Analysis Failed</div>
          <div className="text-gray-500 mb-6">{error || 'Could not load debate summary'}</div>
          <button 
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-xl font-bold"
          >
            Return Home
          </button>
        </div>
      </div>
    )
  }

  const { room, roasts, analytics: groqAnalytics, roastMode } = data
  const analysis = groqAnalytics ? {
    ...groqAnalytics,
    duration: Math.round((Date.now() - room.createdAt) / 60000),
    totalIssues: roasts?.length || 0,
    roastMode,
    debaterAnalysis: groqAnalytics.debaterAnalysis?.map(d => ({
      ...d,
      fallacyCount: room.scores?.[d.name] || 0,
      interruptions: Object.values(room.fallacyTypes?.[d.name] || {}).reduce((a, b) => a + b, 0),
      fallacies: FALLACY_TYPES.reduce((acc, f) => ({ ...acc, [f]: room.fallacyTypes?.[d.name]?.[f] || 0 }), {}),
    }))
  } : null

  const getUserTheme = (name) => {
    return name === d1 ? {
      primary: 'blue',
      bg: 'from-blue-500/10 to-cyan-500/10',
      border: 'border-blue-500/50',
      text: 'text-blue-400'
    } : {
      primary: 'purple', 
      bg: 'from-purple-500/10 to-pink-500/10',
      border: 'border-purple-500/50',
      text: 'text-purple-400'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <div className="bg-gray-900/90 backdrop-blur border-b border-gray-800 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-5xl font-black text-red-500 mb-3 tracking-tight">
              DEBATE<span className="text-white">ROAST</span>
            </h1>
            <div className="flex justify-center items-center space-x-8 text-sm">
              <div className="text-center">
                <div className="text-gray-400">Topic</div>
                <div className="text-white font-medium">{room?.topic || 'Unknown Topic'}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Duration</div>
                <div className="text-white font-medium">{analysis?.duration || 15} minutes</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Issues Detected</div>
                <div className="text-red-400 font-bold">{analysis?.totalIssues || roasts?.length || 0}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-400">Roast Mode</div>
                <div className="text-red-400 font-medium capitalize">{analysis?.roastMode || 'Standard'}</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-gray-900/50 border-b border-gray-800/50 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex space-x-1">
            {['overview', 'performance', 'analysis', 'charts'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 font-medium capitalize transition-all ${
                  activeTab === tab
                    ? 'text-red-400 border-b-2 border-red-500'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && <OverviewTab data={data} d1={d1} d2={d2} getUserTheme={getUserTheme} />}
          {activeTab === 'performance' && <PerformanceTab analysis={analysis} getUserTheme={getUserTheme} />}
          {activeTab === 'analysis' && <AnalysisTab analysis={analysis} roasts={roasts} />}
          {activeTab === 'charts' && <ChartsTab analysis={analysis} getUserTheme={getUserTheme} />}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-800 bg-gray-900/50 p-6">
        <div className="max-w-7xl mx-auto flex justify-center space-x-4">
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-500 text-white font-bold text-lg px-8 py-3 rounded-xl transition-colors"
          >
            🔥 New Debate
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl transition-colors">
            📊 Download Report
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl transition-colors">
            🔗 Share Results
          </button>
        </div>
      </div>
    </div>
  )
}

// Overview Tab Component
function OverviewTab({ data, d1, d2, getUserTheme }) {
  const { room, roasts, analysis } = data
  const scores = room?.scores || { [d1]: 0, [d2]: 0 }
  
  const s1 = scores[d1] || 0
  const s2 = scores[d2] || 0
  const winner = s1 < s2 ? d1 : s2 < s1 ? d2 : null // Lower score wins (fewer roasts)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      {/* Final Verdict */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-8 text-center">
        {winner ? (
          <>
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-4xl font-black text-white mb-2">
              {winner} WINS
            </h2>
            <p className="text-gray-400 text-lg">
              Survived with only <span className="text-green-400 font-bold">{Math.min(s1, s2)} roasts</span> vs <span className="text-red-400 font-bold">{Math.max(s1, s2)} roasts</span>
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">🤝</div>
            <h2 className="text-3xl font-black text-yellow-400">IT'S A TIE</h2>
            <p className="text-gray-400">Both debaters equally flawed with {s1} roasts each</p>
          </>
        )}
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {analysis?.debaterAnalysis?.map((debater, index) => (
          <motion.div
            key={debater.name}
            initial={{ opacity: 0, x: index === 0 ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={`bg-gradient-to-br ${getUserTheme(debater.name).bg} border ${getUserTheme(debater.name).border} rounded-2xl p-6`}
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className={`w-16 h-16 ${getUserTheme(debater.name).bg} ${getUserTheme(debater.name).border} border-2 rounded-full flex items-center justify-center font-bold text-2xl text-white`}>
                {debater.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{debater.name}</h3>
                <p className={`${getUserTheme(debater.name).text} font-medium`}>
                  Performance Overview
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{debater.truthScore}%</div>
                <div className="text-gray-400 text-sm">Truth Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{debater.fallacyCount}</div>
                <div className="text-gray-400 text-sm">Fallacies</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{debater.evidenceScore}%</div>
                <div className="text-gray-400 text-sm">Evidence</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{debater.interruptions}</div>
                <div className="text-gray-400 text-sm">Interrupts</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// Performance Tab Component  
function PerformanceTab({ analysis, getUserTheme }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <h2 className="text-3xl font-bold text-white text-center mb-8">Detailed Performance Analysis</h2>
      
      {analysis?.debaterAnalysis?.map((debater, index) => (
        <motion.div
          key={debater.name}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.2 }}
          className={`bg-gradient-to-br ${getUserTheme(debater.name).bg} border ${getUserTheme(debater.name).border} rounded-2xl p-8`}
        >
          <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
            <div className={`w-8 h-8 ${getUserTheme(debater.name).border} border-2 rounded-full flex items-center justify-center font-bold mr-3`}>
              {debater.name.charAt(0).toUpperCase()}
            </div>
            {debater.name} Performance Card
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400 mb-1">{debater.truthScore}%</div>
              <div className="text-gray-400">Truth Score</div>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-400 h-full rounded-full" 
                  style={{ width: `${debater.truthScore}%` }}
                />
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400 mb-1">{debater.argumentQuality}%</div>
              <div className="text-gray-400">Argument Quality</div>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-400 h-full rounded-full" 
                  style={{ width: `${debater.argumentQuality}%` }}
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-red-400 mb-1">{debater.fallacyCount}</div>
              <div className="text-gray-400">Fallacy Count</div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-purple-400 mb-1">{debater.evidenceScore}%</div>
              <div className="text-gray-400">Evidence Score</div>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                <div 
                  className="bg-purple-400 h-full rounded-full" 
                  style={{ width: `${debater.evidenceScore}%` }}
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-orange-400 mb-1">{100 - debater.manipulationScore}%</div>
              <div className="text-gray-400">Fairness Score</div>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                <div 
                  className="bg-orange-400 h-full rounded-full" 
                  style={{ width: `${100 - debater.manipulationScore}%` }}
                />
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-1">{debater.interruptions}</div>
              <div className="text-gray-400">Interruptions</div>
            </div>
          </div>

          {/* Fallacy Breakdown */}
          <div className="bg-gray-800/50 rounded-xl p-4">
            <h4 className="text-lg font-semibold text-white mb-3">Fallacy Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(debater.fallacies || {}).map(([fallacy, count]) => (
                <div key={fallacy} className="text-center">
                  <div className="text-red-400 font-bold">{count}</div>
                  <div className="text-gray-400 text-xs">{fallacy}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}

// Analysis Tab Component
function AnalysisTab({ analysis, roasts }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <h2 className="text-3xl font-bold text-white text-center mb-8">AI Analysis & Recommendations</h2>

      {!analysis && (
        <div className="text-center text-gray-400 py-12">
          <div className="animate-spin w-8 h-8 border-4 border-red-500/20 border-t-red-500 rounded-full mx-auto mb-4" />
          <p>Groq is analyzing the debate transcript...</p>
        </div>
      )}

      {/* Overall summary from Groq */}
      {analysis?.overallSummary && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Overall Verdict</h3>
          <p className="text-gray-200 text-lg leading-relaxed">{analysis.overallSummary}</p>
        </div>
      )}

      {/* Per-debater analysis from Groq */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {analysis?.debaterAnalysis?.map((debater) => (
          <div key={debater.name} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">{debater.name} Analysis</h3>
            <p className="text-gray-300 leading-relaxed mb-4">{debater.summary}</p>

            <div className="bg-gray-800/50 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-green-400 mb-2">Improvement Suggestions</h4>
              <ul className="space-y-2">
                {debater.improvements?.map((suggestion, index) => (
                  <li key={index} className="flex items-start space-x-2 text-gray-300 text-sm">
                    <span className="text-green-400 mt-1">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* Roast Log */}
      {roasts && roasts.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-red-400 mb-4">🔥 Complete Roast Log ({roasts.length})</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {roasts.map((roast, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-3 border-l-4 border-red-500">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-red-400 font-semibold text-sm">#{index + 1}</span>
                  <span className="text-gray-500 text-xs">
                    {new Date(roast.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-300 text-sm">{roast.text || roast.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

// Charts Tab Component
function ChartsTab({ analysis, getUserTheme }) {
  if (!analysis?.debaterAnalysis) {
    return <div className="text-gray-400 text-center py-8">No chart data available</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <h2 className="text-3xl font-bold text-white text-center mb-8">Data Visualization</h2>

      {/* Fallacy Comparison Chart */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-4">Fallacy Comparison</h3>
        <div className="space-y-4">
          {FALLACY_TYPES.map((fallacy) => {
            const d1Count = analysis.debaterAnalysis[0]?.fallacies?.[fallacy] || 0
            const d2Count = analysis.debaterAnalysis[1]?.fallacies?.[fallacy] || 0
            const maxCount = Math.max(d1Count, d2Count, 1)
            
            return (
              <div key={fallacy} className="space-y-2">
                <div className="text-gray-300 font-medium">{fallacy}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <span className="text-blue-400 text-sm">{d1Count}</span>
                      <div className="w-32 h-4 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-400 rounded-full transition-all duration-1000"
                          style={{ width: `${(d1Count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 h-4 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-400 rounded-full transition-all duration-1000"
                          style={{ width: `${(d2Count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-purple-400 text-sm">{d2Count}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Performance Radar Chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {analysis.debaterAnalysis.map((debater, index) => (
          <div key={debater.name} className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">{debater.name} - Performance Radar</h3>
            <div className="relative w-48 h-48 mx-auto">
              {/* Simple radar chart visualization */}
              <svg viewBox="0 0 200 200" className="w-full h-full">
                {/* Background grid */}
                <g stroke="#374151" strokeWidth="1" fill="none">
                  <polygon points="100,20 173,65 173,135 100,180 27,135 27,65" />
                  <polygon points="100,40 153,75 153,125 100,160 47,125 47,75" />
                  <polygon points="100,60 133,85 133,115 100,140 67,115 67,85" />
                </g>
                
                {/* Data area */}
                <polygon
                  points={ANALYSIS_DIMENSIONS.map((dim, i) => {
                    const angle = (i * 72 - 90) * Math.PI / 180
                    const value = debater.dimensions[dim] || 50
                    const radius = (value / 100) * 80 + 20
                    const x = 100 + Math.cos(angle) * radius
                    const y = 100 + Math.sin(angle) * radius
                    return `${x},${y}`
                  }).join(' ')}
                  fill={getUserTheme(debater.name).primary === 'blue' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(147, 51, 234, 0.3)'}
                  stroke={getUserTheme(debater.name).primary === 'blue' ? '#3b82f6' : '#9333ea'}
                  strokeWidth="2"
                />
                
                {/* Labels */}
                {ANALYSIS_DIMENSIONS.map((dim, i) => {
                  const angle = (i * 72 - 90) * Math.PI / 180
                  const x = 100 + Math.cos(angle) * 90
                  const y = 100 + Math.sin(angle) * 90
                  return (
                    <text
                      key={dim}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-gray-300 text-xs"
                    >
                      {dim}
                    </text>
                  )
                })}
              </svg>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}