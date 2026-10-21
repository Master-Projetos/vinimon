> Relatório do especialista, copiado literalmente (referência). Em conflito vale a Parte A (`docs/plano/fundamentos/`), depois a Parte B (`docs/plano/tarefas/`), depois este relatório.

# Desenho: recursos estilo Teams no Vinimon (tempo real, presença, menções, feed, Ctrl+K, notificações desktop)

## 0. Resumo das decisões

| Tema | Decisão |
|---|---|
| Integração Socket.IO | Plugin próprio (`fastify-plugin`) que liga o `socket.io` 4.8.x ao `app.server`. **Não** usar `fastify-socket.io`: a 5.1.0 é de 2024-08 e exige `fastify: 4.x` como peerDependency (conferido com `npm view`). |
| Escrita persistente | **Toda escrita persistente passa pelo REST** (comentário, edição, remoção, leitura, status manual de presença, seguir). O socket só carrega sinais efêmeros (entrar/sair de sala, digitando, atividade, assinatura de presença) e o push do servidor. |
| Autorização | Uma regra só, escrita em 4 formas (TS, Prisma where, SQL por usuário, SQL em conjunto). Um teste de equivalência obriga as quatro a darem o mesmo resultado. |
| Privacidade de comentário privado | Existe uma sala separada `chamado:<id>:op`. Conteúdo privado nunca sai da aplicação web: não vai para notificação desktop nem para e-mail. |
| Eventos e notificações | A tabela `eventos_chamado` funciona como *outbox*, gravada na mesma transação da mudança. O fanout roda logo após o commit, com número fixo de queries (corrige o N+1). Uma varredura do pg-boss a cada minuto cobre falhas. |
| Agrupamento | Feito na escrita: `UNIQUE(usuario_id, grupo_chave)` com upsert. Ao marcar como lida, a chave é renomeada (`chave#id`), o que "fecha" o grupo. Assim não dependemos de índice parcial (que no Prisma ainda é *preview*). |
| Presença | Em memória, numa instância única. O status manual e o "visto por último" ficam no banco (`presencas_usuario`). |
| Escala | **v1 = instância única**, adapter em memória com `connectionStateRecovery`. O `@socket.io/postgres-adapter` 0.5.0 fica documentado como passo futuro: segundo o README, ele **não suporta** connection state recovery. |
| Edição/remoção | O autor pode editar ou remover por **15 min**. O admin pode remover a qualquer momento. Remoção é *soft delete* e as edições guardam histórico. |
| Busca | Coluna `tsvector` e coluna de texto normalizado, as duas mantidas por **trigger** (e não por coluna gerada, que causa drift no Prisma). Índices GIN (tsvector e `gin_trgm_ops`). O escopo de permissão entra no SQL. |

### 0.1 Versões conferidas em 2026-10-21 (`npm view`)
fastify 5.12.7 · socket.io / socket.io-client 4.8.4 · fastify-plugin 6.0.1 (o README traz o exemplo `{ fastify: '5.x' }`) · @socket.io/postgres-adapter 0.5.0 · pg-boss 12.38.0 (Node ≥ 22.12, PG ≥ 13, `import { PgBoss }`, `work(q, async ([job]) => …)`) · @prisma/client 7.10.1 · cmdk 1.1.1 (peer React ^19 ok) · fastify-type-provider-zod 7.0.0 (peer fastify ^5.5, zod ≥ 4.1.5) · zod 4.6.7 · rate-limiter-flexible 11.2.3.

Duas observações para quem cuida do banco:
- No pacote `prisma`, a dist-tag `latest` aponta hoje para `8.0.0-rc.24`. Fixar `prisma` e `@prisma/client` em **7.10.1 exato**.
- A sites de documentação (socket.io, pgboss.io, jsdelivr) a rede deu DNS bloqueado. O que não deu para conferir está na §9.

### 0.2 O que este módulo espera dos outros (contratos)
- `UsuarioAuth = { id: number; nome: string; nivel: 1|2|3; areaId: number|null }`. Se o perfil virar enum, adapte os comparadores.
- No módulo de auth: `lerTokenDoCookie(cookieHeader?: string): string|null`, `validarSessao(token): Promise<{ sessaoId: string; usuario: UsuarioAuth; expiraEm: Date } | null>`, `filtrarSessoesValidas(ids: string[]): Promise<Set<string>>`. O `preHandler` do REST tem de usar **as mesmas** funções.
- `podeVerChamado(u, c)` em `packages/shared`. Regra atual: admin vê tudo; operador vê os da sua área, os que assumiu e os próprios; usuário só vê os próprios.
- Prisma em `apps/api/src/db/prisma.ts`, pg-boss em `apps/api/src/jobs/boss.ts`, `emailService.enviar({para, assunto, html, texto})` e `emailService.habilitado()`.
- Pacotes: `@vinimon/api`, `@vinimon/web`, `@vinimon/shared`. Nomes de colunas como `data_abertura` e `sla_solucao_limite` seguem o modelo do especialista de dados (os limites de SLA precisam estar **persistidos** no chamado).

---

## 1. Socket.IO com Fastify 5

### 1.1 Plugin (`apps/api/src/realtime/plugin.ts`)
```ts
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import type { C2S, S2C, InterServidor, DadosSocket } from '@vinimon/shared/realtime';
export type IoServer = Server<C2S, S2C, InterServidor, DadosSocket>;
declare module 'fastify' { interface FastifyInstance { io: IoServer; realtime: RealtimeService; presenca: PresencaService } }

export default fp(async (app) => {
  const io: IoServer = new Server(app.server, {
    path: '/socket.io', serveClient: false,
    maxHttpBufferSize: 16 * 1024,              // cliente→servidor só manda sinais pequenos
    pingInterval: 25_000, pingTimeout: 20_000, connectTimeout: 10_000,
    allowRequest: (req, cb) => cb(null, origemPermitida(req.headers, env.APP_ORIGIN)),
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: false }, // false = revalida sessão
  });
  io.use(autenticarHandshake(app, io));
  io.on('connection', (s) => registrarHandlers(app, io, s));
  app.decorate('io', io);
  app.decorate('presenca', new PresencaService(app, io));
  app.decorate('realtime', criarRealtimeService(app, io));
  app.addHook('preClose', async () => { io.local.disconnectSockets(true); });
  app.addHook('onClose', async () => { await io.close(); });
}, { name: 'realtime', fastify: '5.x', dependencies: ['prisma', 'auth'] });
```
- O servidor http é o mesmo do Fastify. Em dev, o Vite faz proxy: `'/api'` e `'/socket.io': { target: 'http://localhost:3333', ws: true }`.
- `APP_ORIGIN` em dev é `http://localhost:5173`, porque o proxy não reescreve o cabeçalho Origin.
- No helmet, a CSP precisa de `connectSrc: ["'self'"]` (ver §9).
- Em produção, o proxy reverso tem de repassar `Upgrade`.

### 1.2 Handshake (`realtime/handshake.ts`)
```ts
export function origemPermitida(h: IncomingHttpHeaders, permitida: string) {
  if (h['sec-fetch-site'] === 'cross-site') return false;
  return h.origin === undefined || h.origin === permitida;   // GET same-origin (polling) pode vir sem Origin
}
const erroRt = (codigo: string) => Object.assign(new Error(codigo), { data: { codigo } });
export const autenticarHandshake = (app, io) => async (socket, next) => {
  try {
    const token = app.auth.lerTokenDoCookie(socket.request.headers.cookie);
    const s = token ? await app.auth.validarSessao(token) : null;
    if (!s) return next(erroRt('NAO_AUTENTICADO'));
    const n = io.of('/').adapter.rooms.get(salaUsuario(s.usuario.id))?.size ?? 0;
    if (n >= MAX_SOCKETS_POR_USUARIO) return next(erroRt('LIMITE_CONEXOES'));   // 10
    socket.data.usuario = s.usuario; socket.data.sessaoId = s.sessaoId;
    socket.data.sessaoExpiraEm = s.expiraEm.getTime();
    next();
  } catch (e) { app.log.error({ err: e }, 'handshake'); next(erroRt('ERRO_INTERNO')); }
};
```

### 1.3 Salas (`packages/shared/src/realtime/salas.ts`)

| Sala | Quem entra | Uso |
|---|---|---|
| `user:<id>` | todos os sockets do usuário | notificações, contagem, `presenca:propria`, fila própria |
| `sessao:<sessaoId>` | sockets da sessão (id do banco, **nunca o token**) | revogação |
| `area:<id>` | operadores (nível 2) da área | `fila:atualizada` |
| `admins` | nível 1 | `fila:atualizada` |
| `chamado:<id>` | quem pode ver o chamado (via `chamado:entrar`) | timeline pública, status, leitura limitada |
| `chamado:<id>:op` | só nível ≤ 2 que estão em `chamado:<id>` | privados, digitando privado, leitura real |
| `presenca:<uid>` | quem assinou a presença de uid (passou pela regra de privacidade) | `presenca:mudou` |

Na conexão, `sincronizarSalasFixas(socket)` sai de `area:*`/`admins` desatualizadas e entra em `user`, `sessao`, `area` e `admins` conforme o caso. Isso roda também quando `socket.recovered === true`.

### 1.4 Entrada na sala do chamado (regra revalidada a cada pedido)
`chamado:entrar {chamadoId}`:
1. Validação Zod e limite de taxa.
2. Se ainda não está na sala e já ocupa 20 salas `chamado:*`, responde `LIMITE_SALAS`.
3. Recarrega do banco o usuário (por PK; se estiver inativo, desconecta) e o chamado (`id, areaId, operadorId, usuarioId`).
4. Aplica `podeVerChamado(u, c)`. Se o chamado não existe ou não é visível, responde **o mesmo** erro `INDISPONIVEL`, para não permitir enumeração.
5. Atualiza `socket.data.usuario` e entra em `chamado:<id>` (mais `:op` se nível ≤ 2). Responde `{ ok: true }`.

