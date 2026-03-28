import { RealtimeTranscriber } from 'assemblyai'

/**
 * Creates an AssemblyAI real-time transcription stream for a single speaker.
 *
 * @param {object} opts
 * @param {string} opts.speakerName  - label shown in the transcript
 * @param {function} opts.onFinal    - called with (speakerName, transcript)
 * @param {function} opts.onError    - called with (err)
 * @returns {{ send: function(Buffer), close: function() }}
 */
export function createDeepgramStream({ speakerName, onFinal, onError }) {
  const transcriber = new RealtimeTranscriber({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
    sampleRate: 16000,
  })

  transcriber.on('transcript', (message) => {
    if (message.message_type === 'FinalTranscript' && message.text?.trim()) {
      const transcript = message.text.trim()
      console.log(`[AssemblyAI] Final for ${speakerName}: "${transcript}"`)
      onFinal(speakerName, transcript)
    }
  })

  transcriber.on('error', (err) => {
    console.error(`[AssemblyAI] Error for ${speakerName}:`, err)
    onError?.(err)
  })

  transcriber.on('close', (code, reason) => {
    console.log(`[AssemblyAI] Connection closed for ${speakerName} — ${code} ${reason}`)
  })

  // Connect immediately; store the promise so send() can await it if needed
  const readyPromise = transcriber.connect().then(() => {
    console.log(`[AssemblyAI] Connected for ${speakerName}`)
  }).catch((err) => {
    console.error(`[AssemblyAI] Connection failed for ${speakerName}:`, err)
    onError?.(err)
  })

  let connected = false
  readyPromise.then(() => { connected = true })

  return {
    async send(buffer) {
      if (!connected) await readyPromise
      transcriber.sendAudio(buffer)
    },
    async close() {
      await transcriber.close()
    },
  }
}
