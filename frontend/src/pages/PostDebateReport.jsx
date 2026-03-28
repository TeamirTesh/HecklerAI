import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString([], {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function buildStats(name, roasts) {
  const mine = roasts.filter((r) => r.speaker === name)
  return {
    roastCount:     mine.filter((r) => r.reactionType === 'ROAST').length,
    complimentCount:mine.filter((r) => r.reactionType === 'COMPLIMENT').length,
    fallacyCount:   mine.filter((r) => r.type === 'FALLACY').length,
    lieCount:       mine.filter((r) => r.type === 'FACTUAL_CLAIM').length,
    goodPointCount: mine.filter((r) => r.type === 'GOOD_POINT').length,
    fallacies:      mine.filter((r) => r.type === 'FALLACY'),
    lies:           mine.filter((r) => r.type === 'FACTUAL_CLAIM'),
    goodPoints:     mine.filter((r) => r.type === 'GOOD_POINT'),
    all:            mine,
  }
}

function buildVerdict(debaters, roasts) {
  const [d1, d2] = debaters
  const d1Roasts = roasts.filter((r) => r.speaker === d1 && r.reactionType === 'ROAST').length
  const d2Roasts = roasts.filter((r) => r.speaker === d2 && r.reactionType === 'ROAST').length

  if (d1Roasts === d2Roasts) {
    return {
      winner: null,
      message: "BOTH OF Y'ALL GOT COOKED EQUALLY. IT'S A DAMN TIE.",
      sub: `${d1Roasts} roast${d1Roasts !== 1 ? 's' : ''} each. Nobody won. Everybody lost.`,
    }
  }

  const winner = d1Roasts < d2Roasts ? d1 : d2
  const loser  = d1Roasts < d2Roasts ? d2 : d1
  const winnerCount = Math.min(d1Roasts, d2Roasts)
  const loserCount  = Math.max(d1Roasts, d2Roasts)

  return {
    winner,
    loser,
    message: `${loser.toUpperCase()} GOT COOKED. ${winner.toUpperCase()} WINS BY DEFAULT.`,
    sub: `${winner} got called out ${winnerCount} time${winnerCount !== 1 ? 's' : ''}. ${loser} got called out ${loserCount} time${loserCount !== 1 ? 's' : ''}.`,
  }
}

// ── Animation variant ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ children, className = '' }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      className={`mb-8 ${className}`}
    >
      {children}
    </motion.section>
  )
}

function SectionTitle({ children }) {
  return (
    <h2
      className="text-2xl font-black text-white uppercase tracking-widest mb-4 border-b border-gray-800 pb-2"
      style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
    >
      {children}
    </h2>
  )
}

