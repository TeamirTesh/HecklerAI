import { useRef, useCallback, useState } from 'react'

const CHUNK_INTERVAL_MS = 250 // send audio every 250ms

/**
 * Hook for capturing microphone audio and streaming it via a callback.
 *
 * @param {function} onChunk - called with base64-encoded audio chunk
 * @returns {{ start, stop, isRecording, error }}
 */
export function useAudio(onChunk) {
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
        video: false,
      })
      streamRef.current = stream

      // Prefer webm/opus — Deepgram handles it well
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg;codecs=opus'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const reader = new FileReader()
          reader.onloadend = () => {
            // Strip the data URL prefix and get base64
            const base64 = reader.result.split(',')[1]
            onChunk(base64)
          }
          reader.readAsDataURL(e.data)
        }
      }

      recorder.start(CHUNK_INTERVAL_MS)
      setIsRecording(true)
      setError(null)
    } catch (err) {
      console.error('[Audio] Mic access error:', err)
      setError(err.message)
    }
  }, [onChunk])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setIsRecording(false)
  }, [])

  return { start, stop, isRecording, error }
}

/**
 * Play a base64-encoded MP3 audio buffer.
 * @param {string} base64
 * @returns {Promise<void>}
 */
export async function playBase64Audio(base64) {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'audio/mp3' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    await audio.play()
    audio.onended = () => URL.revokeObjectURL(url)
  } catch (err) {
    console.error('[Audio] Playback error:', err)
  }
}

/**
 * Speak text using the browser's built-in Web Speech Synthesis.
 * Used as fallback when Cartesia TTS is unavailable.
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.rate]  - speaking rate (default 1.1)
 * @param {number} [opts.pitch] - pitch (default 0.85, lower = deeper)
 */
export function speakText(text, { rate = 1.1, pitch = 0.85 } = {}) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate
  utterance.pitch = pitch
  utterance.volume = 1

  // Pick a deep male voice if available
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(v =>
    /daniel|alex|fred|ralph|bruce|albert/i.test(v.name)
  ) || voices.find(v => v.lang === 'en-US' && /male/i.test(v.name))
  if (preferred) utterance.voice = preferred

  window.speechSynthesis.speak(utterance)
}

const OPENING_TEXT =
  "ALRIGHT LADIES AND GENTLEMEN, WELCOME TO DEBATE ROAST — THE ONLY DEBATE WHERE BAD ARGUMENTS GET CALLED OUT IN REAL TIME. I don't care who you are, I don't care what side you're on — you say something stupid, I am ON YOUR CASE immediately. Topic is set. Debaters are ready. Let's go."

/**
 * Play the opening announcement — uses Cartesia audio if provided,
 * otherwise falls back to Web Speech Synthesis.
 * @param {string|null} audioBase64
 */
export async function playOpeningAnnouncement(audioBase64) {
  if (audioBase64) {
    await playBase64Audio(audioBase64)
  } else {
    speakText(OPENING_TEXT, { rate: 1.05, pitch: 0.8 })
  }
}

/**
 * Play roast audio — uses Cartesia audio if provided,
 * otherwise speaks the stop phrase + roast text via Web Speech Synthesis.
 * @param {string|null} audioBase64
 * @param {string} stopPhrase
 * @param {string} roastText
 */
export async function playRoastAudio(audioBase64, stopPhrase, roastText) {
  if (audioBase64) {
    await playBase64Audio(audioBase64)
  } else {
    const text = [stopPhrase, roastText].filter(Boolean).join('. ')
    speakText(text, { rate: 1.15, pitch: 0.8 })
  }
}
