import { randomUUID } from 'node:crypto'
import { OAuth2Client } from 'google-auth-library'

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface GoogleIdentity {
  sub: string
  email: string
  scopes: string[]
  accessTokenPresent: boolean
}

export interface GoogleOAuth {
  enabled: boolean
  authorizeUrl(state: string): string
  exchange(code: string): Promise<GoogleIdentity>
  issue(): string
  consume(state: string): string | null
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
]
const STATE_TTL_MS = 10 * 60 * 1000

export function createGoogleOAuth(cfg?: GoogleOAuthConfig): GoogleOAuth {
  if (!cfg) return disabledGoogleOAuth()
  const { clientId, clientSecret, redirectUri } = cfg

  const client = new OAuth2Client({ clientId, clientSecret, redirectUri })
  const pendingStates = new Map<string, number>()

  function sweepExpiredStates(): void {
    const now = Date.now()
    for (const [state, issuedAt] of pendingStates) {
      if (now - issuedAt > STATE_TTL_MS) pendingStates.delete(state)
    }
  }

  return {
    enabled: true,
    authorizeUrl(state: string): string {
      const url = new URL(AUTH_ENDPOINT)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', SCOPES.join(' '))
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('state', state)
      return url.toString()
    },
    async exchange(code: string): Promise<GoogleIdentity> {
      const { tokens } = await client.getToken(code)
      const idToken = tokens.id_token
      if (!idToken) throw new Error('missing id_token')
      const ticket = await client.verifyIdToken({ idToken })
      const payload = ticket.getPayload()
      if (!payload?.sub || !payload.email) throw new Error('unverified identity')
      return {
        sub: payload.sub,
        email: payload.email,
        scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [],
        accessTokenPresent: typeof tokens.access_token === 'string' && tokens.access_token.length > 0,
      }
    },
    issue(): string {
      sweepExpiredStates()
      const state = randomUUID()
      pendingStates.set(state, Date.now())
      return state
    },
    consume(state: string): string | null {
      const issuedAt = pendingStates.get(state)
      pendingStates.delete(state)
      if (issuedAt === undefined || Date.now() - issuedAt > STATE_TTL_MS) return null
      return state
    },
  }
}

function disabledGoogleOAuth(): GoogleOAuth {
  const unavailable = (): never => {
    throw new Error('google oauth is not configured')
  }
  return {
    enabled: false,
    authorizeUrl: unavailable,
    exchange: unavailable,
    issue: unavailable,
    consume: unavailable,
  }
}
