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
export function speakText(text, { rate = 1.25, pitch = 0.5 } = {}) {
  if (!window.speechSynthesis || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = rate   // fast and snappy
  utterance.pitch = pitch // low and aggressive
  utterance.volume = 1

  // Load voices — some browsers need a short wait
  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices()
    // Prefer deep/authoritative English male voices
    const preferred =
      voices.find(v => /google uk english male/i.test(v.name)) ||
      voices.find(v => /daniel|alex|fred|ralph|bruce|albert|arthur/i.test(v.name)) ||
      voices.find(v => v.lang === 'en-GB') ||
      voices.find(v => v.lang === 'en-US')
    if (preferred) utterance.voice = preferred
    window.speechSynthesis.speak(utterance)
  }

  if (window.speechSynthesis.getVoices().length > 0) {
    setVoice()
  } else {
    window.speechSynthesis.onvoiceschanged = setVoice
  }
}

const OPENING_TEXTS = {
  easy: "Welcome everyone to DebateRoast. This is a space for respectful, thoughtful debate. I'll be listening carefully, and if I spot a logical error or a particularly strong argument, I'll let you know. Good luck to both of you.",
  intermediate: "Alright, welcome to DebateRoast. I'll be watching both of you closely. If you make a bad argument, I will call it out. Make a good one, and I'll give credit. No excuses, no hand-holding. Let's debate.",
  savage: "ALRIGHT LADIES AND GENTLEMEN, WELCOME TO DEBATEROAST — THE ONLY DEBATE WHERE BULLSHIT GETS CALLED OUT IN REAL TIME. I don't give a fuck who you are, I don't give a fuck what side you're on — you say something stupid, I am ON THAT ASS like white on rice. Topic is set. Debaters are ready. LET'S FUCKING DO THIS.",
}

/**
 * Play the opening announcement — uses Cartesia audio if provided,
 * otherwise falls back to Web Speech Synthesis.
 * @param {string|null} audioBase64
 * @param {string} [roastLevel='savage']
 */
export async function playOpeningAnnouncement(audioBase64, roastLevel = 'savage') {
  if (audioBase64) {
    await playBase64Audio(audioBase64)
  } else {
    const text = OPENING_TEXTS[roastLevel] || OPENING_TEXTS.savage
    const rate = roastLevel === 'easy' ? 0.95 : roastLevel === 'intermediate' ? 1.0 : 1.05
    const pitch = roastLevel === 'easy' ? 1.1 : roastLevel === 'intermediate' ? 0.9 : 0.8
    speakText(text, { rate, pitch })
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
    speakText(text, { rate: 1.3, pitch: 0.45 })
  }
}
