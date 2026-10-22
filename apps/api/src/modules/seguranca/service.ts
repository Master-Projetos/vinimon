import type { FastifyBaseLogger } from 'fastify'

const MAX_CAMPO = 200

const curto = (v: unknown): string | undefined => (typeof v === 'string' ? v.slice(0, MAX_CAMPO) : undefined)
/** Tira querystring e fragmento: URLs de violação podem carregar tokens. */
const semQuery = (v: unknown): string | undefined => curto(v)?.split(/[?#]/)[0]

/** Reduz o relatório do navegador a poucos campos seguros (S75). Aceita `csp-report` e Reporting API. */
export function resumirRelatorio(corpo: unknown): Record<string, string | undefined>[] {
  const itens = Array.isArray(corpo) ? corpo : [corpo]
  return itens.slice(0, 5).map((item) => {
    const bruto = (item as { 'csp-report'?: unknown; body?: unknown } | null) ?? {}
    const r = (bruto['csp-report'] ?? bruto.body ?? bruto) as Record<string, unknown>
    return {
      diretiva: curto(r['violated-directive'] ?? r.effectiveDirective),
      bloqueado: semQuery(r['blocked-uri'] ?? r.blockedURL),
      documento: semQuery(r['document-uri'] ?? r.documentURL),
      origem: semQuery(r['source-file'] ?? r.sourceFile),
      linha: curto(String(r['line-number'] ?? r.lineNumber ?? '')),
    }
  })
}

export function registrarViolacaoCsp(log: FastifyBaseLogger, corpo: unknown): void {
  log.warn({ csp: resumirRelatorio(corpo) }, 'violação CSP')
}
