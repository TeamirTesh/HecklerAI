import { useRef, useCallback, useState } from 'react'

const SEGMENT_MS = 2800
const MIME_WAV = 'audio/wav'
/** Skip uploads shorter than ~50ms of audio (noise / empty flushes). */
const MIN_SAMPLES_RATIO = 0.05

function mergeFloatChunks(chunks) {
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Float32Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

function encodeWavPcm(float32Mono, sampleRate) {
  const n = float32Mono.length
  const pcmBytes = n * 2
  const buffer = new ArrayBuffer(44 + pcmBytes)
  const view = new DataView(buffer)
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + pcmBytes, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, pcmBytes, true)

  let o = 44
  for (let i = 0; i < n; i++) {
    let s = float32Mono[i]
    if (!Number.isFinite(s)) s = 0
    s = Math.max(-1, Math.min(1, s))
    const v = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff)
    view.setInt16(o, v, true)
    o += 2
  }
  return new Uint8Array(buffer)
}

/**
 * Hook for capturing microphone audio and streaming it via a callback.
 * Uses PCM → WAV segments (Groq Whisper reliably accepts WAV; Chrome WebM often fails).
 *
 * @param {function} onChunk - called with { chunk: ArrayBuffer (WAV bytes), mimeType }
 * @returns {{ start, stop, isRecording, error }}
 */
export function useAudio(onChunk) {
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const sourceRef = useRef(null)
  const processorRef = useRef(null)
  const gainRef = useRef(null)
  const segmentIntervalRef = useRef(null)
  const startingRef = useRef(false)
  const recordingRef = useRef(false)
  const pcmChunksRef = useRef([])
  const sampleRateRef = useRef(48000)
  const onChunkRef = useRef(onChunk)
  onChunkRef.current = onChunk

  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState(null)

  const flushSegment = useCallback(() => {
    const chunks = pcmChunksRef.current
    if (chunks.length === 0) return
    pcmChunksRef.current = []
    const merged = mergeFloatChunks(chunks)
    const minSamples = sampleRateRef.current * MIN_SAMPLES_RATIO
    if (merged.length < minSamples) return

    const wav = encodeWavPcm(merged, sampleRateRef.current)
    if (wav.length < 12 || wav[0] !== 0x52 || wav[1] !== 0x49 || wav[2] !== 0x46 || wav[3] !== 0x46) {
      console.error('[Audio] encodeWavPcm did not produce RIFF; skipping segment')
      return
    }
    // Detached ArrayBuffer copy so Socket.IO binary attachment is contiguous (not a view on a larger slab).
    const ab = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)
    onChunkRef.current({ chunk: ab, mimeType: MIME_WAV })
  }, [])

  const start = useCallback(async () => {
    if (startingRef.current || audioContextRef.current) return
    startingRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      })
      streamRef.current = stream

      const ctx = new AudioContext()
      await ctx.resume()
      sampleRateRef.current = ctx.sampleRate
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source

      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      pcmChunksRef.current = []

      processor.onaudioprocess = (e) => {
        if (!recordingRef.current) return
        const ch0 = e.inputBuffer.getChannelData(0)
        pcmChunksRef.current.push(new Float32Array(ch0))
      }

      const gain = ctx.createGain()
      gain.gain.value = 0
      gainRef.current = gain

      source.connect(processor)
      processor.connect(gain)
      gain.connect(ctx.destination)

      recordingRef.current = true
      segmentIntervalRef.current = setInterval(flushSegment, SEGMENT_MS)

      setIsRecording(true)
      setError(null)
    } catch (err) {
      console.error('[Audio] Mic access error:', err)
      setError(err.message)
    } finally {
      startingRef.current = false
    }
  }, [flushSegment])

  const stop = useCallback(() => {
    recordingRef.current = false
    if (segmentIntervalRef.current) {
      clearInterval(segmentIntervalRef.current)
      segmentIntervalRef.current = null
    }
    flushSegment()

    const processor = processorRef.current
    const gain = gainRef.current
    const source = sourceRef.current
    const ctx = audioContextRef.current

    if (processor) {
      processor.disconnect()
      processorRef.current = null
    }
    if (gain) {
      gain.disconnect()
      gainRef.current = null
    }
    if (source) {
      source.disconnect()
      sourceRef.current = null
    }
    if (ctx) {
      ctx.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    pcmChunksRef.current = []
    setIsRecording(false)
  }, [flushSegment])

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