function TypeBadge({ type, fallacyName }) {
  const map = {
    FALLACY:       'bg-orange-700 text-white',
    FACTUAL_CLAIM: 'bg-yellow-600 text-white',
    GOOD_POINT:    'bg-green-700 text-white',
  }
  const label = type === 'FALLACY' && fallacyName ? fallacyName : type?.replace('_', ' ')
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${map[type] ?? 'bg-gray-700 text-gray-300'}`}>
      {label}
    </span>
  )
}

function StatCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3 text-center">
      <p className={`text-2xl font-black ${color}`} style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}>
        {value}
      </p>
      <p className="text-gray-400 text-xs uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function SkeletonBlock({ h = 'h-24' }) {
  return <div className={`${h} bg-gray-800 rounded-xl animate-pulse`} />
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PostDebateReport() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const pollRef = { count: 0 }

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${roomId}/summary`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const json = await res.json()
      setData(json)
      setLoading(false)
      // Poll up to 5× if analytics not ready yet (Groq still generating)
      if (!json.analytics && pollRef.count < 5) {
        pollRef.count++
        setTimeout(fetchReport, 3000)
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => { fetchReport() }, [fetchReport])

  function handleCopy() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6 max-w-3xl mx-auto">
        <SkeletonBlock h="h-40" />
        <div className="mt-6 grid grid-cols-2 gap-4">
          <SkeletonBlock h="h-48" />
          <SkeletonBlock h="h-48" />
        </div>
        <div className="mt-6 space-y-4">
          <SkeletonBlock h="h-28" />
          <SkeletonBlock h="h-28" />
          <SkeletonBlock h="h-28" />
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-lg font-bold">Failed to load report</p>
        <p className="text-gray-500 text-sm">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchReport() }}
          className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2 rounded-xl"
        >
          Retry
        </button>
      </div>
    )
  }

  const { room, roasts = [], analytics } = data
  const [d1, d2] = room.debaters
  const s1 = buildStats(d1, roasts)
  const s2 = buildStats(d2, roasts)
  const verdict = buildVerdict(room.debaters, roasts)
  const timeline = [...roasts].sort((a, b) => a.timestamp - b.timestamp)

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-card { background: #f3f4f6 !important; border: 1px solid #d1d5db !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-950 pb-28">
        <div className="max-w-3xl mx-auto px-4 py-8">

          {/* ── 1. VERDICT HEADER ─────────────────────────────────────────── */}
          <Section>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center print-card">
              <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">Post-Debate Report · {roomId}</p>
              <h1
                className="text-4xl md:text-5xl font-black text-red-500 leading-tight mb-3"
                style={{ fontFamily: 'Impact, Arial Black, sans-serif', textShadow: '0 0 30px rgba(239,68,68,0.4)' }}
              >
                {verdict.message}
              </h1>
              <p className="text-gray-400 text-base mb-4">{verdict.sub}</p>
              <div className="inline-block bg-gray-800 rounded-xl px-5 py-2 mb-2">
                <p className="text-white font-bold">"{room.topic}"</p>
              </div>
              <p className="text-gray-600 text-sm mt-3">{fmtDate(room.createdAt)}</p>
            </div>
          </Section>

          {/* ── 2. SCOREBOARD ─────────────────────────────────────────────── */}
          <Section>
            <SectionTitle>Scoreboard</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              {[{ name: d1, stats: s1 }, { name: d2, stats: s2 }].map(({ name, stats }) => (
                <div key={name} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 print-card">
                  <p
                    className={`text-xl font-black mb-4 text-center ${verdict.winner === name ? 'text-green-400' : verdict.winner ? 'text-red-400' : 'text-white'}`}
                    style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
                  >
                    {name}
                    {verdict.winner === name && <span className="ml-2 text-sm">👑</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Roasts"      value={stats.roastCount}      color="text-red-400" />
                    <StatCard label="Compliments" value={stats.complimentCount} color="text-green-400" />
                    <StatCard label="Fallacies"   value={stats.fallacyCount}    color="text-orange-400" />
                    <StatCard label="Lies Caught" value={stats.lieCount}        color="text-yellow-400" />
                    <StatCard label="Good Points" value={stats.goodPointCount}  color="text-blue-400" />
                    <StatCard label="Total Calls" value={stats.all.length}      color="text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 3. FALLACY BREAKDOWN ──────────────────────────────────────── */}
          {(s1.fallacies.length > 0 || s2.fallacies.length > 0) && (
            <Section>
              <SectionTitle>Fallacies Caught</SectionTitle>
              <div className="space-y-6">
                {[{ name: d1, items: s1.fallacies }, { name: d2, items: s2.fallacies }].map(({ name, items }) =>
                  items.length === 0 ? null : (
                    <div key={name}>
                      <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-2">{name}</p>
                      <div className="space-y-3">
                        {items.map((r, i) => (
                          <div key={i} className="bg-gray-900 border border-orange-900/40 rounded-xl p-4 print-card">
                            <div className="flex items-center gap-2 mb-2">
                              <TypeBadge type="FALLACY" fallacyName={r.fallacyName} />
                              <span className="text-gray-600 text-xs">{fmt(r.timestamp)}</span>
                            </div>
                            <p className="text-gray-300 text-sm mb-1">
                              <span className="text-gray-500">Said: </span>"{r.utterance}"
                            </p>
                            <p className="text-red-300 text-sm italic">
                              <span className="text-gray-500">DebateRoast: </span>"{r.roast}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </Section>
          )}

          {/* ── 4. LIES CAUGHT ────────────────────────────────────────────── */}
          {(s1.lies.length > 0 || s2.lies.length > 0) && (
            <Section>
              <SectionTitle>Lies Caught</SectionTitle>
              <div className="space-y-6">
                {[{ name: d1, items: s1.lies }, { name: d2, items: s2.lies }].map(({ name, items }) =>
                  items.length === 0 ? null : (
                    <div key={name}>
                      <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-2">{name}</p>
                      <div className="space-y-3">
                        {items.map((r, i) => (
                          <div key={i} className="bg-gray-900 border border-yellow-900/40 rounded-xl p-4 print-card">
                            <div className="flex items-center gap-2 mb-2">
                              <TypeBadge type="FACTUAL_CLAIM" />
                              <span className="text-gray-600 text-xs">{fmt(r.timestamp)}</span>
                            </div>
                            <p className="text-gray-300 text-sm mb-1">
                              <span className="text-gray-500">Claimed: </span>"{r.claim || r.utterance}"
                            </p>
                            <p className="text-red-300 text-sm italic mb-2">
                              <span className="text-gray-500">DebateRoast: </span>"{r.roast}"
                            </p>
                            {r.factSource && (
                              <a
                                href={r.factSource}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 text-xs underline break-all"
                              >
                                Source: {r.factSource.length > 70 ? r.factSource.slice(0, 67) + '…' : r.factSource}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </Section>
          )}

          {/* ── 5. GOOD POINTS ────────────────────────────────────────────── */}
          {(s1.goodPoints.length > 0 || s2.goodPoints.length > 0) && (
            <Section>
              <SectionTitle>Good Points</SectionTitle>
              <div className="space-y-6">
                {[{ name: d1, items: s1.goodPoints }, { name: d2, items: s2.goodPoints }].map(({ name, items }) =>
                  items.length === 0 ? null : (
                    <div key={name}>
                      <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-2">{name}</p>
                      <div className="space-y-3">
                        {items.map((r, i) => (
                          <div key={i} className="bg-gray-900 border border-green-900/40 rounded-xl p-4 print-card">
                            <div className="flex items-center gap-2 mb-2">
                              <TypeBadge type="GOOD_POINT" />
                              <span className="text-gray-600 text-xs">{fmt(r.timestamp)}</span>
                            </div>
                            <p className="text-gray-300 text-sm mb-1">
                              <span className="text-gray-500">Said: </span>"{r.utterance}"
                            </p>
                            <p className="text-green-300 text-sm italic">
                              <span className="text-gray-500">DebateRoast: </span>"{r.roast}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </Section>
          )}

          {/* ── 6. FULL TIMELINE ──────────────────────────────────────────── */}
          {timeline.length > 0 && (
            <Section>
              <SectionTitle>Full Timeline</SectionTitle>
              <div className="space-y-2">
                {timeline.map((r, i) => (
                  <div
                    key={i}
                    className={`bg-gray-900 border rounded-xl p-4 print-card ${
                      r.reactionType === 'COMPLIMENT' ? 'border-green-900/40' : 'border-red-900/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-gray-600 text-xs font-mono">{fmt(r.timestamp)}</span>
                      <span className={`text-xs font-bold uppercase ${r.reactionType === 'COMPLIMENT' ? 'text-green-400' : 'text-red-400'}`}>
                        {r.speaker}
                      </span>
                      <TypeBadge type={r.type} fallacyName={r.fallacyName} />
                    </div>
                    <p className="text-gray-400 text-xs mb-1 truncate">"{r.utterance}"</p>
                    <p className={`text-sm italic ${r.reactionType === 'COMPLIMENT' ? 'text-green-300' : 'text-red-300'}`}>
                      "{r.stopPhrase} — {r.roast}"
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Groq analytics block (if available) ───────────────────────── */}
          {analytics && (
            <Section>
              <SectionTitle>AI Verdict</SectionTitle>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 print-card">
                {analytics.winner && (
                  <p className="text-green-400 font-black text-lg mb-2" style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}>
                    Winner: {analytics.winner}
                  </p>
                )}
                <p className="text-gray-300 text-sm leading-relaxed mb-4">{analytics.overallSummary}</p>
                {analytics.debaterAnalysis?.map((d) => (
                  <div key={d.name} className="mb-4 last:mb-0 bg-gray-800 rounded-xl p-4">
                    <p className="text-white font-bold mb-2">{d.name}</p>
                    <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                      {Object.entries(d.dimensions ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-gray-500 w-20">{k}</span>
                          <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                            <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${v}%` }} />
                          </div>
                          <span className="text-gray-400 w-6 text-right">{v}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">{d.summary}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!analytics && !loading && (
            <Section>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-gray-500 text-sm">AI analytics are still generating... check back in a moment.</p>
              </div>
            </Section>
          )}

        </div>
      </div>

      {/* ── 7. STICKY ACTION BAR ──────────────────────────────────────────── */}
      <div className="no-print fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 px-4 py-3 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-3">
          <button
            onClick={() => window.print()}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            📄 Download PDF
          </button>
          <button
            onClick={handleCopy}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors min-w-[120px]"
          >
            {copied ? '✓ Copied!' : '🔗 Copy Link'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-500 text-white text-sm font-black px-5 py-2.5 rounded-xl transition-colors"
            style={{ fontFamily: 'Impact, Arial Black, sans-serif' }}
          >
            🔥 New Debate
          </button>
        </div>
      </div>
    </>
  )
}