Nos handlers de evento, a checagem é `socket.rooms.has(sala)`. Ela é confiável porque a filiação é revalidada (§1.8).

### 1.5 Eventos tipados (`packages/shared/src/realtime/eventos.ts`, Zod 4)
```ts
export const Id = z.number().int().positive().max(2_147_483_647);
export const EntrarChamado = z.strictObject({ chamadoId: Id });
export const Digitando = z.strictObject({ chamadoId: Id, privado: z.boolean() });
export const Atividade = z.strictObject({ ativo: z.boolean() });
export const AssinarPresenca = z.strictObject({ usuarioIds: z.array(Id).max(200) });
export type ErroRt = 'INVALIDO'|'INDISPONIVEL'|'LIMITE_SALAS'|'RATE_LIMIT'|'ERRO_INTERNO';
export type Ack<T = object> = (r: ({ ok: true } & T) | { ok: false; erro: ErroRt }) => void;
export interface C2S {
  'chamado:entrar': (p: z.infer<typeof EntrarChamado>, ack: Ack) => void;
  'chamado:sair': (p: z.infer<typeof EntrarChamado>) => void;
  'chamado:digitando': (p: z.infer<typeof Digitando>) => void;
  'chamado:parou_digitar': (p: z.infer<typeof Digitando>) => void;
  'presenca:atividade': (p: z.infer<typeof Atividade>) => void;
  'presenca:assinar': (p: z.infer<typeof AssinarPresenca>, ack: Ack<{ presencas: PresencaDTO[] }>) => void;
}
export interface S2C {
  'assentamento:novo': (p: { chamadoId: number; assentamento: AssentamentoDTO }) => void;   // DTO traz clienteId
  'assentamento:editado': (p: { chamadoId: number; assentamento: AssentamentoDTO }) => void;
  'assentamento:removido': (p: { chamadoId: number; assentamentoId: number; removidoEm: string }) => void;
  'chamado:atualizado': (p: { chamadoId: number; campos: CampoChamado[] }) => void;         // só invalidação
  'chamado:digitando': (p: { chamadoId: number; usuario: { id: number; nome: string }; privado: boolean; ate: string }) => void;
  'chamado:parou_digitar': (p: { chamadoId: number; usuarioId: number; privado: boolean }) => void;
  'chamado:leitura': (p: { chamadoId: number; usuarioId: number; nome: string; ultimoAssentamentoId: number; lidoEm: string }) => void;
  'chamado:acesso_revogado': (p: { chamadoId: number }) => void;
  'fila:atualizada': (p: { chamadoId: number; motivo: 'criado'|'atribuido'|'status'|'encaminhado' }) => void;
  'presenca:mudou': (p: { usuarioId: number; estado: EstadoPresenca }) => void;
  'presenca:propria': (p: { estado: EstadoPresenca; manual: EstadoManual|null; ate: string|null }) => void;
  'notificacao:nova': (p: { notificacao: NotificacaoDTO; naoLidas: number; agrupada: boolean }) => void;
  'notificacao:contagem': (p: { naoLidas: number }) => void;
  'sessao:encerrada': (p: { motivo: 'logout'|'revogada'|'expirada'|'usuario_desativado' }) => void;
}
export type InterServidor = Record<string, never>;
export interface DadosSocket { usuario: UsuarioAuth; sessaoId: string; sessaoExpiraEm: number }
export type CampoChamado = 'status'|'prioridade'|'area'|'operador'|'agendamento'|'anexos'|'encerramento';
```
- O wrapper `comValidacao(schema, limiter, handler)` faz três coisas: chama `safeParse` (se falhar, responde `INVALIDO` e conta uma violação), aplica o limiter e trata `ack` ausente com `typeof ack === 'function'`.
- No cliente, os payloads recebidos são validados só em dev.

### 1.6 Limites de taxa (rate-limiter-flexible `RateLimiterMemory`, chave = usuarioId)

| Evento | Limite | Ao exceder |
|---|---|---|
| `chamado:entrar` | 30/min | ack `RATE_LIMIT` e uma violação |
| `chamado:sair` | 60/min | ignora |
| `chamado:digitando` | 1 a cada 2 s por usuário+chamado | descarta em silêncio |
| `chamado:parou_digitar` | 30/min | ignora |
| `presenca:atividade` | 20/min | ignora e conta uma violação |
| `presenca:assinar` | 20/min | ack `RATE_LIMIT` |
| Global por socket (`socket.use`) | 120 pacotes / 10 s | `disconnect(true)` |
| Violações | 20 / 60 s | `disconnect(true)` |

No REST (`@fastify/rate-limit`, keyGenerator = id do usuário): POST/PATCH/DELETE de assentamento 30/min; mencionáveis 120/min; leitura 120/min; busca 120/min; PUT presença 20/min; seguir 30/min.

### 1.7 Reconexão
- `connectionStateRecovery` com 2 min e `skipMiddlewares: false`, ou seja, a sessão é revalidada também na recuperação. Com `socket.recovered`, o servidor roda `sincronizarSalasFixas` e `revalidarSalasChamado(socket)`, que tira das salas de chamado sem acesso e de `:op` quem não é staff.
- Eventos efêmeros (digitando, presença) são emitidos com `.volatile` e por isso não são guardados para replay. O cliente também ignora `ate` vencido.
- **O cliente sempre corrige o estado por REST** quando `connect` chega com `recovered === false`. Ele invalida as queries `['notificacoes']`, `['chamado']`, `['chamados']` e `['dashboard']`, e os hooks de sala repetem o `chamado:entrar`. Por isso a recuperação é só uma otimização, e a troca futura para o adapter Postgres (que não tem recovery) não quebra a corretude.
- Quando a desconexão vem com motivo `'io server disconnect'` (deploy ou revogação), o cliente espera um tempo aleatório de 1 a 5 s e chama `GET /api/me`. Se der 200, roda `socket.connect()`; se der 401, vai para a tela de login. Em `connect_error`: com `NAO_AUTENTICADO`, vai para o login; com `LIMITE_CONEXOES`, mostra o toast "Muitas abas abertas" e não tenta de novo; nos demais, tenta de novo com backoff de 2, 4, 8 até 30 s.

### 1.8 Expulsão e revogação (`realtime/service.ts`)
- `encerrarSessao(sessaoId, motivo)`: emite `sessao:encerrada` em `sessao:<id>` e depois `disconnectSockets(true)`. É chamado no logout, na troca de senha (revoga as outras sessões) e na revogação pelo admin.
- `encerrarSessoesDoUsuario(uid, motivo)`: faz o mesmo em `user:<uid>`. É chamado quando o usuário é desativado.
- `revalidarChamado(chamadoId)`: roda após qualquer mudança em `area_id`, `operador_id` ou `usuario_id`. Faz `fetchSockets()` da sala, carrega os usuários numa query só e aplica `podeVerChamado`. Quem perdeu acesso recebe `leave` de `chamado:<id>` e de `:op` e o evento `chamado:acesso_revogado`. Quem é nível 3 sai de `:op`.
- `revalidarUsuario(uid)`: roda após o admin alterar nível, área ou ativo.
  - Se o usuário ficou inativo, chama `encerrarSessoesDoUsuario`.
  - Senão: atualiza `data.usuario` nos sockets locais e ressincroniza as salas fixas.
  - Revalida as salas `chamado:*` (uma query) e, se virou nível 3, tira das salas `:op`.
  - Se o observador virou nível 3, sai de `presenca:<alvo>` cujo alvo também é nível 3.
  - Se o alvo virou nível 3, remove os observadores nível 3 de `presenca:<uid>`.
- Expiração: um `setTimeout` por socket para `sessaoExpiraEm` (limitado a 2³¹−1 ms). Quando dispara, revalida a sessão (ela pode ter sido renovada) e reagenda ou desconecta. Além disso, a cada 5 min roda `filtrarSessoesValidas(ids dos sockets locais)` numa query só e desconecta os inválidos.

### 1.9 Instância única ou escala horizontal
A v1 roda com uma instância só. Para um help desk de uma organização (até alguns milhares de conexões), um processo Node basta.

Para escalar no futuro, a env `REALTIME_ADAPTER=memory` (único valor aceito na v1) seria trocada por `postgres` com `@socket.io/postgres-adapter`. Isso exige:
1. Uma tabela `socket_io_attachments`, criada por migração e modelada com `@@ignore`.
2. Sticky sessions, ou `transports:['websocket']`.
3. Presença deixando a memória e indo para `fetchSockets` ou uma tabela.
4. Rate limits passando para `RateLimiterPostgres`.
5. Abrir mão do recovery, que já está coberto pela correção via REST.

---

## 2. Chat na linha do tempo

### 2.1 Por que persistir via REST
Pelo REST passam uma única validação, a autorização, a auditoria e o rate limit. Ele também dá idempotência por `clienteId`, códigos HTTP claros (403, 409, 422), testes com `app.inject`, funcionamento sem socket e anexos por multipart. A diferença de latência é desprezível. O socket só transmite a mensagem já gravada.

