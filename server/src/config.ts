import { hostname } from 'node:os'
import { resolve } from 'node:path'
import type { GoogleOAuthConfig } from './auth/google.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash'

export interface Config {
  port: number
  dataDir: string
  allowDevEmit: boolean
  /** Optional so existing Config literals (spine.test.ts) stay valid. */
  enableA2a?: boolean
  brainMode?: 'mock' | 'gemini' | 'auto'
  geminiApiKey?: string
  geminiModel?: string
  firestore?: { projectId?: string }
  modelArmor?: { project: string; location: string; templateId: string }
  googleOAuth?: GoogleOAuthConfig
  sheetsId?: string
  a2aToken?: string
  a2aPrincipal?: string
  /** the launch pipeline: allow-listed discovery roots and its Cloud Storage bucket */
  launch?: { localRoots: string[]; connectorId: string; bucket?: string; query: string }
}

export function loadConfig(): Config {
  const portEnv = Number.parseInt(process.env.PORT ?? '', 10)
  const project = process.env.COOPS_FIRESTORE_PROJECT
  const maProject = process.env.COOPS_MODELARMOR_PROJECT
  const maLocation = process.env.COOPS_MODELARMOR_LOCATION
  const maTemplate = process.env.COOPS_MODELARMOR_TEMPLATE
  const brainEnv = process.env.COOPS_BRAIN?.toLowerCase()
  const brainMode =
    brainEnv === 'mock' || brainEnv === 'gemini' || brainEnv === 'auto' ? brainEnv : undefined
  return {
    port: Number.isNaN(portEnv) ? 8080 : portEnv,
    dataDir: process.env.COOPS_DATA_DIR ?? resolve('data'),
    allowDevEmit: process.env.COOPS_ALLOW_DEV_EMIT === '1',
    enableA2a: process.env.COOPS_ENABLE_A2A === '1',
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.COOPS_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    ...(project ? { firestore: { projectId: project } } : {}),
    brainMode,
    ...(maProject && maLocation && maTemplate
      ? { modelArmor: { project: maProject, location: maLocation, templateId: maTemplate } }
      : {}),
    googleOAuth: googleOAuthFromEnv(),
    sheetsId: process.env.COOPS_SHEETS_ID,
    a2aToken: process.env.COOPS_A2A_TOKEN,
    a2aPrincipal: process.env.COOPS_A2A_PRINCIPAL,
    launch: launchFromEnv(),
  }
}

/** Discovery reads nothing outside COOPS_LOCAL_ROOTS, so an unset value is a closed door. */
function launchFromEnv(): { localRoots: string[]; connectorId: string; bucket?: string; query: string } {
  const roots = (process.env.COOPS_LOCAL_ROOTS ?? '')
    .split(/[:,]/)
    .map(root => root.trim())
    .filter(Boolean)
    .map(root => resolve(root))
  return {
    localRoots: roots,
    connectorId: process.env.COOPS_CONNECTOR_ID ?? `${hostname()} (CoOps connector)`,
    bucket: process.env.COOPS_GCS_BUCKET,
    // the terms the preflight searches for; the demo's own query comes from the model
    query: process.env.COOPS_PREFLIGHT_QUERY?.trim() || 'horse',
  }
}

function googleOAuthFromEnv(): GoogleOAuthConfig | undefined {
  const clientId = process.env.COOPS_GOOGLE_CLIENT_ID
  const clientSecret = process.env.COOPS_GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.COOPS_GOOGLE_REDIRECT_URI
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : undefined
}
