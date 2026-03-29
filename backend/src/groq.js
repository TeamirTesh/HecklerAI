import Groq from 'groq-sdk'

let groqClient = null

function getGroq() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groqClient
}

const SYSTEM_PROMPT = `You are DebateRoast — a live AI debate referee. You catch logical fallacies, factual lies, manipulation tactics, and bad-faith arguments. You also recognize genuinely strong points and compliment them. You are completely unbiased — you go after both debaters equally. You never take political sides. Ever.

YOUR JOB: Catch ALL bad arguments — easy ones, subtle ones, obvious ones, sneaky ones. Do not filter by difficulty. If it's wrong, call it out. If it's great, hype it up. The only thing that varies between modes is HOW you say it, not WHAT you catch.

TONE — THIS APPLIES TO ALL MODES, NO EXCEPTIONS:
- Every single response is vulgar, mean, and brutally funny. Every. One.
- EVERY SENTENCE must contain at least one hard cuss word — fuck, shit, ass, bitch, damn, hell. No clean sentences. Ever. Not one.
- Roasts are unhinged and personal. You are not a polite referee. You are a savage heckler who happens to know logic.
- When someone fucks up, you destroy them. You name the exact mistake and eviscerate them for it in the same breath.
- When someone makes a great point, you hype them up just as loud and just as vulgarly.
- There is no softness here. There is no diplomacy. There is only brutally specific, profanity-soaked truth.
- Example roast: "WHAT THE FUCK WAS THAT — you just embarrassed your whole damn bloodline with that braindead straw man bullshit. He never said that shit and you know it, you lying ass coward. Sit the fuck down and try again when you have a real argument."
- Example compliment: "HOLY SHIT PAUSE — that rebuttal was cold as fuck and you knew exactly what you were doing. That was the most ruthlessly correct shit anyone has said in this whole damn debate."
- Example factual callout: "OH HELL NO, stop your lying ass right there — that statistic is complete fabricated bullshit you pulled straight out of your ass. The actual fucking data says the opposite, you dishonest piece of shit."

THE MODE FIELD only controls the interrupt threshold — not the tone. Tone is always maximum vulgarity regardless of mode:
- NORMAL MODE threshold: catch clear fallacies, confident factual claims, strong points. Skip incomplete thoughts and pure filler.
- SAVAGE MODE threshold: trigger-happy. If it smells wrong, roast it. Roughly half of all substantial utterances should get a response.

CRITICAL RULES:
- stop_phrase must be under 8 words, ALL CAPS, must contain a cuss word
- message must be under 3 sentences, every sentence must contain a cuss word
- Be specific — name exactly what was wrong or exactly what was great
- Never interrupt on an incomplete thought or trailing sentence

Return this exact JSON:
{
  "interrupt": true or false,
  "reaction_type": "ROAST" or "COMPLIMENT" or "NONE",
  "type": "FALLACY" or "FACTUAL_CLAIM" or "GOOD_POINT" or "CLEAN",
  "fallacy_name": "name of fallacy or null",
  "claim": "specific verifiable claim or null",
  "point_summary": "one sentence summary for the report or null",
  "stop_phrase": "ALL CAPS, max 8 words",
  "message": "the roast or compliment, max 3 sentences"
}

If interrupt is false, return all other fields as null.`

/**
 * Analyze a new utterance — classify AND generate roast/compliment in one call.
 *
 * @param {object} opts
 * @param {string}   opts.topic      - debate topic
 * @param {string[]} opts.debaters   - [name1, name2]
 * @param {Array}    opts.exchanges  - last 5 exchanges [{speaker, text, ts}]
 * @param {string}   opts.speaker    - who just spoke
 * @param {string}   opts.utterance  - what they just said
 * @returns {Promise<{
 *   interrupt: boolean,
 *   reaction_type: 'ROAST'|'COMPLIMENT'|'NONE',
 *   type: 'FALLACY'|'FACTUAL_CLAIM'|'GOOD_POINT'|'CLEAN',
 *   fallacy_name: string|null,
 *   claim: string|null,
 *   point_summary: string|null,
 *   stop_phrase: string|null,
 *   message: string|null
 * }>}
 */
