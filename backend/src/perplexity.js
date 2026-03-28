import axios from 'axios'

/**
 * Fact-check a claim using Perplexity API.
 *
 * @param {string} claim - the claim to verify
 * @param {string} roast - the original roast (will be augmented with facts)
 * @returns {Promise<{ verdict: string, source: string, augmentedRoast: string }>}
 */
export async function factCheck(claim, roast) {
  try {
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content:
              'You are a fact-checker. Respond in JSON: { "verdict": "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIABLE", "correction": "one sentence explaining the truth if wrong, or null if true", "source": "a brief source description or URL if you have one" }',
          },
          {
            role: 'user',
            content: `Fact-check this claim: "${claim}"`,
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    )

    const raw = response.data?.choices?.[0]?.message?.content
    if (!raw) return { verdict: 'UNVERIFIABLE', source: null, augmentedRoast: roast }

    // Strip markdown code fences if present
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    let augmentedRoast = roast
    if (parsed.verdict !== 'TRUE' && parsed.correction) {
      augmentedRoast = `${roast} And by the way — FACT CHECK SAYS: ${parsed.correction}`
    }

    return {
      verdict: parsed.verdict,
      source: parsed.source || null,
      augmentedRoast,
    }
  } catch (err) {
    console.error('[Perplexity] Fact-check error:', err.message)
    return { verdict: 'UNVERIFIABLE', source: null, augmentedRoast: roast }
  }
}
