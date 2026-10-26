import { z } from 'zod'
import { NOTAS_AVALIACAO } from './enums'

const CAMPOS = {
  'sistema.nome': z.string().trim().min(2).max(60),
  'sistema.organizacao': z.string().trim().min(2).max(120),
  'sistema.fusoHorario': z.string().regex(/^[A-Za-z_]+\/[A-Za-z_/]+$/),
  'sessao.horasAbsoluta': z.int().min(1).max(72),
  'sessao.minutosInatividade': z.int().min(15).max(480),
  'anexos.habilitados': z.boolean(),
  'anexos.tamanhoMaxMb': z.int().min(1).max(25),
  'anexos.maxPorEnvio': z.int().min(1).max(5),
  'sla.jornadaPadraoId': z.int().positive().nullable(),
  'sla.alertaPct': z.int().min(50).max(95),
  'chamado.primeiraRespostaAoEncaminhar': z.enum(['SEMPRE', 'NUNCA', 'ESCOLHA']),
  'chamado.prazoValidacaoDias': z.int().min(0).max(30),
  'chamado.prazoValidacaoDiasUteis': z.boolean(),
  'chamado.avaliacaoAutomatica': z.enum(NOTAS_AVALIACAO),
  'chamado.permitirReabertura': z.boolean(),
  'chamado.prazoReaberturaDias': z.int().min(0).max(365),
  'chamado.isolarAreas': z.boolean(),
  'inatividade.statusIds': z.array(z.int().positive()).max(50),
  'inatividade.dias': z.int().min(1).max(365),
  'inatividade.diasUteis': z.boolean(),
  'inatividade.statusRetornoId': z.int().positive().nullable(),
  'inatividade.avaliacao': z.enum(NOTAS_AVALIACAO),
  'notificacoes.retencaoDias': z.int().min(30).max(365),
  'email.habilitado': z.boolean(),
}

export const ConfigSchema = z.object(CAMPOS)
export type Config = z.output<typeof ConfigSchema>
export type ChaveConfig = keyof Config

export const CONFIG_PADRAO: Config = {
  'sistema.nome': 'Vinimon',
  'sistema.organizacao': 'Minha Empresa',
  'sistema.fusoHorario': 'America/Sao_Paulo',
  'sessao.horasAbsoluta': 12,
  'sessao.minutosInatividade': 60,
  'anexos.habilitados': true,
  'anexos.tamanhoMaxMb': 10,
  'anexos.maxPorEnvio': 5,
  'sla.jornadaPadraoId': null,
  'sla.alertaPct': 80,
  'chamado.primeiraRespostaAoEncaminhar': 'ESCOLHA',
  'chamado.prazoValidacaoDias': 3,
  'chamado.prazoValidacaoDiasUteis': true,
  'chamado.avaliacaoAutomatica': 'OTIMO',
  'chamado.permitirReabertura': true,
  'chamado.prazoReaberturaDias': 0,
  'chamado.isolarAreas': true,
  'inatividade.statusIds': [],
  'inatividade.dias': 7,
  'inatividade.diasUteis': false,
  'inatividade.statusRetornoId': null,
  'inatividade.avaliacao': 'OTIMO',
  'notificacoes.retencaoDias': 180,
  'email.habilitado': false,
}

/** PATCH /config: só as chaves enviadas; chave desconhecida = 400. */
export const AtualizarConfigSchema = z.strictObject(CAMPOS).partial()

export const CHAVES_CONFIG_PUBLICAS = [
  'sistema.nome',
  'sistema.organizacao',
  'anexos.habilitados',
  'anexos.tamanhoMaxMb',
  'anexos.maxPorEnvio',
  'chamado.permitirReabertura',
  'chamado.prazoReaberturaDias',
  'chamado.primeiraRespostaAoEncaminhar',
] as const satisfies readonly ChaveConfig[]
