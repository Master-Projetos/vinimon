import { z } from 'zod'
import { PERFIS, TIPOS_STATUS } from '../enums'
import { contrato } from '../http'

/** 2 a 100 caracteres, ou um número de chamado (`123` ou `#123`), que pode ter um só dígito. */
export const BuscaQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .max(100, 'Use no máximo 100 caracteres.')
    .refine((v) => v.length >= 2 || /^#?\d+$/.test(v), 'Informe ao menos 2 caracteres.'),
  limite: z.coerce.number().pipe(z.int().min(1).max(5)).default(5),
})
export type BuscaQuery = z.output<typeof BuscaQuerySchema>

export const BuscaChamadoSchema = z.strictObject({
  id: z.int(),
  assunto: z.string(),
  statusNome: z.string(),
  statusTipo: z.enum(TIPOS_STATUS),
})
export const BuscaArtigoSchema = z.strictObject({ id: z.int(), titulo: z.string(), resumo: z.string().nullable() })
export const BuscaAtivoSchema = z.strictObject({ id: z.int(), etiqueta: z.string(), modelo: z.string().nullable() })
export const BuscaUsuarioSchema = z.strictObject({ id: z.int(), nome: z.string(), perfil: z.enum(PERFIS) })

export const BuscaRespostaSchema = z.strictObject({
  chamados: z.array(BuscaChamadoSchema),
  artigos: z.array(BuscaArtigoSchema),
  ativos: z.array(BuscaAtivoSchema),
  usuarios: z.array(BuscaUsuarioSchema),
})
export type BuscaResposta = z.output<typeof BuscaRespostaSchema>

export const buscaApi = {
  buscar: contrato({ metodo: 'GET', caminho: '/busca', query: BuscaQuerySchema, resposta: BuscaRespostaSchema }),
}
