import { enviarEmail } from '../lib/email'

/** Job `email-enviar` com `{id}`: envia um e-mail da outbox. Repetir é seguro (só envia se PENDENTE). */
export async function executarEnvioEmail(dados: Record<string, unknown>): Promise<void> {
  const id = dados.id
  if (typeof id !== 'number' || !Number.isInteger(id)) return
  await enviarEmail(id)
}
