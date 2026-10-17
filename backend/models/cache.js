// Caches promises so concurrent identical requests share one slow query on the 7M-row trips table.
const store = new Map()
const TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 200

function cached(key, load) {
    const hit = store.get(key)
    if (hit && hit.expires > Date.now()) return hit.value

    const value = load().catch(error => {
        store.delete(key)
        throw error
    })

    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value)
    store.set(key, {value, expires: Date.now() + TTL_MS})
    return value
}

module.exports = {cached}
