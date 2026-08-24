import type { ModelArmorClient as ModelArmorClientType, protos } from '@google-cloud/modelarmor'
import type { GuardrailAdapter } from './types.js'

export interface ModelArmorOptions { project: string; location: string; templateId: string }

type FilterResult = protos.google.cloud.modelarmor.v1.IFilterResult

function filterMatched(result: FilterResult | null | undefined): boolean {
  const inspected = [
    result?.raiFilterResult,
    result?.sdpFilterResult?.inspectResult,
    result?.piAndJailbreakFilterResult,
    result?.maliciousUriFilterResult,
    result?.csamFilterFilterResult,
  ]
  return inspected.some((r) => r?.matchState === 'MATCH_FOUND')
}

export function createModelArmorGuardrail(opts: ModelArmorOptions): GuardrailAdapter {
  let clientPromise: Promise<ModelArmorClientType> | null = null

  const getClient = (): Promise<ModelArmorClientType> => {
    if (!clientPromise) {
      clientPromise = (async () => {
        const { ModelArmorClient } = await import('@google-cloud/modelarmor')
        return new ModelArmorClient()
      })().catch(err => {
        clientPromise = null
        throw err
      })
    }
    return clientPromise
  }

  return {
    name: 'Model Armor',
    async inspect(text) {
      if (!text.trim()) return { blocked: false }
      const client = await getClient()
      const templateName = client.templatePath(opts.project, opts.location, opts.templateId)
      const [response] = await client.sanitizeUserPrompt({
        name: templateName,
        userPromptData: { text },
      })
      for (const [filterName, result] of Object.entries(response.sanitizationResult?.filterResults ?? {})) {
        if (filterMatched(result)) return { blocked: true, category: filterName }
      }
      return { blocked: false }
    },
  }
}
