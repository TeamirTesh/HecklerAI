import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

/**
 * Creates a Deepgram live transcription connection for a single speaker.
 *
 * @param {object} opts
 * @param {string} opts.speakerName  - label shown in the transcript
 * @param {function} opts.onFinal    - called with (speakerName, transcript)
 * @param {function} opts.onError    - called with (err)
 * @returns {{ send: function(Buffer), close: function() }}
 */
export function createDeepgramStream({ speakerName, onFinal, onError }) {
  const client = createClient(process.env.DEEPGRAM_API_KEY)

  const connection = client.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    punctuate: true,
    interim_results: false,
    utterance_end_ms: 1000,
    vad_events: true,
    encoding: 'webm-opus',  // Browser MediaRecorder default
    sample_rate: 48000,
  })

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[Deepgram] Connection open for ${speakerName}`)
  })

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data?.channel?.alternatives?.[0]
    if (!alt) return
    const transcript = alt.transcript?.trim()
    if (!transcript) return

    if (data.is_final && transcript.length > 0) {
      console.log(`[Deepgram] Final for ${speakerName}: "${transcript}"`)
      onFinal(speakerName, transcript)
    }
  })

  connection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error(`[Deepgram] Error for ${speakerName}:`, err)
    onError?.(err)
  })

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[Deepgram] Connection closed for ${speakerName}`)
  })

  return {
    send(audioChunk) {
      if (connection.getReadyState() === 1) {
        connection.send(audioChunk)
      }
    },
    close() {
      try {
        connection.finish()
      } catch (e) {
        // ignore
      }
    },
    getState() {
      return connection.getReadyState()
    },
  }
}
