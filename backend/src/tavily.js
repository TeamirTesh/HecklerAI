import { augmentRoastWithFacts } from './groq.js'

/**
 * Fact-check a claim using Tavily Search API, then pass the result into
 * Groq to rewrite the roast with the real fact baked in.
 *
 * @param {string} claim - the claim to verify
 * @param {string} roast - the original roast (will be augmented with facts)
 * @returns {Promise<{ verdict: string, source: string|null, augmentedRoast: string }>}
 */
export async function factCheck(claim, roast) {
  let tavilyData = null

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: claim,
        search_depth: 'basic',
        max_results: 3,
      }),
    })

    if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`)

    const data = await response.json()

    tavilyData = {
      answer: data.answer || null,
      sources: data.results?.map((r) => r.url) || [],
      relevant: data.results?.[0]?.content || null,
    }
  } catch (err) {
    console.error('[Tavily] Fact-check error:', err.message)
    // Fall back: roast the claim as a fallacy without a source
    return { verdict: 'UNVERIFIABLE', source: null, augmentedRoast: roast }
  }

  const factText = tavilyData.answer || tavilyData.relevant
  if (!factText) {
    // Nothing useful found — still roast, just without a source
    return { verdict: 'UNVERIFIABLE', source: null, augmentedRoast: roast }
  }

  // Pass Tavily facts into Groq so the roast calls out the real number/fact
  const augmentedRoast = await augmentRoastWithFacts(roast, claim, factText)
  const source = tavilyData.sources[0] || null

  return {
    verdict: 'FALSE',
    source,
    augmentedRoast,
  }
}
