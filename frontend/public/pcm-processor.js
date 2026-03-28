// AudioWorklet processor — runs on the audio rendering thread.
// Accumulates Float32 samples and converts to Int16 PCM before posting
// to the main thread. Accumulates to TARGET_SAMPLES before each post
// to keep message frequency reasonable without adding latency.

const TARGET_SAMPLES = 4096

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = new Float32Array(TARGET_SAMPLES)
    this._filled = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    let offset = 0
    while (offset < channel.length) {
      const space = TARGET_SAMPLES - this._filled
      const take = Math.min(space, channel.length - offset)
      this._buffer.set(channel.subarray(offset, offset + take), this._filled)
      this._filled += take
      offset += take

      if (this._filled === TARGET_SAMPLES) {
        const int16 = new Int16Array(TARGET_SAMPLES)
        for (let i = 0; i < TARGET_SAMPLES; i++) {
          const s = Math.max(-1, Math.min(1, this._buffer[i]))
          int16[i] = s < 0 ? s * 32768 : s * 32767
        }
        // Transfer the buffer to avoid copying
        this.port.postMessage(int16.buffer, [int16.buffer])
        this._filled = 0
      }
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
