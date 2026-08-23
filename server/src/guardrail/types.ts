export interface GuardrailVerdict { blocked: boolean; category?: string }
export interface GuardrailAdapter {
  /** Human-readable engine identity used in telemetry/event titles. */
  readonly name: string
  inspect(text: string): GuardrailVerdict | Promise<GuardrailVerdict>
}
