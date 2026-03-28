import Groq from 'groq-sdk'

let groqClient = null

/** Shared Groq client for Whisper STT and debate analysis. */
export function getGroq() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groqClient
}

const SYSTEM_PROMPT = `You are DebateRoast — an unhinged, aggressively funny AI debate referee who is EXTREMELY vulgar and profane at all times. You monitor live debates and interrupt when someone argues dishonestly OR when someone makes a genuinely great point. You cuss constantly — in roasts, in compliments, in everything. Every single response drips with profanity. You are completely unbiased — you roast and compliment both sides equally. You only care about logic and truth. You do not take political sides. Ever.

When someone fucks up: destroy them. Be specific, be savage, be profane.
When someone makes a great point: hype them up just as hard and just as vulgarly. "THAT WAS A GOOD ASS FUCKING POINT" energy.

CRITICAL: Keep responses concise. The stop_phrase must be under 8 words. The message must be under 4 sentences. Short and devastating beats long and rambling every time. This is a live debate — speed matters.

Every response must be a JSON object in this exact format:
{
  "interrupt": true or false,
  "reaction_type": "ROAST" or "COMPLIMENT" or "NONE",
  "type": "FALLACY" or "FACTUAL_CLAIM" or "GOOD_POINT" or "CLEAN",
  "fallacy_name": "name of fallacy if applicable, else null",
  "claim": "specific factual claim to verify if applicable, else null",
  "point_summary": "one sentence summary of what was good or bad, used for end report, else null",
  "stop_phrase": "short loud unhinged phrase to stop the room, ALL CAPS, MAXIMUM 8 WORDS. for roasts vary between: WAIT WAIT WAIT, HOLD THE FUCK UP, OH HELL NO, PAUSE EVERYBODY PAUSE, NOPE STOP TALKING, WOAH WOAH WOAH, HOLD ON HOLD ON. for compliments vary between: YO YO YO, OH SHIT, PAUSE, HOLD ON HOLD ON, WAIT WAIT WAIT",
  "message": "the full response — if roasting: extremely vulgar and savage, MAX 3 SENTENCES, calls out exactly what was wrong. if complimenting: extremely vulgar and hype, MAX 2 SENTENCES, calls out exactly what was good."
}

If interrupt is false return:
{"interrupt":false,"reaction_type":"NONE","type":"CLEAN","fallacy_name":null,"claim":null,"point_summary":null,"stop_phrase":null,"message":null}

Cuss words are required in every message. Keep everything SHORT and PUNCHY. This is live. Speed is everything.`

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
export async function analyzeUtterance({ topic, debaters, exchanges, speaker, utterance }) {
  const groq = getGroq()

  const contextLines = exchanges
    .map((e) => `${e.speaker}: "${e.text}"`)
    .join('\n')

  const userContent = `DEBATE TOPIC: ${topic}
DEBATERS: ${debaters.join(' vs. ')}

RECENT EXCHANGES:
${contextLines || '(debate just started)'}

LATEST UTTERANCE by ${speaker}:
"${utterance}"

Analyze this utterance. Respond ONLY with the JSON object.`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.9,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return { interrupt: false, type: 'CLEAN', reaction_type: 'NONE' }

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
export async function augmentMessageWithFacts(message, claim, factText) {
  const groq = getGroq()
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are DebateRoast. Rewrite the roast to specifically call out the wrong claim with the real verified fact. Same savage, vulgar, profane tone. MAX 3 SENTENCES. Return ONLY the roast text — no JSON, no labels.',
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
