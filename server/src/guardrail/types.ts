export interface GuardrailVerdict { blocked: boolean; category?: string }
export interface GuardrailAdapter { inspect(text: string): GuardrailVerdict }
