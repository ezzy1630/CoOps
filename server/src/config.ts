import { resolve } from 'node:path'

export interface Config {
  port: number
  dataDir: string
  allowDevEmit: boolean
  geminiApiKey?: string
}

export function loadConfig(): Config {
  const portEnv = Number.parseInt(process.env.PORT ?? '', 10)
  return {
    port: Number.isNaN(portEnv) ? 8080 : portEnv,
    dataDir: process.env.COOPS_DATA_DIR ?? resolve('server/data'),
    allowDevEmit: process.env.COOPS_ALLOW_DEV_EMIT === '1',
    geminiApiKey: process.env.GEMINI_API_KEY,
  }
}
