// In-memory store (replaces Redis for local dev — no Redis install required)
const rooms = new Map()       // roomId → RoomState
const exchanges = new Map()   // roomId → exchange[]
const roasts = new Map()      // roomId → roastRecord[]

const MAX_EXCHANGES = 5

export async function createRoom({ roomId, topic, debater1, debater2 }) {
  const room = {
    roomId,
    topic,
    debaters: [debater1, debater2],
    scores: { [debater1]: 0, [debater2]: 0 },
    fallacyTypes: { [debater1]: {}, [debater2]: {} },
    status: 'waiting',
    createdAt: Date.now(),
  }
  rooms.set(roomId, room)
  exchanges.set(roomId, [])
  roasts.set(roomId, [])
  return room
}

export async function getRoom(roomId) {
  return rooms.get(roomId) ?? null
}

export async function updateRoomStatus(roomId, status) {
  const room = rooms.get(roomId)
  if (!room) return null
  room.status = status
  return room
}

export async function incrementScore(roomId, debaterName) {
  const room = rooms.get(roomId)
  if (!room) return null
  room.scores[debaterName] = (room.scores[debaterName] || 0) + 1
  return room.scores
}

export async function recordFallacyType(roomId, debaterName, fallacyName) {
  const room = rooms.get(roomId)
  if (!room) return
  if (!room.fallacyTypes[debaterName]) room.fallacyTypes[debaterName] = {}
  room.fallacyTypes[debaterName][fallacyName] =
    (room.fallacyTypes[debaterName][fallacyName] || 0) + 1
}

export async function pushExchange(roomId, speaker, text) {
  const list = exchanges.get(roomId) ?? []
  list.push({ speaker, text, ts: Date.now() })
  if (list.length > MAX_EXCHANGES) list.splice(0, list.length - MAX_EXCHANGES)
  exchanges.set(roomId, list)
}

export async function getExchanges(roomId) {
  return exchanges.get(roomId) ?? []
}

export async function recordRoast(roomId, roastRecord) {
  const list = roasts.get(roomId) ?? []
  list.push(roastRecord)
  roasts.set(roomId, list)
}

export async function getRoasts(roomId) {
  return roasts.get(roomId) ?? []
}

export async function deleteRoom(roomId) {
  rooms.delete(roomId)
  exchanges.delete(roomId)
  roasts.delete(roomId)
}
