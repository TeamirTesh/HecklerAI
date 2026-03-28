import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk'

const MIN_BUFFER_BYTES = 40000

/**
 * Creates a buffered audio transcription stream using Groq's Whisper API.
 * Accumulates all chunks into one growing buffer; transcribes when close() is
 * called or when the buffer reaches MIN_BUFFER_BYTES, ensuring the webm header
 * from the first chunk is always present.
 *
 * @param {object} opts
 * @param {string} opts.speakerName  - label shown in the transcript
 * @param {function} opts.onFinal    - called with (speakerName, transcript)
 * @param {function} opts.onError    - called with (err)
 * @returns {{ send: function(Buffer), close: function() }}
 */
export function createDeepgramStream({ speakerName, onFinal, onError }) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const chunks = []
  let totalBytes = 0
  let closed = false
  let transcribing = false

  async function tryTranscribe({ force = false } = {}) {
    if (transcribing || closed && !force) return
    if (totalBytes < MIN_BUFFER_BYTES && !force) return
    if (chunks.length === 0) return

    transcribing = true
    const audioBuffer = Buffer.concat(chunks.splice(0))
    totalBytes = 0

    try {
      const file = await toFile(audioBuffer, 'audio.webm', { type: 'audio/webm' })
      const result = await groq.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3-turbo',
        response_format: 'json',
        language: 'en',
      })
      const transcript = result.text?.trim()
      if (transcript) {
        console.log(`[Whisper] Final for ${speakerName}: "${transcript}"`)
        onFinal(speakerName, transcript)
      }
    } catch (err) {
      console.error(`[Whisper] Transcription error for ${speakerName}:`, err.message)
      onError?.(err)
    } finally {
      transcribing = false
    }
  }

  return {
    send(audioChunk) {
      if (closed) return
      chunks.push(audioChunk)
      totalBytes += audioChunk.length
      tryTranscribe()
    },
    close() {
      closed = true
      tryTranscribe({ force: true })
    },
  }
}
