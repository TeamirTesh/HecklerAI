const MODEL = 'whisper-large-v3'
const GROQ_TRANSCRIBE_URL =
  (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '') +
  '/audio/transcriptions'

/** Ignore near-empty uploads. */
const MIN_SEGMENT_BYTES = 256

function isRiffWave(buf) {
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WAVE'
  )
}

function isWebmEbml(buf) {
  return buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3
}

function fileMeta(mimeType, buf) {
  if (buf && isRiffWave(buf)) return { name: 'audio.wav', type: 'audio/wav' }
  if (buf && isWebmEbml(buf)) return { name: 'audio.webm', type: 'audio/webm' }
  const m = (mimeType || '').toLowerCase()
  if (m.includes('wav')) return { name: 'audio.wav', type: 'audio/wav' }
  if (m.includes('webm')) return { name: 'audio.webm', type: 'audio/webm' }
  if (m.includes('ogg')) return { name: 'audio.ogg', type: mimeType || 'audio/ogg' }
  return { name: 'audio.wav', type: 'audio/wav' }
}

let lastGroqMediaErrorLog = 0

async function transcribeBuffer(buf, filename, contentType) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY is not set')

  const form = new FormData()
  const blob = new Blob([buf], { type: contentType })
  form.append('file', blob, filename)
  form.append('model', MODEL)
  form.append('language', 'en')

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${raw}`)
  }
  return JSON.parse(raw)
}

/**
 * Transcribe one audio segment (WAV preferred). Used by HTTP upload path.
 * @returns {Promise<string>} trimmed text or empty string
 */
export async function transcribeWhisperToText(buf, mimeType) {
  if (!buf?.length || buf.length < MIN_SEGMENT_BYTES) return ''
  const { name, type } = fileMeta(mimeType, buf)
  try {
    const data = await transcribeBuffer(buf, name, type)
    return data?.text?.trim() || ''
  } catch (err) {
    const msg = err?.message || String(err)
    const now = Date.now()
    if (msg.includes('valid media file') || msg.includes('invalid_request')) {
      if (now - lastGroqMediaErrorLog > 15000) {
        lastGroqMediaErrorLog = now
        console.error(
          `[Whisper] Groq rejected audio. First bytes: ${buf.subarray(0, 16).toString('hex')} len=${buf.length} ${msg.slice(0, 120)}`
        )
      }
    } else {
      console.error('[Whisper] Transcription error:', msg.slice(0, 200))
    }
    return ''
  }
}
