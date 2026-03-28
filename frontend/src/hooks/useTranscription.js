import { useRef, useCallback, useState } from 'react'

/**
 * Real-time transcription using the browser's Web Speech API.
 * Works in Chrome, Edge, and Safari — no API key needed.
 *
 * @param {function} onFinal   - called with final transcript string (send to backend)
 * @param {function} onInterim - called with in-progress text (show locally only)
 */
export function useTranscription(onFinal, onInterim) {
  const recognitionRef = useRef(null)
  const shouldListenRef = useRef(false)
  const onFinalRef = useRef(onFinal)
  const onInterimRef = useRef(onInterim)
  onFinalRef.current = onFinal
  onInterimRef.current = onInterim

  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Use Chrome or Edge for speech recognition')
      return
    }

    shouldListenRef.current = true

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          if (text.trim()) onFinalRef.current?.(text.trim())
        } else {
          interim += text
        }
      }
      onInterimRef.current?.(interim)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.error('[Speech] Error:', event.error)
      setError(event.error)
    }

    // Auto-restart — SpeechRecognition stops after silence
    recognition.onend = () => {
      if (shouldListenRef.current) {
        try { recognition.start() } catch (_) {}
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setIsListening(true)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const stop = useCallback(() => {
    shouldListenRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      try { recognitionRef.current.stop() } catch (_) {}
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  return { start, stop, isListening, error }
}
