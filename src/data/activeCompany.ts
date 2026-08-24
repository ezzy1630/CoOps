import { getCompany, setCompanyTemplate } from './company.js'
import { everpeak } from './companies/everpeak.js'
import { horse } from './companies/horse.js'

const COMPANIES = { everpeak, horse } as const

/** Selected at build time via VITE_COMPANY; nothing runtime-swappable. */
const selected = import.meta.env.VITE_COMPANY ?? 'everpeak'
setCompanyTemplate(COMPANIES[selected as keyof typeof COMPANIES] ?? everpeak)

/** True once the company template is registered (import-order guard). */
export function activeCompanyReady(): boolean {
  try {
    getCompany()
    return true
  } catch {
    return false
  }
}