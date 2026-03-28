import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

let sharedSocket = null

function getSocket() {
  if (!sharedSocket || !sharedSocket.connected) {
    sharedSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
  }
  return sharedSocket
}

/**
 * Hook that provides a stable socket reference and auto-registers event handlers.
 *
 * @param {Record<string, function>} handlers - { eventName: handler }
 * @returns {{ socket: Socket, emit: function }}
 */
export function useSocket(handlers = {}) {
  const socket = getSocket()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const eventNames = Object.keys(handlersRef.current)

    const wrappedHandlers = {}
    eventNames.forEach((event) => {
      wrappedHandlers[event] = (...args) => handlersRef.current[event]?.(...args)
      socket.on(event, wrappedHandlers[event])
    })

    return () => {
      eventNames.forEach((event) => {
        socket.off(event, wrappedHandlers[event])
      })
    }
  }, [socket])

  const emit = useCallback((event, ...args) => {
    socket.emit(event, ...args)
  }, [socket])

  return { socket, emit }
}
