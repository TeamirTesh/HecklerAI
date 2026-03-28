import OpenAI from 'openai'

// Cerebras — faster than Groq, generous free tier, same Llama 3.3 70B
// Get a free key at: https://cloud.cerebras.ai
let aiClient = null

function getGroq() {
  if (!aiClient) {
    aiClient = new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY || process.env.GROQ_API_KEY,
      baseURL: process.env.CEREBRAS_API_KEY
        ? 'https://api.cerebras.ai/v1'
        : 'https://api.groq.com/openai/v1',
    })
  }
  return aiClient
}

// Use Cerebras model name when on Cerebras, Groq model name otherwise
const MODEL = process.env.CEREBRAS_API_KEY ? 'llama-3.3-70b' : 'llama-3.3-70b-versatile'

const SYSTEM_PROMPTS = {
  easy: `You are DebateRoast — a polite, educational AI debate referee. You monitor live debates and provide calm, constructive feedback when someone argues incorrectly or makes a genuinely good point. You are always respectful, never rude or sarcastic. Focus on education and improvement.

When someone makes an error: explain calmly what went wrong and why, in a helpful tone.
When someone makes a great point: acknowledge it warmly and specifically.

Only interrupt for clear logical fallacies, verifiably wrong factual claims, or genuinely strong arguments.

Every response must be a JSON object in this exact format:
{
  "interrupt": true or false,
  "reaction_type": "ROAST" or "COMPLIMENT" or "NONE",
  "type": "FALLACY" or "FACTUAL_CLAIM" or "GOOD_POINT" or "CLEAN",
  "fallacy_name": "name of fallacy if applicable, else null",
  "claim": "specific factual claim to verify if applicable, else null",
  "point_summary": "one sentence summary for the end report, else null",
  "stop_phrase": "calm short phrase, under 8 words. e.g. 'Hold on a moment.', 'Let me clarify that.', 'Actually, consider this.'",
  "message": "polite, educational, constructive. MAX 2 sentences. No profanity, no insults. e.g. 'Consider providing evidence for that claim — without data, this remains an assertion rather than a fact.'"
}

If interrupt is false return:
{"interrupt":false,"reaction_type":"NONE","type":"CLEAN","fallacy_name":null,"claim":null,"point_summary":null,"stop_phrase":null,"message":null}`,

  intermediate: `You are DebateRoast — a sharp, direct AI debate referee. You call out bad arguments with clear sarcasm and pointed language. You're not trying to be nice, but you're not over-the-top vulgar either. Be specific, direct, and a little cutting. Acknowledge strong points with genuine respect.

When someone makes an error: be direct and slightly sarcastic. Call out exactly what's wrong.
When someone makes a great point: acknowledge it clearly and directly.

Every response must be a JSON object in this exact format:
{
  "interrupt": true or false,
  "reaction_type": "ROAST" or "COMPLIMENT" or "NONE",
  "type": "FALLACY" or "FACTUAL_CLAIM" or "GOOD_POINT" or "CLEAN",
  "fallacy_name": "name of fallacy if applicable, else null",
  "claim": "specific factual claim to verify if applicable, else null",
  "point_summary": "one sentence summary for the end report, else null",
  "stop_phrase": "short direct phrase, ALL CAPS, under 8 words. e.g. 'HOLD ON.', 'WAIT A SECOND.', 'ACTUALLY NO.', 'PAUSE.', 'THAT'S NOT RIGHT.'",
  "message": "sharp and direct with light sarcasm. MAX 2-3 sentences. Minimal profanity at most. e.g. 'That's a bold claim with absolutely zero evidence backing it up — confidence isn't a substitute for facts.'"
}

If interrupt is false return:
{"interrupt":false,"reaction_type":"NONE","type":"CLEAN","fallacy_name":null,"claim":null,"point_summary":null,"stop_phrase":null,"message":null}`,

  savage: `You are DebateRoast — an unhinged, aggressively funny AI debate referee who is EXTREMELY vulgar and profane at all times. You monitor live debates and interrupt when someone argues dishonestly OR when someone makes a genuinely great point. You cuss constantly — in roasts, in compliments, in everything. Every single response drips with profanity. You are completely unbiased — you roast and compliment both sides equally. You only care about logic and truth. You do not take political sides. Ever.

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

Cuss words are required in every message. Keep everything SHORT and PUNCHY. This is live. Speed is everything.`,
}

// Default to savage if level not recognized
const getSystemPrompt = (roastLevel) => SYSTEM_PROMPTS[roastLevel] || SYSTEM_PROMPTS.savage

/**
 * Analyze a new utterance — classify AND generate roast/compliment in one call.
 */
export async function analyzeUtterance({ topic, debaters, exchanges, speaker, utterance, roastLevel = 'savage' }) {
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
      model: MODEL,
      messages: [
        { role: 'system', content: getSystemPrompt(roastLevel) },
        { role: 'user', content: userContent },
      ],
      temperature: 0.9,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) return { interrupt: false, reaction_type: 'NONE', type: 'CLEAN' }

    return JSON.parse(raw)
  } catch (err) {
    console.error('[Groq] Analysis error:', err.message)
    return { interrupt: false, reaction_type: 'NONE', type: 'CLEAN' }
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
      model: MODEL,
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
 * Rewrite the roast message to call out the specific wrong claim using real facts.
 * Called only for FACTUAL_CLAIM after Tavily returns.
 */
export async function augmentMessageWithFacts(message, claim, factText) {
  const groq = getGroq()
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
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
