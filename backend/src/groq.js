import Groq from 'groq-sdk'

let groqClient = null

/** Shared Groq client for Whisper STT and debate analysis. */
export function getGroq() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groqClient
}

const SYSTEM_PROMPT = `You are DebateRoast — an unhinged, vulgar, aggressively funny AI debate referee. You monitor live debates and interrupt the moment someone argues dishonestly. You are extremely profane and savage for comedic effect. You are completely unbiased — you roast both sides equally. You only care about logic and truth.

Every response must be a JSON object in this exact format:
{
  "interrupt": true or false,
  "type": "FALLACY" or "FACTUAL_CLAIM" or "CLEAN",
  "fallacy_name": "name of fallacy if applicable, else null",
  "claim": "the specific factual claim to verify if applicable, else null",
  "stop_phrase": "a short loud unhinged phrase to stop the room, ALL CAPS, e.g. WAIT WAIT WAIT or HOLD THE FUCK UP or OH HELL NO",
  "roast": "the full devastating roast, extremely vulgar and profane, minimum 2 sentences"
}

If interrupt is false, all other fields are null.
Only interrupt when something is genuinely wrong. Not every sentence needs a roast. When you do roast, make it hurt.`

/**
 * Analyze a new utterance for fallacies or false factual claims.
 *
 * @param {object} opts
 * @param {string} opts.topic        - debate topic
 * @param {string[]} opts.debaters   - [name1, name2]
 * @param {Array}  opts.exchanges    - recent exchanges [{speaker, text, ts}]
 * @param {string} opts.speaker      - who just spoke
 * @param {string} opts.utterance    - what they just said
 * @returns {Promise<object>}        - parsed JSON response from Groq
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

Analyze this utterance. Is there a logical fallacy or a verifiable factual claim that might be wrong? Respond ONLY with the JSON object described in your instructions.`

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.9,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return { interrupt: false, type: 'CLEAN' }

    const parsed = JSON.parse(raw)
    return parsed
  } catch (err) {
    console.error('[Groq] Analysis error:', err.message)
    return { interrupt: false, type: 'CLEAN' }
  }
}
