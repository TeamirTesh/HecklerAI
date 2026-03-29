import {
  getRoom,
  getExchanges,
  pushExchange,
  incrementScore,
  recordFallacyType,
  recordRoast,
} from './roomManager.js'
import { analyzeUtterance, augmentMessageWithFacts } from './groq.js'
import { factCheck } from './tavily.js'
import { buildRoastAudio, generateSpeech } from './cartesia.js'

const GRACE_PERIOD_MS = 5_000   // silence during opening announcement
const COOLDOWN_MS     = 4_000   // minimum gap between interrupts
const MIN_WORDS       = 8       // ignore very short fragments only

/**
 * Process a finalized utterance through the full analysis pipeline.
 *
 * Latency strategy:
 *   FALLACY / GOOD_POINT  → single Groq call, stop+message TTS in parallel. (~1–1.5s)
 *   FACTUAL_CLAIM         → stop phrase TTS and Tavily fire simultaneously.
 *                           Message augmented with real facts, then message TTS fires. (~2–3s)
 *   CLEAN                 → discarded immediately.
 */
export async function processUtterance({ roomId, speaker, utterance, onRoast }) {
  const room = await getRoom(roomId)
  if (!room || room.status !== 'active') return

  // ── PROBLEM 1: grace period — stay silent during opening announcement ──────
  if (room.startedAt && Date.now() - room.startedAt < GRACE_PERIOD_MS) return

  // ── PROBLEM 2: cooldown — prevent back-to-back interruptions ──────────────
  if (room.lastRoastAt && Date.now() - room.lastRoastAt < COOLDOWN_MS) return

  // ── PROBLEM 3: minimum length — ignore fragments and incomplete thoughts ───
  if (utterance.trim().split(/\s+/).length < MIN_WORDS) return

  await pushExchange(roomId, speaker, utterance)
  const exchanges = await getExchanges(roomId)

  // Single Groq call — classification + roast/compliment in one shot
  const analysis = await analyzeUtterance({
    topic: room.topic,
    debaters: room.debaters,
    exchanges,
    speaker,
    utterance,
    mode: room.roastLevel || room.mode || 'normal',
  })

  console.log(`[Analysis] mode=${room.roastMode} speaker=${speaker} interrupt=${analysis.interrupt} type=${analysis.type} fallacy=${analysis.fallacy_name}`)
  console.log(`[Analysis] utterance: "${utterance}"`)

  if (!analysis.interrupt) return

  let messageText = analysis.message
  let factSource = null
  let factVerdict = null
  let audioBuffer = null

  if (analysis.type === 'FACTUAL_CLAIM' && analysis.claim) {
    // PARALLEL TRICK: stop phrase TTS and Tavily run simultaneously
    console.log(`[Analysis] Parallel: stop phrase TTS + Tavily for "${analysis.claim}"`)
    const [stopAudio, factResult] = await Promise.all([
      generateSpeech(analysis.stop_phrase, { speed: 1 }),
      factCheck(analysis.claim),
    ])

    factSource = factResult.source
    factVerdict = factResult.verdict === 'UNVERIFIABLE' ? null : factResult.verdict

    if (factResult.factText) {
      messageText = await augmentMessageWithFacts(analysis.message, analysis.claim, factResult.factText, room.roastLevel || room.mode || 'normal')
    }

    const messageAudio = await generateSpeech(messageText, { speed: 0 })
    const parts = []
    if (stopAudio) parts.push(stopAudio)
    if (messageAudio) parts.push(messageAudio)
    audioBuffer = parts.length ? Buffer.concat(parts) : null
  } else {
    // FALLACY or GOOD_POINT — both TTS calls run in parallel inside buildRoastAudio
    audioBuffer = await buildRoastAudio(analysis.stop_phrase, messageText)
  }

  // Update cooldown timestamp on the room object
  room.lastRoastAt = Date.now()

  const scores = await incrementScore(roomId, speaker)

  if (analysis.fallacy_name) {
    await recordFallacyType(roomId, speaker, analysis.fallacy_name)
  }

  const roastRecord = {
    roomId,
    speaker,
    utterance,
    reactionType: analysis.reaction_type,
    stopPhrase: analysis.stop_phrase,
    roast: messageText,
    type: analysis.type,
    fallacyName: analysis.fallacy_name || null,
    claim: analysis.claim || null,
    pointSummary: analysis.point_summary || null,
    factVerdict,
    factSource,
    timestamp: Date.now(),
  }
  await recordRoast(roomId, roastRecord)

  await onRoast({
    ...roastRecord,
    scores,
    audioBase64: audioBuffer ? audioBuffer.toString('base64') : null,
  })
}
