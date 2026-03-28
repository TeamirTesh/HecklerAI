/**
 * Fact-check a claim using Tavily Search API.
 * Returns the raw fact data — augmentation into the roast message is handled upstream.
 *
 * @param {string} claim
 * @returns {Promise<{ verdict: 'FALSE'|'UNVERIFIABLE', source: string|null, factText: string|null }>}
 */
export async function factCheck(claim) {
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
    const factText = data.answer || data.results?.[0]?.content || null
    const source = data.results?.[0]?.url || null

    if (!factText) {
      return { verdict: 'UNVERIFIABLE', source: null, factText: null }
    }

    return { verdict: 'FALSE', source, factText }
  } catch (err) {
    console.error('[Tavily] Fact-check error:', err.message)
    return { verdict: 'UNVERIFIABLE', source: null, factText: null }
  }
}