### 2.2 Modelo Prisma (acréscimos; todos os enums com `@@map` snake_case)
```prisma
enum TipoAssentamento { comentario privado sistema  @@map("tipo_assentamento") }
model Assentamento {
  id            Int              @id @default(autoincrement())
  chamadoId     Int              @map("chamado_id")
  usuarioId     Int              @map("usuario_id")
  tipo          TipoAssentamento
  texto         String           @db.Text
  clienteId     String?          @map("cliente_id") @db.Uuid
  criadoEm      DateTime         @default(now()) @map("criado_em") @db.Timestamptz(3)
  editadoEm     DateTime?        @map("editado_em") @db.Timestamptz(3)
  removidoEm    DateTime?        @map("removido_em") @db.Timestamptz(3)
  removidoPorId Int?             @map("removido_por_id")
  // relações: chamado (onDelete: Cascade), usuario ("AssentamentoAutor"), removidoPor ("AssentamentoRemovidoPor"), mencoes, edicoes
  @@unique([usuarioId, clienteId])
  @@index([chamadoId, id])
  @@map("assentamentos")
}
model AssentamentoMencao { assentamentoId Int @map("assentamento_id")  usuarioId Int @map("usuario_id")
  @@id([assentamentoId, usuarioId]) @@index([usuarioId]) @@map("assentamento_mencoes") }
model AssentamentoEdicao { id Int @id @default(autoincrement())  assentamentoId Int @map("assentamento_id")
  textoAnterior String @map("texto_anterior") @db.Text  editadoPorId Int @map("editado_por_id")
  editadoEm DateTime @default(now()) @map("editado_em") @db.Timestamptz(3)
  @@index([assentamentoId]) @@map("assentamento_edicoes") }
model LeituraChamado { chamadoId Int @map("chamado_id")  usuarioId Int @map("usuario_id")
  ultimoAssentamentoId Int @map("ultimo_assentamento_id")  lidoEm DateTime @map("lido_em") @db.Timestamptz(3)
  @@id([chamadoId, usuarioId]) @@map("leituras_chamado") }
```
Rode `prisma format` para gerar as relações inversas em `Usuario` e `Chamado`.

`AssentamentoDTO = { id, chamadoId, tipo, autor:{id,nome}, texto: string|null (null se removido), criadoEm, editadoEm, removidoEm, clienteId: string|null }`.

### 2.3 Envio otimista e idempotência
Fluxo de `POST /api/chamados/:id/assentamentos` com `{ texto (1..10000 após trim, sem caracteres de controle exceto \n\t), privado: boolean, clienteId: uuid }`:
1. Carrega o chamado com escopo. Sem acesso, responde 404.
2. `privado && nivel===3` → **403 `PRIVADO_SO_OPERADOR`** (hoje o código rebaixa para público sem avisar; isso deixa de existir). Chamado encerrado → 409 `CHAMADO_ENCERRADO`.
3. Se já existe `(usuarioId, clienteId)`, responde **200** com o DTO e não repete nenhum efeito colateral.
4. Valida as menções (§4). Se houver erro, responde 422.
5. Numa transação só:
   - cria o assentamento, com os nomes das menções canonizados;
   - cria `assentamento_mencoes`;
   - faz upsert do autor como seguidor (motivo `comentou`, limpa `silenciado_em`) e dos mencionados (motivo `mencionado`, ON CONFLICT DO NOTHING);
   - aplica as regras de domínio já existentes (1ª resposta; pendente → andamento quando o solicitante comenta, o que gera também um assentamento `sistema` e o evento `status_alterado`);
   - grava `EventoChamado(comentario|comentario_privado, dados:{mencionados})`.
   Se der P2002 em `(usuario_id, cliente_id)`, devolve o registro existente com 200.
6. Após o commit, `aposCommitChamado()` (§5.4) emite e faz o fanout. Erros nessa etapa são logados e não derrubam a resposta.
7. Responde 201 com o DTO.

No front:
- O cliente adiciona um item `{clienteId, status:'enviando'}` ao cache `['chamado', id, 'assentamentos']`.
- No sucesso, substitui o item pendente pelo DTO.
- No erro, marca `status:'falhou'` e oferece "Tentar novamente" (com o **mesmo** `clienteId`), "Editar" (devolve o texto ao compositor) e "Descartar".
- `mesclarAssentamento(cache, dto)`: se o id já existe, substitui; se o `clienteId` coincide com um pendente, substitui o pendente; senão, insere. Depois ordena por id, com os pendentes no fim.

### 2.4 Entrega em tempo real
- Tipo `privado`: emitido só para `chamado:<id>:op`.
- `comentario` e `sistema`: emitidos para `chamado:<id>`.
- `chamado:atualizado` é emitido **só** para mudanças de campo (nunca por comentário, para não sinalizar que existe uma nota privada).
- `fila:atualizada` (só o id) vai para `area:<areaId>`, `admins`, `user:<solicitante>` e `user:<operador>`. O cliente invalida as listas com debounce de 1 s.

### 2.5 Edição e remoção
- `PATCH /api/chamados/:id/assentamentos/:aid {texto}`:
  - só o autor; só tipos `comentario`/`privado`; com `now() - criado_em <= 15 min` medido no relógio do servidor; chamado não encerrado;
  - grava o texto anterior em `assentamento_edicoes` e atualiza `editado_em`;
  - **não** dá para mudar de público para privado ou o contrário (o schema `strict` rejeita o campo);
  - menções novas, calculadas pela diferença, geram um evento `comentario*` com `dados.edicao=true`, que só produz notificações `mencao`.
  - Erros: 403 `NAO_AUTOR`, 409 `JANELA_EXPIRADA`, 409 `CHAMADO_ENCERRADO`, 422 de menção.
- `DELETE …/:aid`: o autor dentro da janela, ou o admin a qualquer momento. Grava `removido_em`/`removido_por_id`, faz `UPDATE notificacoes SET resumo=NULL WHERE assentamento_id=…` e emite `assentamento:removido` para a mesma sala da criação. A API devolve `texto:null` e a UI mostra "Mensagem removida".
- `GET …/:aid/edicoes`: só nível ≤ 2.

### 2.6 Digitando
- O cliente emite `chamado:digitando {privado}` no máximo a cada 3 s enquanto o texto muda e não está vazio.
- Emite `parou_digitar` ao enviar, ao limpar o campo, no blur ou após 5 s sem tecla.
- O servidor exige `rooms.has(chamado:<id>)`. Se `privado`, exige `rooms.has(chamado:<id>:op)` e envia só para `:op`. Faz o relay com `socket.to(sala).volatile.emit(...)` e `ate = now + 6 s`.
- No evento `disconnecting`, emite `parou_digitar` em todas as salas `chamado:*` do socket.
- A UI mostra "Ana está digitando…", "Ana e João estão digitando…" ou "3 pessoas estão digitando…". Para staff, o privado aparece como "Ana está escrevendo uma nota privada…".

### 2.7 Confirmação de leitura ("visto por")
`POST /api/chamados/:id/leitura {assentamentoId}`. O cliente chama com debounce de 1 s quando a aba está visível e o fim da timeline está no viewport.

O servidor valida que o assentamento pertence ao chamado e é visível para o usuário (senão responde 422) e então:
```sql
INSERT INTO leituras_chamado (chamado_id, usuario_id, ultimo_assentamento_id, lido_em) VALUES ($c,$u,$a,now())
ON CONFLICT (chamado_id, usuario_id) DO UPDATE SET ultimo_assentamento_id = EXCLUDED.ultimo_assentamento_id, lido_em = now()
WHERE leituras_chamado.ultimo_assentamento_id < EXCLUDED.ultimo_assentamento_id
RETURNING ultimo_assentamento_id;
```
- Se a query não retorna linha, não há broadcast. Se retorna, marca como lidas as notificações daquele chamado (§5.6), emite `notificacao:contagem` para `user:<u>` e emite a leitura:
  - para `:op`, o valor real;
  - para `io.to(chamado).except(chamado:op)`, o valor **limitado** = `SELECT max(id) FROM assentamentos WHERE chamado_id=$c AND id<=$a AND tipo<>'privado'`. Isso não revela que existem notas privadas.
- `GET /api/chamados/:id/leituras` lista só os participantes (solicitante, operador atribuído, seguidores), com valor limitado para nível 3.
- A UI mostra, abaixo da última mensagem do próprio usuário, "Visto por Ana, João +2" (ponteiro ≥ id da mensagem, excluindo o autor) ou "Enviado".
- Não há opção de desligar a confirmação de leitura na v1.

---

## 3. Presença

**Estados:** `disponivel`, `ocupado`, `nao_perturbe`, `ausente`, `offline`. O manual pode ser `ocupado`, `nao_perturbe` ou `ausente`, com `ate` (ISO) ou `null` ("até eu mudar"). "Redefinir" volta para `estado: null`, que é o automático.

**Cálculo (função pura `calcularEstado`):**
```ts
if (conexoes.size === 0) return 'offline';
if (manual && (manual.ate === null || manual.ate > agora)) return manual.estado;
return [...conexoes.values()].some(c => c.ativo) ? 'disponivel' : 'ausente';
```
- No cliente, `ativo = visibilityState==='visible' && agora - ultimoInput < 5 min`. O valor é recalculado a cada 30 s e nos eventos de input (com throttle) ou de visibilidade, e o cliente emite `presenca:atividade` **só quando muda**.

**Armazenamento:**
- `PresencaService` em memória: `Map<usuarioId, { conexoes: Map<socketId,{ativo}>, manual, ultimoEstado }>`.
- `presencas_usuario(usuario_id PK, estado_manual, manual_expira_em, ultimo_visto_em)`.
- O manual é carregado do banco na 1ª conexão. `ultimo_visto_em` é gravado quando o último socket desconecta e, durante atividade, no máximo a cada 5 min.
- Um timer por usuário expira o manual (máx. 24 h, depois rearma).
- Quando o estado muda, o servidor emite `presenca:mudou` (volátil) para `presenca:<uid>` e `presenca:propria` para `user:<uid>`.

**REST:** `PUT /api/me/presenca { estado: 'ocupado'|'nao_perturbe'|'ausente'|null, ate: string|null }`. O `ate` precisa estar entre agora e agora + 7 dias. Para a opção "hoje", o cliente calcula o fim do dia local.

**Privacidade (decidida, em `packages/shared/presenca.ts`):**
- `podeVerPresenca(obs, alvo) = obs.nivel <= 2 || alvo.nivel <= 2`: staff vê todos; usuário vê só staff.
- `podeVerUltimoVisto(obs) = obs.nivel <= 2`.
- `presenca:assinar` substitui o conjunto anterior de salas `presenca:*` do socket, filtra os ids pela regra (uma query `id, nivel`) e devolve o snapshot `{usuarioId, estado, ultimoVistoEm?}`. O "visto por último" só vai para staff.
- Os eventos `presenca:mudou` nunca levam horário.

