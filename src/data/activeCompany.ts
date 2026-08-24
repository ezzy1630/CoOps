import { getCompany, setCompanyTemplate } from './company.js'
import { everpeak } from './companies/everpeak.js'

setCompanyTemplate(everpeak)

/** True once the company template is registered (import-order guard). */
export function activeCompanyReady(): boolean {
  try {
    getCompany()
    return true
  } catch {
    return false
  }
}