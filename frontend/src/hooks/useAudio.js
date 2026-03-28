import { useRef, useCallback, useState } from 'react'

const SAMPLE_RATE = 16000

/**
 * Hook for capturing 16kHz mono PCM audio and streaming it via a callback.
 * Uses AudioContext + AudioWorkletNode (PCMProcessor) to produce raw Int16 PCM
 * required by AssemblyAI real-time transcription.
 *
 * @param {function} onChunk - called with base64-encoded Int16 PCM chunk
 * @returns {{ start, stop, isRecording, error }}
 */
export function useAudio(onChunk) {
  const audioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const streamRef = useRef(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
        },
        video: false,
      })
      streamRef.current = stream

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = audioContext

      await audioContext.audioWorklet.addModule('/pcm-processor.js')

      const source = audioContext.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
      workletNodeRef.current = workletNode

      workletNode.port.onmessage = (e) => {
        const bytes = new Uint8Array(e.data)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        onChunk(btoa(binary))
      }

      source.connect(workletNode)
      workletNode.connect(audioContext.destination)

      setIsRecording(true)
      setError(null)
    } catch (err) {
      console.error('[Audio] Mic access error:', err)
      setError(err.message)
    }
  }, [onChunk])

  const stop = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
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
