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