**Exibição:** ponto no avatar (verde disponível; vermelho ocupado; vermelho com "−" não perturbe; amarelo ausente; contorno cinza offline). O tooltip mostra "Disponível" e, para staff, "Visto por último há 5 min". Aparece nos autores da timeline, no cabeçalho do chamado (solicitante/operador), no seletor de operador do encaminhamento, nos resultados de pessoas do Ctrl+K e no menu de status do topo.

**Não perturbe** suprime notificações desktop e pop-ups. O feed e o badge continuam atualizando.

---

## 4. @menções

**Sintaxe armazenada:** `@[Nome](user:123)`. As funções puras ficam em `packages/shared/src/mencoes.ts`:
```ts
export const criarMencaoRe = () => /@\[([^\][\n]{1,80})\]\(user:(\d{1,10})\)/g;   // sempre nova instância (lastIndex)
extrairMencoes(texto): {id,nome}[]            // únicos por id, ordem de aparição
serializarMencao({id,nome}): string           // limpa [ ] ( ) e \n do nome, corta em 80
segmentarTexto(texto): Segmento[]             // {t:'texto'}|{t:'mencao',id,nome}|{t:'link',href,v}; link só http(s), sem pontuação final
textoPlano(texto): string                     // menções → "@Nome" (resumos, e-mail, desktop)
serializarComposer(visivel, selecionadas): string   // troca o 1º "@Nome" após o cursor anterior pelo token; se o usuário apagou, ignora
desserializarParaComposer(texto): { visivel, selecionadas }
```

**Validação no servidor (`mencoes.service.ts`):**
- Máximo de 20 menções distintas, senão 422 `MENCOES_DEMAIS`.
- Uma query só: `SELECT u.id, u.nome, u.nivel FROM usuarios u JOIN chamados c ON c.id=$c WHERE u.id = ANY($ids) AND u.ativo AND ${podeVerChamadoSql('u','c')}`.
- Se o comentário é privado, exige nível ≤ 2.
- Se o autor é nível 3, o mencionado precisa ser participante (solicitante, operador atribuído ou seguidor não silenciado).
- Se algum id falhar, responde **422 `MENCAO_SEM_ACESSO`** com `detalhes.usuarios: [{id, nome}]`. O **nome é o que veio no token**, nunca o do banco, para não vazar nomes por id. Mensagem: "Fulano não tem acesso a este chamado e não pode ser mencionado." No privado: "Comentários privados só podem mencionar operadores e administradores."
- Em caso de sucesso, os tokens são reescritos com o nome canônico.

**Autocomplete:** `GET /api/chamados/:id/mencionaveis?q=&privado=true|false`.
- Exige acesso ao chamado. Devolve no máximo 8 `{id, nome, login, nivel}`, sem o próprio usuário.
- Staff recebe qualquer pessoa ativa com acesso (mesmo SQL acima, aplicado sobre `usuarios`). Nível 3 recebe só participantes. Com `privado=true`, só nível ≤ 2.
- Filtro: `lower(unaccent(nome||' '||login)) LIKE '%'||lower(unaccent($q))||'%'`, escapando `%_\`. Participantes vêm primeiro, depois ordem por nome.
- No front, o gatilho é `@` no início ou após espaço, seguido de até 30 caracteres `[\p{L}\p{N} ._-]` antes do cursor. A lista aparece abaixo do textarea, com ↑↓ Enter/Tab Esc, `aria-activedescendant` e debounce de 150 ms.

**Renderização:** `TextoComMencoes` percorre `segmentarTexto` e gera elementos React. **Nunca** usa `dangerouslySetInnerHTML`. Links levam `rel="noopener noreferrer nofollow" target="_blank"`. A menção ao próprio usuário fica destacada. No e-mail, o texto passa por `textoPlano` e depois por escape HTML.

**Notificação:** gera o tipo `mencao`, sempre (ignora o "silenciado"), e o mencionado passa a seguir o chamado.

---

## 5. Feed de Atividade e notificações

### 5.1 Modelos
```prisma
enum MotivoSeguir { solicitante abriu atribuido comentou mencionado manual  @@map("motivo_seguir") }
model ChamadoSeguidor { chamadoId Int @map("chamado_id")  usuarioId Int @map("usuario_id")  motivo MotivoSeguir
  silenciadoEm DateTime? @map("silenciado_em") @db.Timestamptz(3)  criadoEm DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  @@id([chamadoId, usuarioId]) @@index([usuarioId]) @@map("chamado_seguidores") }
enum TipoEvento { chamado_criado comentario comentario_privado atribuido status_alterado prioridade_alterada encaminhado
  agendado encerrado reaberto anexo_adicionado sla_vencendo sla_vencido aceite_lembrete  @@map("tipo_evento") }
model EventoChamado { id Int @id @default(autoincrement())  chamadoId Int @map("chamado_id")  tipo TipoEvento
  atorId Int? @map("ator_id")  assentamentoId Int? @map("assentamento_id")  privado Boolean @default(false)
  dados Json @default("{}")  criadoEm DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  processadoEm DateTime? @map("processado_em") @db.Timestamptz(3)
  @@index([processadoEm, id]) @@index([chamadoId, id]) @@map("eventos_chamado") }
enum TipoNotificacao { mencao atribuido novo_na_fila comentario status atualizacao sla_vencendo sla_vencido aceite_pendente @@map("tipo_notificacao") }
enum EmailStatus { nao_aplica pendente enviando enviado falhou resumo resumido  @@map("email_status") }
enum CanalEmail { nunca imediato resumo  @@map("canal_email") }
model Notificacao { id Int @id @default(autoincrement())  usuarioId Int @map("usuario_id")  chamadoId Int @map("chamado_id")
  tipo TipoNotificacao  grupoChave String @map("grupo_chave") @db.VarChar(160)  eventoId Int @map("evento_id")
  assentamentoId Int? @map("assentamento_id")      // foco = primeiro não lido do grupo
  atorIds Int[] @default([]) @map("ator_ids")      // mais recentes primeiro, máx. 10
  contagem Int @default(1)  resumo String? @db.VarChar(300)  privado Boolean @default(false)  dados Json @default("{}")
  emailStatus EmailStatus @default(nao_aplica) @map("email_status")  emailEnviadoEm DateTime? @map("email_enviado_em") @db.Timestamptz(3)
  criadoEm DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)
  atualizadoEm DateTime @default(now()) @map("atualizado_em") @db.Timestamptz(3)   // NÃO usar @updatedAt (SQL cru atualiza)
  lidaEm DateTime? @map("lida_em") @db.Timestamptz(3)
  @@unique([usuarioId, grupoChave]) @@index([usuarioId, lidaEm])
  @@index([usuarioId, atualizadoEm(sort: Desc), id(sort: Desc)]) @@index([emailStatus, criadoEm]) @@map("notificacoes") }
model PreferenciaNotificacao { usuarioId Int @map("usuario_id")  tipo TipoNotificacao  inApp Boolean @map("in_app")
  desktop Boolean  email CanalEmail  @@id([usuarioId, tipo]) @@map("preferencias_notificacao") }
model AlertaEnviado { chave String @id @db.VarChar(120)  criadoEm DateTime @default(now()) @map("criado_em") @db.Timestamptz(3)  @@map("alertas_enviados") }
```
A tabela `notificacoes` atual (com `acao`/`texto`) **não é migrada**: os dados antigos são descartáveis.

### 5.2 Quem segue automaticamente
| Quem | Motivo |
|---|---|
| Solicitante | `solicitante` |
| Quem abriu o chamado em nome de outra pessoa | `abriu` |
| Operador atribuído (ao assumir ou ser encaminhado nominalmente) | `atribuido` |
| Quem comenta | `comentou`; **limpa** `silenciado_em` |
| Quem é mencionado | `mencionado`; não sobrescreve quem deixou de seguir |

"Deixar de seguir" grava `silenciado_em` (a linha continua). `mencao`, `atribuido` e `aceite_pendente` ignoram o silenciado. Seguidores que perderam acesso continuam na tabela, mas o fanout os filtra pelo SQL de acesso.

### 5.3 Regras evento → notificação (`notificacoes/regras.ts`, função pura)

Em todas as regras: o ator fica de fora, usuários inativos ficam de fora, o acesso é filtrado por SQL e eventos privados só vão para nível ≤ 2.

| Evento | Destinatário → tipo | grupoChave |
|---|---|---|
| chamado_criado | operadores ativos da área → `novo_na_fila` | `novo_na_fila:<eventoId>` |
| chamado_criado | solicitante, quando foi aberto em nome dele → `atualizacao` | `atualizacao:<chamadoId>` |
| comentario / comentario_privado | seguidores não silenciados (menos os mencionados) → `comentario` (privado=true no privado) | `comentario:<chamadoId>` |
| comentario / comentario_privado | mencionados → `mencao` | `mencao:<eventoId>` |
| comentario* com `dados.edicao` | só os mencionados novos → `mencao` | `mencao:<eventoId>` |
| atribuido | novo operador → `atribuido` | `atribuido:<eventoId>` |
| atribuido | demais seguidores → `atualizacao` | `atualizacao:<chamadoId>` |
| encaminhado | seguidores → `atualizacao` | `atualizacao:<chamadoId>` |
| encaminhado sem operador | operadores da nova área → `novo_na_fila` | `novo_na_fila:<eventoId>` |
| encaminhado com operador | o operador → `atribuido` | `atribuido:<eventoId>` |
| status_alterado, agendado, reaberto | seguidores → `status` (`dados.statusNome`) | `status:<chamadoId>` |
| encerrado | solicitante → `aceite_pendente` se `dados.requerAceite`, senão `status` | `aceite_pendente:<chamadoId>` / `status:<chamadoId>` |
| encerrado | demais seguidores → `status` | `status:<chamadoId>` |
| prioridade_alterada, anexo_adicionado | seguidores → `atualizacao` | `atualizacao:<chamadoId>` |
| sla_vencendo / sla_vencido | operador atribuído; se não houver, operadores da área | `sla:<eventoId>` |
| aceite_lembrete | solicitante → `aceite_pendente` | `aceite_pendente:<chamadoId>` |

### 5.4 Fanout com número fixo de queries (corrige o N+1 de `notifica`)
Hoje, `notifica()` (server.js:266-280) faz `SELECT DISTINCT` em `assentamentos` e, **para cada destinatário**, um `SELECT usuarios`, um `SELECT` de escopo e um `INSERT`.

O novo `aposCommitChamado({chamadoId, eventoIds, assentamentoIds, campos, acessoMudou, fila})` em `modules/eventos/apos-commit.ts`:
1. emite os assentamentos (carrega os DTOs numa query só);
2. emite `chamado:atualizado` e `fila:atualizada`;
3. chama `revalidarChamado` se `acessoMudou`;
4. roda `await fanout.processar(eventoId)` para cada evento, com try/catch e log.

`fanout.processar(id)`, numa transação:
```sql
-- 1 claim (bloqueia concorrente; se 0 linhas, sai)
UPDATE eventos_chamado SET processado_em = now() WHERE id = $1 AND processado_em IS NULL RETURNING *;
-- 2 chamado (area/operador/solicitante)   3 candidatos (seguidores | operadores da área | ids explícitos)
-- 4 filtro de acesso em lote
SELECT u.id, u.nivel FROM usuarios u JOIN chamados c ON c.id = $chamado
WHERE u.id = ANY($candidatos::int[]) AND u.ativo AND u.id <> $ator AND (NOT $privado OR u.nivel <= 2) AND ${podeVerChamadoSql('u','c')};
-- 5 preferências: SELECT * FROM preferencias_notificacao WHERE usuario_id = ANY($ids)   (padrões em código)
-- 6 upsert agrupado
INSERT INTO notificacoes (usuario_id, chamado_id, tipo, grupo_chave, evento_id, assentamento_id, ator_ids, resumo, privado, dados, email_status)
SELECT d.u, $chamado, d.tipo::tipo_notificacao, d.chave, $evento, $assent, $atores::int[], $resumo, $privado, $dados::jsonb, d.email::email_status
FROM unnest($us::int[], $tipos::text[], $chaves::text[], $emails::text[]) AS d(u, tipo, chave, email)
ON CONFLICT (usuario_id, grupo_chave) DO UPDATE SET
  evento_id = EXCLUDED.evento_id, contagem = notificacoes.contagem + 1, resumo = EXCLUDED.resumo,
  privado = notificacoes.privado OR EXCLUDED.privado, dados = EXCLUDED.dados, atualizado_em = now(),
  ator_ids = CASE WHEN cardinality(EXCLUDED.ator_ids) = 0 OR EXCLUDED.ator_ids[1] = ANY(notificacoes.ator_ids)
                  THEN notificacoes.ator_ids ELSE (EXCLUDED.ator_ids || notificacoes.ator_ids)[1:10] END
