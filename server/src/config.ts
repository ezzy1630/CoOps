import { resolve } from 'node:path'

export interface Config {
  port: number
  dataDir: string
  allowDevEmit: boolean
  /** Optional so existing Config literals (spine.test.ts) stay valid. */
  enableA2a?: boolean
  geminiApiKey?: string
  firestore?: { projectId?: string }
  modelArmor?: { project: string; location: string; templateId: string }
}

export function loadConfig(): Config {
  const portEnv = Number.parseInt(process.env.PORT ?? '', 10)
  const project = process.env.COOPS_FIRESTORE_PROJECT
  const maProject = process.env.COOPS_MODELARMOR_PROJECT
  const maLocation = process.env.COOPS_MODELARMOR_LOCATION
  const maTemplate = process.env.COOPS_MODELARMOR_TEMPLATE
  return {
    port: Number.isNaN(portEnv) ? 8080 : portEnv,
    dataDir: process.env.COOPS_DATA_DIR ?? resolve('server/data'),
    allowDevEmit: process.env.COOPS_ALLOW_DEV_EMIT === '1',
    enableA2a: process.env.COOPS_ENABLE_A2A === '1',
    geminiApiKey: process.env.GEMINI_API_KEY,
    ...(project ? { firestore: { projectId: project } } : {}),
    ...(maProject && maLocation && maTemplate
      ? { modelArmor: { project: maProject, location: maLocation, templateId: maTemplate } }
      : {}),
  }
}
