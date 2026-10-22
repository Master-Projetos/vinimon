import type { z } from 'zod'
import { AtualizarConfigSchema, ConfigSchema } from '../config'
import { contrato } from '../http'

export type AtualizarConfig = z.output<typeof AtualizarConfigSchema>

export const configApi = {
  obter: contrato({ metodo: 'GET', caminho: '/config', resposta: ConfigSchema }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/config',
    body: AtualizarConfigSchema,
    resposta: ConfigSchema,
  }),
}