RETURNING id, usuario_id, (xmax = 0) AS inserida;
```
Notas sobre o SQL:
- `$atores` é `'{}'` quando o ator é nulo. `assentamento_id` e `email_status` **não** mudam no conflito: um grupo gera um e-mail só.
- O resumo é `textoPlano(texto)` cortado em 140 caracteres.
- Se a preferência tem `inApp=false`, o destinatário fica fora (desktop e e-mail dependem do in-app).
- Depois do commit: (7) `SELECT usuario_id, count(*) … WHERE usuario_id = ANY($ids) AND lida_em IS NULL GROUP BY 1`, (8) `notificacao:nova` para `user:<id>`, (9) `boss.send('email-notificacao', {notificacaoId}, {startAfter: 60, retryLimit: 5, retryBackoff: true})` para as linhas inseridas com `email_status='pendente'`.

### 5.5 Lido / não lido
- `marcarLidas(usuarioId, filtro)`: `UPDATE notificacoes SET lida_em = now(), grupo_chave = grupo_chave || '#' || id WHERE usuario_id=$u AND lida_em IS NULL AND …`. Renomear a chave fecha o grupo; o próximo evento abre outro.
- "Marcar como não lida": `lida_em = NULL` (a chave continua renomeada).
- Toda mudança emite `notificacao:contagem`.
- Abrir o chamado (POST leitura) marca como lidas as notificações daquele chamado.

### 5.6 Preferências (`preferenciaPadrao(tipo, nivel)` em shared)

Coluna "E-mail": o primeiro valor vale para staff (nível ≤ 2), o segundo para o solicitante (nível 3).

| Tipo | In-app | Desktop | E-mail (staff / solicitante) |
|---|---|---|---|
| mencao | sempre (fixo) | sim | imediato / imediato |
| atribuido | sempre (fixo) | sim | imediato / — |
| novo_na_fila | sim | sim | nunca / — |
| comentario | sim | sim | nunca / imediato |
| status | sim | não | nunca / imediato |
| atualizacao | sim | não | nunca / nunca |
| sla_vencendo, sla_vencido | sim | sim | imediato / — |
| aceite_pendente | sim | sim | — / imediato |

`GET/PUT /api/me/preferencias-notificacao` com `{ itens: [{tipo, inApp, desktop, email}] }`. Só as diferenças em relação ao padrão vão para a tabela. O servidor rejeita `inApp=false` para `mencao`/`atribuido` com 400.

### 5.7 E-mail e jobs (pg-boss 12; filas com hífen e `createQueue` antes de `work`/`schedule`)

| Fila | Gatilho | Lógica |
|---|---|---|
| `email-notificacao` | `send` pós-fanout | Claim com `UPDATE … SET email_status='enviando' WHERE id=$1 AND email_status='pendente'` (se 0 linhas, sai). Se `lida_em` não for nulo, o usuário está inativo ou sem e-mail, ou o e-mail está desabilitado, marca `nao_aplica`. Senão envia e marca `enviado`. Em erro, volta para `pendente` e lança (o pg-boss refaz). **Privado: o e-mail não inclui o texto** ("Há um novo comentário privado no chamado #N"). Público: até 500 caracteres de `textoPlano`. |
| `eventos-varrer` | cron `* * * * *` | Eventos com `processado_em IS NULL AND criado_em < now()-1 min`, até 200, passam por `fanout.processar`. |
| `email-varrer` | cron `*/5 * * * *` | `pendente` com mais de 5 min e menos de 24 h é reenfileirado; acima de 24 h vira `falhou`. |
| `sla-verificar` | cron `* * * * *` | Chamados abertos com `now() >= limite - (limite - abertura) * 0.2` (resposta só se `data_primeira_resposta IS NULL`), até 500. Insere em `alertas_enviados` a chave `sla:<id>:<marco>:<vencendo/vencido>:<epoch do limite>` com ON CONFLICT DO NOTHING RETURNING; só as chaves novas viram evento e fanout. Como a chave inclui o limite, recalcular o SLA dispara o alerta de novo. |
| `aceite-lembrete` | cron `0 * * * *` | Chamado encerrado com aceite pendente há mais de 48 h e chave `aceite:<id>:1` nova → evento `aceite_lembrete`. |
| `email-resumo-diario` | cron `0 8 * * *`, tz `America/Sao_Paulo` | Por usuário, notificações não lidas com `email_status='resumo'` das últimas 24 h → um e-mail → `resumido`. |
| `notificacoes-limpeza` | cron `0 3 * * *` | Apaga notificações lidas com mais de 90 dias, eventos processados com mais de 180 dias e alertas de chamados encerrados com mais de 180 dias. |

Os e-mails têm assunto `[Vinimon] #123 · Assunto`, link `${APP_ORIGIN}/chamados/123` e link para as preferências. Todo o conteúdo passa por escape.

### 5.8 Push no lugar do polling
- Sai o `setInterval(pollNotifs, 15000)` (app.js:51).
- Entram: um fetch inicial de `GET /api/notificacoes` no login, os eventos `notificacao:nova` e `notificacao:contagem` gravados direto no cache do TanStack Query, `refetchOnWindowFocus` e invalidação ao reconectar sem recovery.
- O título da aba fica `(n) Vinimon`.

### 5.9 Notificações desktop (Web Notifications)
- **Permissão:** só por clique, no botão "Ativar notificações na área de trabalho" do painel Atividade e da página de preferências. Nunca é pedida ao carregar a página. Com `denied`, a UI mostra como liberar no navegador. Só funciona em contexto seguro (HTTPS ou localhost).
- **Apresentação** (`features/atividade/desktop.ts`):
```ts
export async function apresentar(n: NotificacaoDTO, ctx: { desktop: boolean; naoPerturbe: boolean; toast(n): void; abrir(n): void }) {
  const focada = document.visibilityState === 'visible' && document.hasFocus();
  if (!focada) await new Promise(r => setTimeout(r, 400));          // aba focada ganha a vez
  const exec = () => {
    const k = 'vinimon:notifs-apresentadas', id = `${n.id}:${n.atualizadoEm}`;
    const lista: string[] = JSON.parse(localStorage.getItem(k) ?? '[]');
    if (lista.includes(id)) return;
    localStorage.setItem(k, JSON.stringify([id, ...lista].slice(0, 200)));
    if (ctx.naoPerturbe) return;
    if (focada) return ctx.toast(n);
    if (!ctx.desktop || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const nt = new Notification(`#${n.chamado.id} · ${n.chamado.assunto.slice(0, 60)}`,
        { body: corpoDesktop(n), tag: `vinimon-${n.id}`, lang: 'pt-BR', icon: '/icone-192.png' });
      nt.onclick = () => { window.focus(); ctx.abrir(n); nt.close(); };
    } catch { /* Android exige Service Worker: ignora */ }
  };
  if (navigator.locks) await navigator.locks.request(`vinimon-notif-${n.id}`, exec); else exec();
}
// corpoDesktop(n) = n.privado ? textoNotificacao(n) : [textoNotificacao(n), n.resumo].filter(Boolean).join('\n').slice(0, 140)
```

### 5.10 Feed (UI)
- O botão Atividade (sino com badge) abre um popover, e há a página `/atividade`.
- Filtros: Todas, Não lidas, Menções, Atribuições, SLA.
- Cada item mostra o avatar do ator com presença, `textoNotificacao(n)`, `#id · assunto`, tempo relativo e um ponto de não lida. Clicar marca como lida e navega para `?foco=<assentamentoId>`. O menu do item tem "Marcar como lida/não lida" e "Deixar de seguir".
- Textos de `textoNotificacao` (em shared): "Ana Souza mencionou você em #123"; "Ana e João comentaram em #123"; "Ana e mais 2 pessoas comentaram em #123"; "Ana Souza adicionou 3 comentários em #123"; "Ana alterou o status de #123 para Encerrado"; "Novo chamado #123 na fila de TI"; "O prazo de solução de #123 vence às 14:30"; "O prazo de resposta de #123 venceu"; "#123 foi encerrado. Confirme a solução e avalie o atendimento."

