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

/**
 * Process a finalized utterance through the full analysis pipeline.
 *
 * Latency strategy:
 *   FALLACY / GOOD_POINT  → single Groq call, stop+message TTS in parallel, emit. (~1–1.5s)
 *   FACTUAL_CLAIM         → stop phrase TTS and Tavily fire simultaneously.
 *                           Tavily returns while stop phrase audio is being delivered.
 *                           Message is augmented with real facts, then message TTS fires. (~2–3s)
 *   CLEAN                 → discarded immediately, no further work.
 */
export async function processUtterance({ roomId, speaker, utterance, roastLevel = 'savage', onRoast }) {
  // Skip very short utterances — likely fragments, not full thoughts
  if (utterance.trim().split(/\s+/).length < 4) return

  const room = await getRoom(roomId)
  if (!room || room.status !== 'active') return

  // Save to rolling context (capped to last 5 in roomManager)
  await pushExchange(roomId, speaker, utterance)
  const exchanges = await getExchanges(roomId)

  // Single Groq call — classification + roast/compliment generation in one shot
  const analysis = await analyzeUtterance({
    topic: room.topic,
    debaters: room.debaters,
    exchanges,
    speaker,
    utterance,
    roastLevel,
  })

  if (!analysis.interrupt) return

  let messageText = analysis.message
  let factSource = null
  let factVerdict = null
  let audioBuffer = null

  if (analysis.type === 'FACTUAL_CLAIM' && analysis.claim) {
    // PARALLEL: fire stop phrase TTS and Tavily simultaneously
    console.log(`[Analysis] Parallel: stop phrase TTS + Tavily for "${analysis.claim}"`)
    const [stopAudio, factResult] = await Promise.all([
      generateSpeech(analysis.stop_phrase, { speed: 1 }),
      factCheck(analysis.claim),
    ])

    factSource = factResult.source
    factVerdict = factResult.verdict

    if (factVerdict === 'UNVERIFIABLE') {
      factVerdict = null
    }

    // Augment the roast message with the real fact
    if (factResult.factText) {
      messageText = await augmentMessageWithFacts(analysis.message, analysis.claim, factResult.factText)
    }

    const messageAudio = await generateSpeech(messageText, { speed: 0 })

    const parts = []
    if (stopAudio) parts.push(stopAudio)
    if (messageAudio) parts.push(messageAudio)
    audioBuffer = parts.length ? Buffer.concat(parts) : null
  } else {
    // FALLACY or GOOD_POINT — stop phrase and message TTS run in parallel inside buildRoastAudio
    audioBuffer = await buildRoastAudio(analysis.stop_phrase, messageText)
  }

  const scores = await incrementScore(roomId, speaker)

  if (analysis.fallacy_name && typeof analysis.fallacy_name === 'string' && analysis.fallacy_name.trim()) {
    await recordFallacyType(roomId, speaker, analysis.fallacy_name.trim())
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
