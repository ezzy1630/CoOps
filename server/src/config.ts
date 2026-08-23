import { resolve } from 'node:path'
import type { GoogleOAuthConfig } from './auth/google.js'

export interface Config {
  port: number
  dataDir: string
  allowDevEmit: boolean
  /** Optional so existing Config literals (spine.test.ts) stay valid. */
  enableA2a?: boolean
  geminiApiKey?: string
  googleOAuth?: GoogleOAuthConfig
  sheetsId?: string
}

export function loadConfig(): Config {
  const portEnv = Number.parseInt(process.env.PORT ?? '', 10)
  return {
    port: Number.isNaN(portEnv) ? 8080 : portEnv,
    dataDir: process.env.COOPS_DATA_DIR ?? resolve('server/data'),
    allowDevEmit: process.env.COOPS_ALLOW_DEV_EMIT === '1',
    enableA2a: process.env.COOPS_ENABLE_A2A === '1',
    geminiApiKey: process.env.GEMINI_API_KEY,
    googleOAuth: googleOAuthFromEnv(),
    sheetsId: process.env.COOPS_SHEETS_ID,
  }
}

function googleOAuthFromEnv(): GoogleOAuthConfig | undefined {
  const clientId = process.env.COOPS_GOOGLE_CLIENT_ID
  const clientSecret = process.env.COOPS_GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.COOPS_GOOGLE_REDIRECT_URI
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : undefined
}
