import { resolve } from 'node:path'

export interface Config {
  port: number
  dataDir: string
  allowDevEmit: boolean
  /** Optional so existing Config literals (spine.test.ts) stay valid. */
  enableA2a?: boolean
  geminiApiKey?: string
  a2aToken?: string
  a2aPrincipal?: string
}

export function loadConfig(): Config {
  const portEnv = Number.parseInt(process.env.PORT ?? '', 10)
  return {
    port: Number.isNaN(portEnv) ? 8080 : portEnv,
    dataDir: process.env.COOPS_DATA_DIR ?? resolve('server/data'),
    allowDevEmit: process.env.COOPS_ALLOW_DEV_EMIT === '1',
    enableA2a: process.env.COOPS_ENABLE_A2A === '1',
    geminiApiKey: process.env.GEMINI_API_KEY,
    a2aToken: process.env.COOPS_A2A_TOKEN,
    a2aPrincipal: process.env.COOPS_A2A_PRINCIPAL,
  }
}
