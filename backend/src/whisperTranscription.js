import { toFile } from 'groq-sdk'
import { getGroq } from './groq.js'

const MODEL = 'whisper-large-v3'
/** How often to send accumulated audio to Whisper (Groq has no streaming STT). */
const FLUSH_INTERVAL_MS = 2800
/** Skip tiny buffers during live flushes to avoid junk API calls. */
const MIN_PERIODIC_BYTES = 2000
/** On session end, transcribe any remaining audio with speech. */
const MIN_FINAL_BYTES = 400

/**
 * Buffered live transcription: collects WebM/opus chunks from the browser and
 * periodically calls Groq Whisper. Same outward shape as the old streaming STT
 * (finalize → callback).
 *
 * @param {object} opts
 * @param {string} opts.speakerName
 * @param {function} opts.onFinal - async (speakerName, transcript)
 * @param {function} [opts.onError] - (err) => void
 * @returns {{ send: (buf: Buffer) => void, close: () => Promise<void> }}
 */
export function createWhisperLiveSession({ speakerName, onFinal, onError }) {
  const buffers = []
  let pendingBytes = 0
  let flushTimer = null
  let closed = false
  let chain = Promise.resolve()

  async function transcribe(audio, { isFinal = false } = {}) {
    const minBytes = isFinal ? MIN_FINAL_BYTES : MIN_PERIODIC_BYTES
    if (!audio.length || audio.length < minBytes) return

    try {
      const groq = getGroq()
      const file = await toFile(audio, 'audio.webm', { type: 'audio/webm' })
      const { text } = await groq.audio.transcriptions.create({
        file,
        model: MODEL,
        language: 'en',
      })
      const transcript = text?.trim()
      if (transcript) {
        console.log(`[Whisper] ${speakerName}: "${transcript}"`)
        await onFinal(speakerName, transcript)
      }
    } catch (err) {
      console.error(`[Whisper] Error for ${speakerName}:`, err.message || err)
      onError?.(err)
    }
  }

  function drainToTranscribe(isFinal) {
    if (pendingBytes === 0 || buffers.length === 0) return
    const minBytes = isFinal ? MIN_FINAL_BYTES : MIN_PERIODIC_BYTES
    if (pendingBytes < minBytes) return

    const combined = Buffer.concat(buffers)
    buffers.length = 0
    pendingBytes = 0
    chain = chain.then(() => transcribe(combined, { isFinal }))
  }

  function startFlushTimer() {
    if (flushTimer || closed) return
    flushTimer = setInterval(() => {
      if (closed) return
      drainToTranscribe(false)
    }, FLUSH_INTERVAL_MS)
  }

  return {
    send(audioChunk) {
      if (closed) return
      buffers.push(audioChunk)
      pendingBytes += audioChunk.length
      startFlushTimer()
    },

    async close() {
      closed = true
      if (flushTimer) {
        clearInterval(flushTimer)
        flushTimer = null
      }
      drainToTranscribe(true)
      await chain
    },
  }
}