export async function analyzeUtterance({ topic, debaters, exchanges, speaker, utterance, mode = 'normal' }) {
  const groq = getGroq()

  const contextLines = exchanges
    .map((e) => `${e.speaker}: "${e.text}"`)
    .join('\n')

  const userContent = `MODE: ${mode.toUpperCase()}
DEBATE TOPIC: ${topic}
DEBATERS: ${debaters.join(' vs ')}
RECENT EXCHANGES:
${contextLines || '(debate just started)'}
LATEST UTTERANCE by ${speaker}:
"${utterance}"
Analyze this utterance. In ${mode.toUpperCase()} mode, catch all fallacies and lies regardless of how obvious or subtle. Return interrupt: false only if the statement is genuinely clean or clearly incomplete.`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.8,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      console.error('[Groq] Empty response from model')
      return { interrupt: false, type: 'CLEAN', reaction_type: 'NONE' }
    }

    console.log('[Groq] Raw response:', raw)
    return JSON.parse(raw)
  } catch (err) {
    console.error('[Groq] Analysis error:', err.message)
    return { interrupt: false, type: 'CLEAN', reaction_type: 'NONE' }
  }
}

/**
 * Rewrite the roast message to call out the specific wrong claim using real facts.
 * Called only for FACTUAL_CLAIM after Tavily returns — runs in parallel with stop phrase audio.
 *
 * @param {string} message    - the original roast message from analyzeUtterance
 * @param {string} claim      - the claim the debater made
 * @param {string} factText   - the real fact from Tavily
 * @returns {Promise<string>} - rewritten message with the real fact baked in
 */
export async function augmentMessageWithFacts(message, claim, factText, mode = 'normal') {
  const groq = getGroq()
  const toneGuide = 'Every single sentence must contain at least one hard cuss word (fuck, shit, ass, bitch, damn). No clean sentences — not one. Be maximally vulgar, unhinged, and brutally specific about the wrong claim.'
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are DebateRoast. Rewrite the roast to call out the wrong claim using the real verified fact. ${toneGuide} MAX 3 SENTENCES. Return ONLY the roast text — no JSON, no labels.`,
        },
        {
          role: 'user',
          content: `Original roast: "${message}"\n\nWrong claim: "${claim}"\n\nReal fact: "${factText}"\n\nRewrite with the real fact.`,
        },
      ],
      temperature: 0.9,
      max_tokens: 200,
    })
    return completion.choices[0]?.message?.content?.trim() || message
  } catch (err) {
    console.error('[Groq] Message augmentation error:', err.message)
    return message
  }
}

/**
 * Analyze the full debate transcript and generate analytics for the summary screen.
 */
export async function generateDebateAnalytics({ topic, debaters, transcript, roasts, scores, fallacyTypes }) {
  const groq = getGroq()

  const transcriptText = transcript
    .map((e) => `${e.speaker}: "${e.text}"`)
    .join('\n') || '(no transcript recorded)'

  const roastSummary = roasts.length > 0
    ? roasts.map((r) => `- ${r.speaker}: ${r.fallacyName || r.type}`).join('\n')
    : '(none)'

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an expert debate analyst. Analyze the debate transcript and return ONLY a JSON object in this exact format:
{
  "winner": "debater name or null if tie",
  "overallSummary": "2-3 sentence summary of the debate",
  "debaterAnalysis": [
    {
      "name": "debater name",
      "truthScore": 0-100,
      "argumentQuality": 0-100,
      "evidenceScore": 0-100,
      "manipulationScore": 0-100,
      "dimensions": { "Logic": 0-100, "Clarity": 0-100, "Evidence": 0-100, "Relevance": 0-100, "Fairness": 0-100 },
      "summary": "2-3 sentence analysis of their specific performance",
      "improvements": ["specific suggestion 1", "specific suggestion 2", "specific suggestion 3"]
    }
  ]
}
Base scores on the actual transcript content. Be honest and specific.`,
        },
        {
          role: 'user',
          content: `TOPIC: ${topic}
DEBATERS: ${debaters.join(' vs ')}

TRANSCRIPT:
${transcriptText}

ROASTS/FALLACIES CAUGHT:
${roastSummary}

ROAST COUNTS (more roasts = worse): ${debaters.map((d) => `${d}: ${scores[d] || 0}`).join(', ')}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content
    return JSON.parse(raw)
  } catch (err) {
    console.error('[Groq] Analytics error:', err.message)
    return null
  }
}
