import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'

/** Formato IANA (ex.: America/Sao_Paulo, Etc/GMT+3, UTC). O fuso real é conferido pelo Intl. */
const REGEX_IANA = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/

const fusoExiste = (fuso: string): boolean =>
  new Intl.DateTimeFormat(undefined, { timeZone: fuso }).resolvedOptions().timeZone.length > 0

const fusoValido = (fuso: string): boolean => {
  try {
    return fusoExiste(fuso)
  } catch {
    return false
  }
}

export const HorarioJornadaSchema = z
  .strictObject({
    diaSemana: z.int().min(0, 'Use um dia entre 0 (domingo) e 6 (sábado).').max(6, 'Use um dia entre 0 e 6.'),
    inicioMin: z.int().min(0, 'Use um minuto entre 0 e 1439.').max(1439, 'Use um minuto entre 0 e 1439.'),
    fimMin: z.int().min(1, 'Use um minuto entre 1 e 1440.').max(1440, 'Use um minuto entre 1 e 1440.'),
  })
  .refine((h) => h.fimMin > h.inicioMin, { error: 'O fim precisa ser depois do início.', path: ['fimMin'] })

const HorarioRespostaSchema = z.object({ diaSemana: z.int(), inicioMin: z.int(), fimMin: z.int() })

export const JornadaSchema = z.object({
  id: z.int(),
  nome: z.string(),
  timezone: z.string(),
  ininterrupta: z.boolean(),
  ativo: z.boolean(),
  horarios: z.array(HorarioRespostaSchema),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Jornada = z.output<typeof JornadaSchema>

export const CriarJornadaSchema = z
  .strictObject({
    nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(80, 'Use no máximo 80 caracteres.'),
    timezone: z
      .string()
      .trim()
      .max(64, 'Use no máximo 64 caracteres.')
      .regex(REGEX_IANA, 'Use um fuso IANA, como America/Sao_Paulo.')
      .refine(fusoValido, 'Fuso horário desconhecido.'),
    ininterrupta: z.boolean(),
    ativo: z.boolean(),
    horarios: z.array(HorarioJornadaSchema).max(28, 'Use no máximo 28 horários.'),
  })
  .superRefine((d, ctx) => {
    if (!d.ininterrupta && d.horarios.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe ao menos um horário ou marque como ininterrupta.',
        path: ['horarios'],
      })
    }
    const ordenados = [...d.horarios].sort((a, b) => a.diaSemana - b.diaSemana || a.inicioMin - b.inicioMin)
    for (let i = 1; i < ordenados.length; i++) {
      const anterior = ordenados[i - 1]
      const atual = ordenados[i]
      if (anterior && atual && atual.diaSemana === anterior.diaSemana && atual.inicioMin < anterior.fimMin) {
        ctx.addIssue({ code: 'custom', message: 'Há horários sobrepostos no mesmo dia.', path: ['horarios'] })
        return
      }
    }
  })
export type CriarJornada = z.output<typeof CriarJornadaSchema>

/** Edição troca a jornada inteira (horários incluídos): todos os campos são obrigatórios. */
export const AtualizarJornadaSchema = CriarJornadaSchema
export type AtualizarJornada = z.output<typeof AtualizarJornadaSchema>

export const ListarJornadasQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
})
export type ListarJornadasQuery = z.output<typeof ListarJornadasQuerySchema>

export const jornadasApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/jornadas',
    query: ListarJornadasQuerySchema,
    resposta: paginaDe(JornadaSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/jornadas/:id', params: IdParamsSchema, resposta: JornadaSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/jornadas',
    body: CriarJornadaSchema,
    resposta: JornadaSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PUT',
    caminho: '/jornadas/:id',
    params: IdParamsSchema,
    body: AtualizarJornadaSchema,
    resposta: JornadaSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/jornadas/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
