import { z } from 'zod'
import { contrato, zDataHora } from '../http'
import { zEmail } from '../limites'

/** Eventos com modelo de e-mail próprio (E04). Chave fixa: não há criação nem exclusão de evento. */
export const EVENTOS_EMAIL = [
  'abertura',
  'comentario',
  'encaminhamento',
  'agendamento',
  'conclusao',
  'rejeicao',
  'solicitacao_retorno',
  'encerramento_automatico',
  'lembrete',
  'recuperar_senha',
] as const
export type EventoEmail = (typeof EVENTOS_EMAIL)[number]

/** Lista fechada de variáveis aceitas em assunto e corpo. Qualquer outra `{{x}}` sai literal. */
export const VARIAVEIS_EMAIL = [
  'numero',
  'assunto',
  'solicitante',
  'area',
  'operador',
  'autor',
  'status',
  'dataAgendamento',
  'link',
  'sistema',
] as const
export type VariavelEmail = (typeof VARIAVEIS_EMAIL)[number]

export const ModeloEmailSchema = z.object({
  evento: z.string(),
  assunto: z.string(),
  corpoTexto: z.string(),
  ativo: z.boolean(),
  atualizadoEm: zDataHora(),
})
export type ModeloEmail = z.output<typeof ModeloEmailSchema>

export const EventoEmailParamsSchema = z.object({
  evento: z.string().min(1).max(60),
})

/** Edição troca o modelo inteiro: todos os campos são obrigatórios. */
export const AtualizarModeloEmailSchema = z.strictObject({
  assunto: z.string().trim().min(1, { error: 'Informe o assunto.' }).max(200, { error: 'Máximo de 200 caracteres.' }),
  corpoTexto: z
    .string()
    .trim()
    .min(1, { error: 'Escreva o corpo do e-mail.' })
    .max(20_000, { error: 'Máximo de 20.000 caracteres.' }),
  ativo: z.boolean(),
})
export type AtualizarModeloEmail = z.output<typeof AtualizarModeloEmailSchema>

export const EnviarTesteEmailSchema = z.strictObject({
  para: zEmail(),
})
export type EnviarTesteEmail = z.output<typeof EnviarTesteEmailSchema>

export const modelosEmailApi = {
  listar: contrato({ metodo: 'GET', caminho: '/modelos-email', resposta: z.array(ModeloEmailSchema) }),
  obter: contrato({
    metodo: 'GET',
    caminho: '/modelos-email/:evento',
    params: EventoEmailParamsSchema,
    resposta: ModeloEmailSchema,
  }),
  atualizar: contrato({
    metodo: 'PUT',
    caminho: '/modelos-email/:evento',
    params: EventoEmailParamsSchema,
    body: AtualizarModeloEmailSchema,
    resposta: ModeloEmailSchema,
  }),
  enviarTeste: contrato({
    metodo: 'POST',
    caminho: '/modelos-email/teste',
    body: EnviarTesteEmailSchema,
    resposta: z.object({ id: z.int() }),
  }),
}
