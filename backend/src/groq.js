import Groq from 'groq-sdk'

let groqClient = null

function getGroq() {
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

/**
 * Analyze the full debate transcript and generate real analytics for the summary screen.
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

/**
 * Rewrite a roast to call out the specific wrong claim using real facts
 * retrieved from Tavily.
 *
 * @param {string} roast       - the original roast text
 * @param {string} claim       - the claim the debater made
 * @param {string} factAnswer  - the real fact from Tavily (answer or top result)
 * @returns {Promise<string>}  - the rewritten roast with the real fact baked in
 */
export async function augmentRoastWithFacts(roast, claim, factAnswer) {
  const groq = getGroq()
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are DebateRoast. You have a roast ready but now have the real verified facts. Rewrite the roast to specifically call out the wrong claim with the real number or fact. Keep the same savage, vulgar, profane tone. Return ONLY the roast text — no JSON, no labels, no extra commentary.',
        },
        {
          role: 'user',
          content: `Original roast: "${roast}"\n\nWrong claim made: "${claim}"\n\nReal verified fact: "${factAnswer}"\n\nRewrite the roast to destroy them with the real fact.`,
        },
      ],
      temperature: 0.9,
      max_tokens: 300,
    })
    return completion.choices[0]?.message?.content?.trim() || roast
  } catch (err) {
    console.error('[Groq] Roast augmentation error:', err.message)
    return roast
  }
}