`NotificacaoDTO = { id, tipo, chamado:{id,assunto}, atores:[{id,nome}], contagem, resumo, privado, assentamentoId, dados, criadoEm, atualizadoEm, lida }`.

### 5.11 Endpoints
| Endpoint | Função |
|---|---|
| `GET /api/notificacoes?filtro=todas\|nao_lidas\|mencoes\|atribuicoes\|sla&cursor=&limite=30` | lista; cursor = base64(`atualizadoEm\|id`), máx. 50; devolve `{itens, proximoCursor, naoLidas}` |
| `GET /api/notificacoes/contagem` | número de não lidas |
| `POST /api/notificacoes/:id/lida` | marca uma como lida |
| `POST /api/notificacoes/:id/nao-lida` | marca uma como não lida |
| `POST /api/notificacoes/lidas {chamadoId?}` | marca todas, ou as de um chamado |
| `GET/PUT /api/me/preferencias-notificacao` | preferências |
| `GET /api/chamados/:id/seguidores` | staff recebe a lista; nível 3 recebe só `{seguindo}` |
| `PUT /api/chamados/:id/seguir` | 204 |
| `DELETE /api/chamados/:id/seguir` | 204 |

---

## 6. Busca global (Ctrl+K)

### 6.1 O que é buscado

| Grupo | Quem vê | Campos | Escopo |
|---|---|---|---|
| Chamados | todos | nº (`123` ou `#123`), assunto, descrição | `escopoChamadoSql` |
| Artigos (base de conhecimento) | todos | título, conteúdo | nível 3 só publicados; staff vê todos, com marca de "rascunho" |
| Ativos | nível ≤ 2 | etiqueta, série, modelo, tipo, responsável | — |
| Pessoas | nível ≤ 2 | nome, login, e-mail | admin vê inativos, com marca |
| Ações/navegação | todos | — | lista estática no cliente, filtrada por nível |

Comentários ficam **fora** da busca na v1, por causa da complexidade de privacidade.

### 6.2 Banco
Colunas no Prisma: em `Chamado` e `Artigo`, `buscaVetor Unsupported("tsvector")? @map("busca_vetor")`. Em `Chamado`, `Artigo`, `Equipamento` e `Usuario`, `buscaTexto String? @map("busca_texto") @db.Text`. Índices:
```prisma
@@index([buscaVetor], type: Gin, map: "chamados_busca_vetor_idx")
@@index([buscaTexto(ops: raw("gin_trgm_ops"))], type: Gin, map: "chamados_busca_texto_trgm_idx")
```
No PrismaClient, `omit: { chamado: { buscaTexto: true }, artigo: {…}, equipamento: {…}, usuario: {…} }`. A aplicação nunca escreve nessas colunas.

O SQL abaixo vai **no topo** do `migration.sql` gerado com `--create-only`, porque o `gin_trgm_ops` depende do `pg_trgm`. `unaccent` e `pg_trgm` são extensões *trusted* desde o PG13.
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
  CREATE TEXT SEARCH CONFIGURATION public.pt_unaccent (COPY = pg_catalog.portuguese);
  ALTER TEXT SEARCH CONFIGURATION public.pt_unaccent ALTER MAPPING FOR hword, hword_part, word WITH public.unaccent, pg_catalog.portuguese_stem;
END IF; END $$;
```
No fim do arquivo vão os triggers e o backfill:
```sql
CREATE OR REPLACE FUNCTION chamados_busca_trg() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  NEW.busca_vetor := setweight(to_tsvector('pt_unaccent', coalesce(NEW.assunto,'')), 'A')
                  || setweight(to_tsvector('pt_unaccent', left(coalesce(NEW.descricao,''), 20000)), 'B');
  NEW.busca_texto := lower(unaccent(coalesce(NEW.assunto,'') || ' ' || left(coalesce(NEW.descricao,''), 1000)));
  RETURN NEW;
