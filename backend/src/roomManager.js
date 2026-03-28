import Redis from 'ioredis'

let redis = null

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })
  }
  return redis
}

const ROOM_TTL = 60 * 60 * 4 // 4 hours

// ── Room structure stored in Redis ────────────────────────────────────────────
// room:{roomId}           → JSON RoomState
// room:{roomId}:exchanges → Redis list of last N exchanges (capped)
// room:{roomId}:roasts    → Redis list of all roast records

const MAX_EXCHANGES = 5

export async function createRoom({ roomId, topic, debater1, debater2 }) {
  const r = getRedis()
  const room = {
    roomId,
    topic,
    debaters: [debater1, debater2],
    scores: { [debater1]: 0, [debater2]: 0 },
    fallacyTypes: { [debater1]: {}, [debater2]: {} },
    status: 'waiting', // waiting | active | ended
    createdAt: Date.now(),
  }
  await r.set(`room:${roomId}`, JSON.stringify(room), 'EX', ROOM_TTL)
  return room
}

export async function getRoom(roomId) {
  const r = getRedis()
  const raw = await r.get(`room:${roomId}`)
  if (!raw) return null
  return JSON.parse(raw)
}

export async function updateRoomStatus(roomId, status) {
  const r = getRedis()
  const room = await getRoom(roomId)
  if (!room) return null
  room.status = status
  await r.set(`room:${roomId}`, JSON.stringify(room), 'EX', ROOM_TTL)
  return room
}

export async function incrementScore(roomId, debaterName) {
  const r = getRedis()
  const room = await getRoom(roomId)
  if (!room) return null
  room.scores[debaterName] = (room.scores[debaterName] || 0) + 1
  await r.set(`room:${roomId}`, JSON.stringify(room), 'EX', ROOM_TTL)
  return room.scores
}

export async function recordFallacyType(roomId, debaterName, fallacyName) {
  const r = getRedis()
  const room = await getRoom(roomId)
  if (!room) return
  if (!room.fallacyTypes[debaterName]) room.fallacyTypes[debaterName] = {}
  room.fallacyTypes[debaterName][fallacyName] =
    (room.fallacyTypes[debaterName][fallacyName] || 0) + 1
  await r.set(`room:${roomId}`, JSON.stringify(room), 'EX', ROOM_TTL)
}

export async function pushExchange(roomId, speaker, text) {
  const r = getRedis()
  const key = `room:${roomId}:exchanges`
  const entry = JSON.stringify({ speaker, text, ts: Date.now() })
  await r.rpush(key, entry)
  await r.ltrim(key, -MAX_EXCHANGES, -1)
  await r.expire(key, ROOM_TTL)
}

export async function getExchanges(roomId) {
  const r = getRedis()
  const key = `room:${roomId}:exchanges`
  const items = await r.lrange(key, 0, -1)
  return items.map((i) => JSON.parse(i))
}

export async function recordRoast(roomId, roastRecord) {
  const r = getRedis()
  const key = `room:${roomId}:roasts`
  await r.rpush(key, JSON.stringify(roastRecord))
  await r.expire(key, ROOM_TTL)
}

export async function getRoasts(roomId) {
  const r = getRedis()
  const key = `room:${roomId}:roasts`
  const items = await r.lrange(key, 0, -1)
  return items.map((i) => JSON.parse(i))
}

export async function deleteRoom(roomId) {
  const r = getRedis()
  await r.del(`room:${roomId}`, `room:${roomId}:exchanges`, `room:${roomId}:roasts`)
}
