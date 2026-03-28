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
 *
 * @param {object}   opts
 * @param {string}   opts.roomId
 * @param {string}   opts.speaker    - debater name
 * @param {string}   opts.utterance  - finalized transcript text
 * @param {function} opts.onRoast    - async (payload) => void — emits to clients
 */
export async function processUtterance({ roomId, speaker, utterance, onRoast }) {
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
  })

  if (!analysis.interrupt) return

  let messageText = analysis.message
  let factSource = null
  let factVerdict = null
  let audioBuffer = null

  if (analysis.type === 'FACTUAL_CLAIM' && analysis.claim) {
    // PARALLEL TRICK: fire stop phrase TTS and Tavily simultaneously.
    // Stop phrase audio is ready by the time Tavily returns, so both are
    // assembled into one payload with zero extra wait.
    console.log(`[Analysis] Parallel: stop phrase TTS + Tavily for "${analysis.claim}"`)
    const [stopAudio, factResult] = await Promise.all([
      generateSpeech(analysis.stop_phrase, { speed: 1 }),
      factCheck(analysis.claim),
    ])

    factSource = factResult.source
    factVerdict = factResult.verdict

    if (factVerdict === 'UNVERIFIABLE') {
      // No facts found — roast with the original message, no source shown
      factVerdict = null
    }

    // Augment the roast message with the real fact before generating its audio
    if (factResult.factText) {
      messageText = await augmentMessageWithFacts(analysis.message, analysis.claim, factResult.factText)
    }

    const messageAudio = await generateSpeech(messageText, { speed: 0 })

    const parts = []
    if (stopAudio) parts.push(stopAudio)
    if (messageAudio) parts.push(messageAudio)
    audioBuffer = parts.length ? Buffer.concat(parts) : null
  } else {
    // FALLACY or GOOD_POINT — stop phrase and message TTS already run in parallel inside buildRoastAudio
    audioBuffer = await buildRoastAudio(analysis.stop_phrase, messageText)
  }

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