END $$;
CREATE TRIGGER chamados_busca BEFORE INSERT OR UPDATE OF assunto, descricao ON chamados FOR EACH ROW EXECUTE FUNCTION chamados_busca_trg();
UPDATE chamados SET assunto = assunto;   -- backfill
```
Os outros triggers seguem o mesmo padrão:
- **artigos:** vetor = título (peso A) + conteúdo (peso B); texto = título + `left(conteudo, 500)`.
- **equipamentos:** só texto: `etiqueta, serie, modelo, tipo, responsavel`.
- **usuarios:** só texto: `nome, login, email`.

**Plano B (decidido de antemão):** se o Prisma recusar `@@index` em campo `Unsupported`, ou se `migrate dev` acusar drift:
1. remover só o `@@index([buscaVetor])`;
2. filtrar apenas por LIKE/trigram;
3. manter o `ts_rank_cd` só para ordenar.

### 6.3 Consulta (`modules/busca/sql.ts`, sempre com `$queryRaw` tagged; `$queryRawUnsafe` é proibido)
Tokens: `normalizarBusca(q)` faz NFD, remove marcas, passa para minúsculas, colapsa espaços e corta em 100 caracteres. Depois separa por `[^\p{L}\p{N}]+`, fica com no máximo 8 tokens, cada um com até 30 caracteres. Se não sobrar nenhum token, responde 400. Isso torna `tsq = tokens.map(t => t + ':*').join(' & ')` seguro.
```ts
const likes = tokens.filter(t => t.length >= 3).map(t => Prisma.sql`c.busca_texto LIKE ${'%' + t + '%'}`);
const fLike = likes.length ? Prisma.sql`OR (${Prisma.join(likes, ' AND ')})` : Prisma.empty;
const fSim  = normalizado.length >= 3 ? Prisma.sql`OR (q.norm <% c.busca_texto)` : Prisma.empty;
const sql = Prisma.sql`
WITH q AS (SELECT to_tsquery('pt_unaccent', ${tsq}) AS tsq, lower(unaccent(${qBruto})) AS norm)
SELECT c.id, c.assunto, s.nome AS "statusNome", s.cor AS "statusCor", (s.tipo = 'encerrado') AS encerrado, us.nome AS "solicitanteNome",
  ( CASE WHEN c.id = ${idExato}::int THEN 1000 ELSE 0 END
  + COALESCE(ts_rank_cd(c.busca_vetor, q.tsq), 0) * 4
  + COALESCE(word_similarity(q.norm, c.busca_texto), 0) * 2
  + CASE WHEN s.tipo <> 'encerrado' THEN 0.3 ELSE 0 END
  + 0.3 / (1 + EXTRACT(EPOCH FROM (now() - c.data_abertura)) / 2592000) ) AS score
FROM chamados c JOIN status s ON s.id = c.status_id JOIN usuarios us ON us.id = c.usuario_id CROSS JOIN q
WHERE ${escopoChamadoSql(usuario, 'c')}
  AND (c.id = ${idExato}::int OR c.busca_vetor @@ q.tsq ${fLike} ${fSim})
ORDER BY score DESC, c.id DESC LIMIT ${limite}`;
```
- **Ativos:** score = 100 se `lower(etiqueta) = q.norm` ou `lower(serie) = q.norm`, mais `word_similarity`. Filtro: igualdade, LIKE nos tokens ou `<%`.
- **Pessoas:** filtro com LIKE ou `<%` em `u.busca_texto`, mais `(u.ativo OR ${ehAdmin})`. A presença vem do `PresencaService`.
- As 4 consultas rodam **em sequência** dentro de um `$transaction`, depois de `SELECT set_config('statement_timeout','1500',true), set_config('pg_trgm.word_similarity_threshold','0.5',true)`.

### 6.4 Endpoint
`GET /api/busca?q=&tipos=chamados,artigos,ativos,usuarios&limite=5`, com limite de 1 a 10.
- `q` tem de 2 a 100 caracteres, ou é um número.
- Os grupos não permitidos voltam como `[]` (sem 403).
- Rate limit de 120/min.
- Resposta: `{ chamados:[{id,assunto,statusNome,statusCor,encerrado,solicitanteNome}], artigos:[{id,titulo,publicado}], ativos:[{id,etiqueta,tipo,modelo,serie}], usuarios:[{id,nome,login,nivel,ativo,presenca}] }`.

### 6.5 Front (cmdk via shadcn `CommandDialog`)
- **Atalho:** `keydown` global com `(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'` → `preventDefault()` e abre a paleta. No topo há o botão "Buscar… Ctrl K".
- **Filtro:** `shouldFilter={false}`.
- **Consulta:** debounce de 200 ms e `useQuery(['busca', termo], ({signal}) => …, { enabled: termo.length >= 2 || /^#?\d+$/.test(termo), placeholderData: keepPreviousData, staleTime: 30_000 })`.
- **Grupos:** Ações, Chamados, Base de conhecimento, Ativos, Pessoas. Com o campo vazio, aparecem os últimos 5 chamados abertos (localStorage) e as ações.
- **Ações** (`features/busca/acoes.ts`, cada uma com `{id, rotulo, palavras[], rota | executar, nivelMax}`, comparadas no cliente por `normalizarBusca().includes`): Abrir chamado, Meus chamados, Fila da minha área (≤ 2), Painel, Relatórios (≤ 2), Usuários/Cadastros/Configurações (1), Meu perfil, Atividade, Preferências de notificação, Definir status (Ocupado/Não perturbe/Ausente/Redefinir), Ativar notificações na área de trabalho.
- **Destinos do Enter:** `/chamados/$id`, `/base-conhecimento/$id`, `/ativos/$id` e `/chamados?usuarioId=$id`.

---

## 7. Testes (Vitest; Postgres real de teste; nunca mockar o Prisma em SQL ou escopo)

Helpers em `apps/api/test/helpers/socket.ts`:
- `conectar(app, cookie, {origin})`: `await app.listen({port:0, host:'127.0.0.1'})`, depois `ioc(url, { transports:['websocket'], extraHeaders:{cookie, origin}, forceNew:true, reconnection:false })`.
- `esperarEvento(s, ev, 1000)`, `naoRecebe(s, ev, 300)` e `s.timeout(1000).emitWithAck(ev, p)`.

Os testes marcados com **[V]** cobrem vazamento.

| # | Área | Teste |
|---|---|---|
| T01 | escopo | Matriz de 3 níveis × 6 chamados: `podeVerChamado`, `escopoChamadoWhere`, `escopoChamadoSql` e `podeVerChamadoSql` devolvem conjuntos idênticos. |
| T02 [V] | handshake | Sem cookie, cookie inválido, sessão expirada ou revogada → `connect_error` `NAO_AUTENTICADO`. Origin `https://evil.example` ou `sec-fetch-site: cross-site` → recusado. O 11º socket do mesmo usuário → `LIMITE_CONEXOES`. |
| T03 [V] | salas | Nível 3 entrando em chamado alheio → `INDISPONIVEL` (o mesmo código para inexistente). Depois, um comentário nesse chamado → `naoRecebe`. |
| T04 [V] | privado | Nível 3 na sala não recebe `assentamento:novo/editado/removido` de privado, nem digitando privado. A leitura que recebe é a limitada (≤ último público). |
| T05 [V] | revogação | Encaminhar para outra área → o operador antigo recebe `acesso_revogado` e não recebe o próximo comentário. Rebaixar operador a usuário → sai de `:op`. Desativar → socket desconectado em menos de 1 s, e reconexão dá `NAO_AUTENTICADO`. Logout → só os sockets daquela sessão caem. |
| T06 | recovery | `engine.close()`, emissão durante a queda, reconexão → `recovered === true` e evento recebido. Com acesso revogado durante a queda, a sala não é restaurada. |
| T07 | rate limit | 50 `digitando` em 1 s → no máximo 1 relay. 25 payloads inválidos → disconnect. 31º `entrar` no mesmo minuto → `RATE_LIMIT`. |
| T08 | chat | POST cria e emite. O mesmo `clienteId` duas vezes → 1 registro, com 201 e depois 200. Privado vindo de nível 3 → 403. Chamado encerrado → 409. |
| T09 | edição | Não autor → 403. Após 15 min (relógio falso) → 409. Campo `privado` no PATCH → 400. Histórico gravado. Remoção devolve `texto:null`. O admin remove após a janela. |
| T10 [V] | menções | Mencionar sem acesso → 422, nenhuma notificação nem seguidor criado, e a mensagem de erro usa o nome do token. Nível 3 mencionando não participante → 422. Usuário nível 3 em comentário privado → 422. Mais de 20 → 422. |
| T11 [V] | autocomplete | Nível 3 só recebe participantes. Com `privado=true`, só staff com acesso. Operador de outra área nunca aparece. Sem acesso ao chamado → 404. |
| T12 [V] | fanout | Comentário privado → seguidor nível 3 não recebe. Seguidor que perdeu acesso não recebe. O ator não recebe. A menção ignora o silenciado. Dois comentários → 1 linha com `contagem=2`. Depois de lida, o próximo cria uma linha nova. |
| T13 | N+1 | Contador de queries (`$on('query')`): o fanout com 5 e com 50 seguidores executa **o mesmo número** de queries, no máximo 10. |
| T14 | outbox | Fanout que falha → `processado_em` continua nulo → a varredura processa depois. Duas chamadas concorrentes → uma notificação só. |
| T15 [V] | e-mail | O HTML/texto do e-mail de comentário privado não contém o texto. Notificação lida antes do job → `nao_aplica`. Falha de SMTP volta para `pendente`. |
| T16 | SLA | Chamado a 80% do prazo → 1 alerta. Rodar o job de novo → nenhum alerta novo. Limite recalculado → alerta novo. |
| T17 [V] | presença | Nível 3 assinando outro nível 3 → fora do snapshot e sem eventos. Nível 3 nunca recebe `ultimoVistoEm`. `calcularEstado` coberto por tabela de casos. Manual com expiração vencida volta ao automático. |
| T18 [V] | leitura | O ponteiro só avança (um valor menor não muda nada). Assentamento de outro chamado → 422. Nível 3 apontando para privado → 422. |
| T19 [V] | busca | Termo de um chamado de B não aparece para A. Operador de outra área não vê. Nível 3 recebe ativos e pessoas vazios. `'); DROP TABLE x;--`, `:*\|!&`, `\\%_` → 200 sem erro. `#123` vem primeiro. Ranking: assunto > descrição. Busca com e sem acento dá o mesmo resultado. |
| T20 | shared | `mencoes.ts`: ida e volta de `serializarComposer`/`desserializar`, `<script>` vira texto, links `javascript:` não viram link. `textoNotificacao` para cada tipo e contagem. `preferenciaPadrao`. |
| T21 | web | `mesclarAssentamento` (dedupe por id e clienteId). `apresentar()` com Notification e visibility mockados (focada → toast; oculta → desktop; privado sem resumo; não perturbe → nada; dedupe entre abas). Ctrl+K e Cmd+K abrem a paleta. Ações filtradas por nível. |
| T22 | e2e (se houver Playwright) | Dois contextos (operador e usuário): chat ao vivo, digitando, "visto por" e notificação no painel. |

---

## 8. Tarefas para os agentes Haiku

Formato: dependência, arquivos, o que fazer e como verificar. Os pré-requisitos `BASE-*` vêm dos outros especialistas (monorepo, Prisma inicial com Chamado/Usuario, auth/sessões, serviço de chamados, pg-boss, e-mail, shell web).

**Fase A: shared**
- **TM-01 Salas e constantes.** Dep.: BASE-monorepo. Arquivos: `packages/shared/src/realtime/salas.ts`, `src/constantes.ts`. Criar `salaUsuario`, `salaSessao`, `salaArea`, `SALA_ADMINS`, `salaChamado`, `salaChamadoOp`, `salaPresenca`, `MAX_SOCKETS_POR_USUARIO=10`, `MAX_SALAS_CHAMADO=20`, `JANELA_EDICAO_MIN=15`, `DIGITANDO_TTL_MS=6000`, `OCIOSO_MS=300000`. Verificar: teste unitário dos formatos; `pnpm --filter @vinimon/shared test`.
- **TM-02 Menções.** Arquivo: `src/mencoes.ts` (§4). Verificar: T20 (parte de menções).
- **TM-03 Presença.** Arquivo: `src/presenca.ts`. Enums, `podeVerPresenca`, `podeVerUltimoVisto`, rótulos pt-BR. Verificar: tabela de casos.
- **TM-04 Notificações.** Arquivo: `src/notificacoes.ts`. Enum `TipoNotificacao`, `NotificacaoDTO` (Zod), `preferenciaPadrao`, `TIPOS_INAPP_FIXOS=['mencao','atribuido']`, `textoNotificacao`. Verificar: T20.
- **TM-05 Eventos realtime.** Arquivo: `src/realtime/eventos.ts` (§1.5) mais `AssentamentoDTO` e `PresencaDTO`. Verificar: `pnpm -r typecheck`.
- **TM-06 Busca.** Arquivo: `src/busca.ts`. `BuscaQuery` (Zod), `BuscaResposta`, `normalizarBusca`, `tokensBusca`, `idChamadoExato(q)`. Verificar: testes de acento, pontuação e `#123`.

**Fase B: banco**
- **TM-07 Modelos.** Dep.: BASE-prisma. Arquivo: `schema.prisma`. Colar os modelos das §2.2 e §5.1, rodar `prisma format` e `migrate dev --name tempo_real`. Verificar: rodar `migrate dev` de novo dá "Already in sync"; `\d notificacoes` mostra o índice único `(usuario_id, grupo_chave)`.
- **TM-08 Busca no banco.** Colunas e índices da §6.2. `migrate dev --create-only --name busca`, editar o SQL (topo e fim) e aplicar. Verificar: `SELECT busca_texto FROM chamados LIMIT 1` preenchido; `EXPLAIN` da busca usa `Bitmap Index Scan` em pelo menos um índice GIN; um novo `migrate dev` dá "Already in sync". Se falhar, aplicar o **Plano B** e registrar no PR.
- **TM-09 Escopo.** Dep.: BASE-chamados. Arquivo: `apps/api/src/modules/chamados/escopo.ts`. `escopoChamadoSql(u, alias)` e `podeVerChamadoSql(uAlias, cAlias)` com `Prisma.raw` só para aliases que casam `/^[a-z_]+$/` (senão lança erro); confirmar `escopoChamadoWhere` e `podeVerChamado`. Verificar: T01.

**Fase C: socket no servidor**
- **TM-10 Plugin.** Arquivo: `realtime/plugin.ts` (§1.1). Registrar após auth/prisma. Verificar: teste conecta com cookie válido e `app.close()` termina em menos de 2 s.
- **TM-11 Handshake e salas fixas.** Arquivos: `realtime/handshake.ts`, `realtime/handlers/index.ts` (`sincronizarSalasFixas`, timer de expiração, varredura de 5 min). Verificar: T02.
- **TM-12 Validação e limites.** Arquivos: `realtime/limites.ts` (limiters da §1.6), `realtime/validacao.ts` (`comValidacao`). Verificar: T07 (parte de validação).
- **TM-13 Entrar e sair de chamado.** Arquivo: `realtime/handlers/chamado.ts` (§1.4). Verificar: T03.
- **TM-14 Serviço de emissão.** Arquivo: `realtime/service.ts`. `emitirAssentamentos`, `emitirAssentamentoEditado`, `emitirAssentamentoRemovido`, `emitirChamadoAtualizado`, `emitirFila`, `emitirLeitura`, `emitirNotificacoes`, `emitirContagem`. Tipo `Publicador` e `publicadorNulo`. Verificar: T04 (partes de novo, editado e removido).
- **TM-15 Revogação.** `revalidarChamado`, `revalidarUsuario`, `encerrarSessao`, `encerrarSessoesDoUsuario`, ligados a logout, troca de senha e PUT de usuário (admin). Verificar: T05.
- **TM-16 Digitando.** Handlers `digitando`/`parou_digitar` e `disconnecting`. Verificar: T04 (digitando) e T07.

**Fase D: chat via REST**
- **TM-17 Eventos.** Arquivos: `modules/eventos/service.ts` (`registrarEvento(tx, {...})`), `modules/eventos/apos-commit.ts`. Verificar: teste unitário com `publicadorNulo`.
- **TM-18 Validação de menções.** Arquivo: `modules/assentamentos/mencoes.service.ts`. Verificar: T10.
- **TM-19 Mencionáveis.** `GET …/mencionaveis`. Verificar: T11.
- **TM-20 Timeline.** `GET …/assentamentos?antesDe&limite=100` → `{itens, temMaisAntigos}`, com privados filtrados e removidos redigidos. Verificar: T04 (versão REST).
- **TM-21 Criar comentário.** `POST …/assentamentos` (§2.3). Verificar: T08.
- **TM-22 Editar e remover.** PATCH, DELETE e GET de edições (§2.5). Verificar: T09.
- **TM-23 Seguidores.** Rotas de seguidores e auto-seguir na criação, no assumir, no encaminhar e no comentar (`modules/seguidores/service.ts`, `garantirSeguidor(tx, …)`). Verificar: testes da §5.2.
- **TM-24 Leitura.** POST leitura e GET leituras (§2.7). Verificar: T18 e T04 (leitura).

**Fase E: notificações**
- **TM-25 Regras.** Arquivo: `modules/notificacoes/regras.ts`, função pura `destinatarios(evento, contexto)` (§5.3). Verificar: um teste por linha da tabela.
- **TM-26 Fanout.** Arquivo: `modules/notificacoes/fanout.ts` (§5.4). Verificar: T12, T13, T14.
- **TM-27 Ligação com as ações do chamado.** Dep.: BASE-chamados. Cada ação (assumir, status, prioridade, encaminhar, agendar, encerrar, reabrir, anexar, criar) grava `registrarEvento` na transação e chama `aposCommitChamado`, com `acessoMudou` em encaminhar/assumir. Remover qualquer resto de `notifica`. Verificar: teste de integração por ação.
- **TM-28 Rotas de notificações.** Rotas da §5.11 e marcação como lida com renomeação de chave. Verificar: lista, cursor, contagem e grupo fechado após a leitura.
- **TM-29 Preferências.** Verificar: `inApp=false` em `mencao` dá 400; os padrões aparecem no GET.
- **TM-30 Jobs.** Arquivos: `jobs/eventos-varrer.ts`, `sla-verificar.ts`, `aceite-lembrete.ts`, `notificacoes-limpeza.ts`, registrados em `jobs/index.ts`. Verificar: T14 e T16, chamando as funções diretamente.
- **TM-31 E-mails.** Arquivos: `jobs/email-notificacao.ts`, `email-varrer.ts`, `email-resumo-diario.ts`, templates em `modules/notificacoes/email-templates.ts`. Verificar: T15.

**Fase F: presença**
- **TM-32 Cálculo.** Arquivo: `realtime/presenca-calculo.ts` (`calcularEstado`, pura). Verificar: tabela de casos.
- **TM-33 Serviço e rotas.** `realtime/presenca.ts` (`PresencaService`), handlers `presenca:atividade`/`assinar`, `PUT /api/me/presenca`. Verificar: T17.

**Fase G: busca**
- **TM-34 Busca.** Arquivos: `modules/busca/{sql.ts,service.ts,routes.ts}` (§6.3 e §6.4). Verificar: T19.

**Fase H: web**
- **TM-35 Socket e provider.** Arquivos: `src/realtime/socket.ts` (`io({path:'/socket.io', autoConnect:false, withCredentials:true})`, conecta no login e desconecta no logout), `RealtimeProvider.tsx` (regras da §1.7), banner "Reconectando…" após 3 s. Proxy do Vite com `ws:true`. Verificar: em dev, matar a API mostra o banner e religar recupera.
- **TM-36 Sala e envio otimista.** `useChamadoSala(id)`, que entra no mount e a cada `connect` e sai no unmount; `timeline/cache.ts` com `mesclarAssentamento`; `Composer` com envio otimista e reenvio. Verificar: T21 (cache) e envio com a rede derrubada no devtools.
- **TM-37 Menções na UI.** `TextoComMencoes.tsx` e `MentionAutocomplete.tsx`. Verificar: teste de renderização com `<img onerror>`, que deve aparecer como texto.
- **TM-38 Edição na UI.** Editar e remover com contagem regressiva de 15 min, "Mensagem removida" e histórico para staff. Verificar: o botão some após a janela.
- **TM-39 Digitando na UI.** `useDigitando` (throttle de 3 s, parada em 5 s) e `IndicadorDigitando`. Verificar: teste com timers falsos.
- **TM-40 Leitura na UI.** `useLeitura` (IntersectionObserver, aba visível, debounce de 1 s) e `VistoPor`. Verificar: teste de componente.
- **TM-41 Presença na UI.** `useAtividadeUsuario`, `usePresenca(ids)` (assina e reassina no `connect`), `PresencaDot` e `MenuStatus`. Verificar: alternar de aba por 5 min, com timer falso, leva a `ausente`.
- **TM-42 Atividade.** `AtividadePanel`, página `/atividade`, badge, título da aba, botão Seguir no cabeçalho do chamado. Verificar: um evento recebido atualiza o badge sem fetch.
- **TM-43 Desktop.** `features/atividade/desktop.ts` (§5.9) e botão de permissão. Verificar: T21 (desktop).
- **TM-44 Preferências na UI.** Página de preferências (tabela tipo × canal; desligar in-app desliga desktop e e-mail; mencao/atribuido travados). Verificar: salvar e recarregar mantém o estado.
- **TM-45 Ctrl+K.** `features/busca/CommandPalette.tsx` e `acoes.ts` (§6.5). Verificar: T21 (Ctrl+K) e navegação por teclado.
- **TM-46 e2e.** Se o Playwright estiver adotado: T22.
- **TM-47 Documentação.** README com proxy de websocket, instância única, `APP_ORIGIN`, HTTPS obrigatório para notificações desktop e os passos futuros de escala (§1.9).

Ordem: A → B → C (TM-10 a TM-13 primeiro) → D → E → F → G → H. F e G podem andar em paralelo com E depois de TM-09.

---

## 9. Riscos e pontos não verificados (sem acesso à documentação, só ao registro npm)
1. **`@@index` com `type: Gin` em campo `Unsupported("tsvector")`.** Há relato de uso na issue #14799, mas não confirmei. Fica coberto pela verificação de TM-08 e pelo Plano B.
2. **Opções do pg-boss 12** (`schedule(nome, cron, dados, { tz })`, `send(..., { startAfter, retryLimit, retryBackoff })`, regras de nome de fila). Vêm da memória; o Haiku deve conferir em `node_modules/pg-boss/dist/*.d.ts` antes de TM-30/31. O próprio pg-boss 12 diz ter adaptador para enfileirar dentro de transação Prisma, mas não achei a API, por isso o desenho usa a outbox `eventos_chamado`.
3. **Detalhes do Socket.IO:** `BroadcastOperator.volatile`, `.except()`, `RemoteSocket.leave()`, `io.close()` no `onClose` (padrão do fastify-socket.io) e `extraHeaders` no cliente Node. Vêm da memória e são fáceis de confirmar nos `.d.ts`.
4. **CSP:** se `connect-src 'self'` cobre `ws:`/`wss:` no mesmo host em todos os navegadores-alvo. Se o Safari falhar, acrescentar `wss://<host>` explícito.
5. **Android:** `new Notification()` lança erro sem Service Worker. Já está tratado com try/catch; push com o navegador fechado está fora do escopo.

Fontes: [Prisma 7.4, índices parciais](https://www.prisma.io/blog/prisma-orm-v7-4-query-caching-partial-indexes-and-major-performance-improvements) · [Changelog Prisma 2026-02-11](https://www.prisma.io/changelog/2026-02-11) · [Prisma v7 database features](https://www.prisma.io/docs/orm/v7/reference/database-features) · [Issue Prisma #14799 (tsvector/GIN)](https://github.com/prisma/prisma/issues/14799) · [Issue Prisma #24180 (drift)](https://github.com/prisma/prisma/issues/24180) · [Issue Prisma #10386](https://github.com/prisma/prisma/issues/10386) · [pg-boss no npm](https://npmjs.com/package/pg-boss) · README do `@socket.io/postgres-adapter` 0.5.0 e metadados do npm (`npm view`, 2026-10-21).

### Arquivos críticos para a implementação
- /home/user/vinimon/server.js (referência das regras atuais: `escopo` na linha 79, `carregaChamado` na 95, `acaoChamado` na 166, `notifica` com N+1 na 266, rotas de notificações em 376-387)
- /home/user/vinimon/public/app.js (`pollNotifs` em 51/60-68, que será substituído; timeline de `pgChamado` em 240-303)
- /home/user/vinimon/db.js (tabelas `assentamentos` e `notificacoes` atuais)
- apps/api/src/modules/chamados/escopo.ts (a criar: fonte única de autorização em TS/Prisma/SQL)
- apps/api/src/realtime/plugin.ts e packages/shared/src/realtime/eventos.ts (a criar: núcleo do tempo real e contrato tipado)
