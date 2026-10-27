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
  /** Com false, o operador não atende o chamado em que ele mesmo é o solicitante (A19). */
  'chamado.operadorTrataProprio': z.boolean(),
  /** Com true, USUARIO pode abrir chamado em nome de alguém do mesmo departamento (B03). */
  'chamado.usuarioAbreParaOutros': z.boolean(),
  'inatividade.statusIds': z.array(z.int().positive()).max(50),
  'inatividade.dias': z.int().min(1).max(365),
  'inatividade.diasUteis': z.boolean(),
  'inatividade.statusRetornoId': z.int().positive().nullable(),
  'inatividade.avaliacao': z.enum(NOTAS_AVALIACAO),
  'notificacoes.retencaoDias': z.int().min(30).max(365),
  'email.habilitado': z.boolean(),
  /** Auto-cadastro (A14, T-19.3): desligado, o POST /publico/cadastro não faz nada. */
  'cadastro.habilitado': z.boolean(),
  /** Domínios de e-mail aceitos no auto-cadastro (ex.: empresa.com.br). Fora da lista, a solicitação é ignorada. */
  'cadastro.dominiosPermitidos': z.array(z.string().trim().toLowerCase().min(3).max(253)).max(50),
  /** Nomes dos três grupos de categoria exibidos na abertura (B07). */
  'abertura.rotulosCategorias': z.tuple([
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
    z.string().trim().min(1).max(40),
  ]),
  /** Grupos (1–3) que filtram a escolha do tipo de problema na abertura. */
  'abertura.preFiltros': z
    .array(z.int().min(1).max(3))
    .max(3)
    .refine((g) => new Set(g).size === g.length, 'Não repita grupos.'),
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
  'chamado.operadorTrataProprio': true,
  'chamado.usuarioAbreParaOutros': false,
  'inatividade.statusIds': [],
  'inatividade.dias': 7,
  'inatividade.diasUteis': false,
  'inatividade.statusRetornoId': null,
  'inatividade.avaliacao': 'OTIMO',
  'notificacoes.retencaoDias': 180,
  'email.habilitado': false,
  'cadastro.habilitado': false,
  'cadastro.dominiosPermitidos': [],
  'abertura.rotulosCategorias': ['Categoria 1', 'Categoria 2', 'Categoria 3'],
  'abertura.preFiltros': [],
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
  'abertura.rotulosCategorias',
  'abertura.preFiltros',
] as const satisfies readonly ChaveConfig[]
