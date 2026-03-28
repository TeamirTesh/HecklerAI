import { StreamingTranscriber } from 'assemblyai'

/**
 * Creates an AssemblyAI real-time transcription stream for a single speaker.
 * Uses the v3 Streaming API (wss://streaming.assemblyai.com/v3/ws).
 *
 * @param {object} opts
 * @param {string} opts.speakerName  - label shown in the transcript
 * @param {function} opts.onFinal    - called with (speakerName, transcript)
 * @param {function} opts.onError    - called with (err)
 * @returns {{ send: function(Buffer), close: function() }}
 */
export function createDeepgramStream({ speakerName, onFinal, onError }) {
  const transcriber = new StreamingTranscriber({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
    sampleRate: 16000,
    speechModel: 'universal-streaming-english',
  })

  transcriber.on('open', () => {
    console.log(`[AssemblyAI] Connected for ${speakerName}`)
  })

  // v3 fires "turn" events; end_of_turn=true means a final, complete sentence
  transcriber.on('turn', (event) => {
    if (event.end_of_turn && event.transcript?.trim()) {
      const transcript = event.transcript.trim()
      console.log(`[AssemblyAI] Final for ${speakerName}: "${transcript}"`)
      onFinal(speakerName, transcript)
    }
  })

  transcriber.on('error', (err) => {
    console.error(`[AssemblyAI] Error for ${speakerName}:`, err)
    onError?.(err)
  })

  transcriber.on('close', (code, reason) => {
    console.log(`[AssemblyAI] Closed for ${speakerName} — ${code} ${reason}`)
  })

  // Connect immediately; await before first send if needed
  let connected = false
  let failed = false
  const readyPromise = transcriber.connect().then(() => {
    connected = true
  }).catch((err) => {
    failed = true
    console.error(`[AssemblyAI] Connection failed for ${speakerName}:`, err)
    onError?.(err)
  })

  return {
    async send(buffer) {
      if (failed) return
      if (!connected) await readyPromise
      if (failed) return
      transcriber.sendAudio(buffer)
    },
    async close() {
      await transcriber.close()
    },
  }
}
