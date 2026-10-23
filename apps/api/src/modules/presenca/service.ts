import type { DefinirPresenca, PresencaPropria } from '@vinimon/shared'
import { ErroApp } from '../../lib/erros'
import { presencaService } from '../../realtime/presenca'

/** `PUT /me/presenca`: o serviço vive no plugin de tempo real (memória do processo, §3.7). */
export async function definirPresencaManual(usuarioId: number, dados: DefinirPresenca): Promise<PresencaPropria> {
  const servico = presencaService()
  if (!servico) throw new ErroApp(503, 'INDISPONIVEL', 'O serviço de presença não está disponível.')
  const p = await servico.definirManual(usuarioId, dados.estado, dados.ate === null ? null : new Date(dados.ate))
  return { estado: p.estado, manual: p.manual, ate: p.ate }
}
