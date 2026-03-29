import axios from 'axios'

// Cartesia voice — use the most aggressive available voice
// "en" voices: try "bf0a246a-8642-498a-9950-80c35e9276b5" (strong male)
// or "a0e99841-438c-4a64-b679-ae501e7d6091" (angry female)
// Fallback to a known working voice if these don't exist in your account
const VOICE_ID = process.env.CARTESIA_VOICE_ID || '3d5ce2fb-e56c-42f0-9ed9-4662484063b4'
const CARTESIA_VERSION = '2024-06-10'

/**
 * Generate TTS audio via Cartesia.
 * Returns a Buffer of raw audio bytes (mp3).
 *
 * @param {string} text           - text to speak
 * @param {object} [opts]
 * @param {number} [opts.speed]   - speaking speed (-1.0 to 1.0, default 0)
 * @returns {Promise<Buffer>}
 */
export async function generateSpeech(text, { speed = 0 } = {}) {
  try {
    const response = await axios.post(
      'https://api.cartesia.ai/tts/bytes',
      {
        model_id: 'sonic-english',
        transcript: text,
        voice: {
          mode: 'id',
          id: VOICE_ID,
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 44100,
        },
        language: 'en',
        _experimental_voice_controls: {
          speed: speed > 0 ? 'fastest' : speed < -0.5 ? 'slow' : 'normal',
          emotion: ['anger:high', 'positivity:low'],
        },
      },
      {
        headers: {
          'X-API-Key': process.env.CARTESIA_API_KEY,
          'Cartesia-Version': CARTESIA_VERSION,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 15000,
      }
    )

    return Buffer.from(response.data)
  } catch (err) {
    console.error('[Cartesia] TTS error:', err.response?.data?.toString() || err.message)
    return null
  }
}

/**
 * Build the full roast audio: stop phrase (fast) + silence + roast (normal).
 *
 * @param {string} stopPhrase
 * @param {string} roastText
 * @returns {Promise<Buffer|null>}
 */
export async function buildRoastAudio(stopPhrase, roastText) {
  // Generate both in parallel
  const [stopBuffer, roastBuffer] = await Promise.all([
    generateSpeech(stopPhrase, { speed: 1 }),   // fastest
    generateSpeech(roastText, { speed: 0 }),      // normal
  ])

  if (!stopBuffer && !roastBuffer) return null

  // 400ms of silence (mp3 silence is tricky — just concatenate the buffers
  // with a tiny gap; real silence injection needs an encoder. For simplicity
  // we concat — the natural pause between two MP3 segments is sufficient.)
  const parts = []
  if (stopBuffer) parts.push(stopBuffer)
  if (roastBuffer) parts.push(roastBuffer)

  return Buffer.concat(parts)
}

/**
 * Generate the opening announcement audio, tuned to the roast mode.
 * @param {string} [roastMode='intermediate'] - 'easy' | 'intermediate' | 'savage'
 */
export async function generateOpeningAnnouncement(roastMode = 'intermediate') {
  const scripts = {
    easy: "Welcome, everyone, to DebateRoast — where logic and evidence are the only things that matter. I am your AI referee. I do not take sides, I do not play favorites, and I do not let bad reasoning slide. If you make a claim, back it up. If your argument has a flaw, I will point it out — clearly and directly. The topic is set. The debaters are ready. Let's have a sharp, honest debate. Begin.",
    intermediate: "Alright, welcome to DebateRoast — where weak arguments go to die. I'm your AI referee, and I don't care who you are or what side you're on. Make a shaky claim, I'm calling it out. Use a logical fallacy, I'm all over it. The topic is locked, the debaters are ready — let's see who actually knows what they're talking about. Let's go.",
    savage: "ALRIGHT LADIES AND GENTLEMEN WELCOME TO DEBATE ROAST — THE ONLY DEBATE WHERE BULLSHIT GETS CALLED OUT IN REAL TIME. I don't give a fuck who you are, I don't give a fuck what side you're on — you say something stupid, I am ON THAT ASS like white on rice. Topic is set. Debaters are ready. I want a clean fight. LET'S FUCKING DO THIS.",
  }

  const text = scripts[roastMode] ?? scripts.intermediate
  return generateSpeech(text, { speed: 0.5 })
}
