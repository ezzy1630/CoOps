import { loadConfig } from './config.js'
import { EventStore } from './store.js'
import { Bus } from './bus.js'
import { startHttp } from './http.js'
import type { WorldEvent } from '../../src/types.js'

const cfg = loadConfig()
const bus = new Bus<WorldEvent>()
const store = await EventStore.open(cfg.dataDir, e => bus.publish(e))
await startHttp(cfg, store, bus)
console.log(`LISTENING ${cfg.port}`)
