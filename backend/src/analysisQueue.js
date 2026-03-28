import {
  getRoom,
  getExchanges,
  pushExchange,
  incrementScore,
  recordFallacyType,
  recordRoast,
} from './roomManager.js'
import { analyzeUtterance } from './groq.js'
import { factCheck } from './tavily.js'
import { buildRoastAudio } from './cartesia.js'

/**
 * Process a finalized utterance through the full analysis pipeline.
 *
 * @param {object} opts
 * @param {string}   opts.roomId
 * @param {string}   opts.speaker     - debater name
 * @param {string}   opts.utterance   - finalized transcript text
 * @param {function} opts.onRoast     - async (roastPayload) callback to emit to clients
 */
export async function processUtterance({ roomId, speaker, utterance, onRoast }) {
  const room = await getRoom(roomId)
  if (!room || room.status !== 'active') return

  // Save to rolling context
  await pushExchange(roomId, speaker, utterance)

  const exchanges = await getExchanges(roomId)

  // Step 1: Groq analysis
  const analysis = await analyzeUtterance({
    topic: room.topic,
    debaters: room.debaters,
    exchanges,
    speaker,
    utterance,
  })

  if (!analysis.interrupt) return

  let roastText = analysis.roast
  let factSource = null
  let factVerdict = null

  // Step 2: Fact-check if needed
  if (analysis.type === 'FACTUAL_CLAIM' && analysis.claim) {
    console.log(`[Analysis] Fact-checking: "${analysis.claim}"`)
    const factResult = await factCheck(analysis.claim, roastText)
    roastText = factResult.augmentedRoast
    factSource = factResult.source
    factVerdict = factResult.verdict

    // Only roast if the claim is actually wrong
    if (factVerdict === 'TRUE') {
      console.log('[Analysis] Claim verified as true — skipping roast')
      return
    }
  }

  // Step 3: Generate TTS audio
  console.log(`[Analysis] Generating roast audio for ${speaker}`)
  const audioBuffer = await buildRoastAudio(analysis.stop_phrase, roastText)

  // Step 4: Update scores
  const scores = await incrementScore(roomId, speaker)

  // Step 5: Record fallacy type
  if (analysis.fallacy_name) {
    await recordFallacyType(roomId, speaker, analysis.fallacy_name)
  }

  // Step 6: Record roast for summary
  const roastRecord = {
    roomId,
    speaker,
    utterance,
    stopPhrase: analysis.stop_phrase,
    roast: roastText,
    type: analysis.type,
    fallacyName: analysis.fallacy_name || null,
    claim: analysis.claim || null,
    factVerdict,
    factSource,
    timestamp: Date.now(),
  }
  await recordRoast(roomId, roastRecord)

  // Step 7: Emit to clients
  const payload = {
    ...roastRecord,
    scores,
    audioBase64: audioBuffer ? audioBuffer.toString('base64') : null,
  }

  await onRoast(payload)
}
