> Parte A (fundamentos), §5. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 5. Segurança

### 5.1 Requisitos (S1…)

Cada requisito é verificável. "T##" remete ao checklist da seção 5.2 e é sempre um teste; os recursos estilo Teams se chamam TM1–TM8 (TM1 chat, TM2 presença, TM3 digitando, TM4 leitura, TM5 menções, TM6 feed, TM7 desktop, TM8 Ctrl+K).

**Repositório e configuração**
- **S1** `git rm --cached data/*.db*`, `.gitignore` da seção 3.12, código da v1 movido para `legado/v1/` (T01).
- **S2** O CI falha se `git ls-files` listar `*.db*`, `*.sqlite` ou `.env` (T01). Reescrever o histórico com `git filter-repo --path data --invert-paths` é decisão humana e está documentado em `SECURITY.md`.
- **S3** gitleaks no CI.
- **S4** `env.ts` valida com Zod e, em caso de erro, imprime só chaves e mensagens e sai com código 1 (T02). Em production exige:
  - `APP_ORIGIN` em https;
  - `TRUST_PROXY` presente;
  - `UPLOAD_DIR` absoluto;
  - segredos sem "troque" ou "changeme" (texto bruto ou decodificado de base64);
  - `API_DOCS=false`.
- **S5** `TRUST_PROXY` é `false` ou uma lista de IPs/CIDRs. `true` e número de saltos são recusados.
- **S6** `UPLOAD_DIR` nunca fica dentro de `WEB_DIST_DIR` nem de `apps/web/dist` (T48).

**Senhas e contas**
- **S7** Argon2id com `{ memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }`, sempre assíncrono. Sem importar o `const enum Algorithm`: em `lib/senha.ts`, omitir `algorithm`, porque o padrão do `@node-rs/argon2` 2.2.2 já é Argon2id com m=19456, t=2, p=1.
- **S8** Hash scrypt legado (`^[0-9a-f]{32}:[0-9a-f]{128}$`, salt como **string hex**) verificado com `promisify(scrypt)`. Se conferir, é regravado em argon2id na mesma requisição, com auditoria `senha.migrada` (T06).
- **S9** Login inexistente, inativo ou com hash null verifica contra um hash fictício. A resposta é sempre 401 "Login ou senha inválidos." (T07).
- **S10** Política de senha: de 12 a 128 caracteres, zxcvbn com score ≥ 3 (`userInputs`: login, nome, e-mail, "vinimon", organização), diferente da atual. Sem regras de composição nem expiração (T08).
- **S11** O seed de produção cria só o admin, com `deveTrocarSenha`. O `seed:dev` recusa production. O README não traz senhas (T09).
- **S12** O importador anula hashes de senhas padrão e lista os logins. `cli usuario:redefinir-senha <login>` gera senha temporária e força a troca (T10).
- **S13** Sessão em TROCA_SENHA só acessa `GET /auth/sessao`, `POST /auth/trocar-senha` e `POST /auth/logout`. O resto dá 403 `TROCA_SENHA_OBRIGATORIA` (T11).
- **S14** Login normalizado com `trim().toLowerCase()` e validado por `^[a-z0-9._@-]{3,64}$`. E-mail em minúsculas, UNIQUE (T12).
- **S15** A troca de senha exige a senha atual. Numa `$transaction`: grava o novo hash, revoga as **outras** sessões, gera token novo para a atual e audita (T20).
- **S16** Reset pelo admin: senha temporária mostrada uma vez, `deveTrocarSenha`, revogação de **todas** as sessões e auditoria.

**Sessões**
- **S17** Modelo `Sessao` (seção 4). Token de 32 bytes em base64url, só no cookie. O banco guarda só o sha256 (T18).
- **S18** Expiração absoluta `sessao.horasAbsoluta` (padrão 12, de 1 a 72). Inatividade `sessao.minutosInatividade` (padrão 60, de 15 a 480). Estados pendentes duram 10 min. `ultimoUsoEm` é atualizado no máximo a cada 60 s, e o heartbeat do socket não conta (T19).
- **S19** Rotação de token no fim do MFA e na troca de senha. Login cria sessão nova.
- **S20** Revogam todas as sessões e desconectam os sockets: reset, desativação, mudança de perfil ou área, ativação ou remoção de 2FA, "encerrar todas". **Reativar o usuário não revive sessões** (T21). Na Fase 2, toda revogação de sessões do usuário (S15, S16, S20, S31, S122) revoga também os tokens de API dele, na mesma transação (S132–S138).
- **S21** No máximo 10 sessões ativas; a 11ª revoga a mais antiga (T22).
- **S22** Cookie `__Host-vinimon_sid` (https) ou `vinimon_sid` (http): `{path:'/', httpOnly, secure em https, sameSite:'strict', maxAge até expiraEm}`, sem `domain`. O logout limpa com os mesmos atributos (T17).
- **S23** Cookie e `Authorization` juntos dão 400. Cookie malformado dá 401, nunca 500 (T23).
- **S24** Tela "Dispositivos conectados" (`GET/DELETE /auth/sessoes`, "encerrar todas").
- **S25** Job `sessoes-limpeza` (seção 3.10).

**2FA**
- **S26** Obrigatório para ADMIN e OPERADOR. Ordem dos estados: senha correta → PENDENTE_MFA (se já tem 2FA) → TROCA_SENHA (se `deveTrocarSenha`) → CADASTRO_MFA (se exigido e ainda sem 2FA) → ATIVA (T24, T68).
- **S27** Segredo de `generateSecret()` (otplib 13), cifrado com AES-256-GCM no formato `v1:<iv>:<tag>:<ct>` (T25).
- **S28** `verify({ secret, token, epochTolerance: 30, afterTimeStep: totpUltimoPasso ?? undefined })`; grava `result.timeStep` (só quando `r.valid && 'timeStep' in r`, porque o `verify` devolve a união TOTP|HOTP). Código `^\d{6}$`. 5 falhas revogam a sessão pendente e contam em `falhas_login` (T26).
- **S29** Cadastro: `iniciar` devolve `otpauthUri` (`generateURI({issuer: sistema.nome, label: login, secret})`) e `segredo`; `confirmar` ativa e devolve os códigos de recuperação **uma única vez**.
- **S30** 10 códigos de recuperação `XXXX-XXXX-XXXX-XXXX` (base32 Crockford), sha256, uso único. Regenerar invalida os anteriores. Usar um gera auditoria (T27).
- **S31** Resetar o 2FA de outro usuário exige a senha do admin, revoga as sessões do alvo e é auditado.

**CSRF, CORS e Content-Type**
- **S32** Toda mutação em `/api/v1` aceita só `Origin === APP_ORIGIN` ou, sem Origin, `Sec-Fetch-Site: same-origin`. Senão, 403 `ORIGEM_INVALIDA`. Vale também para o login (T28).
- **S33** `X-CSRF-Token = base64url(HMAC-SHA256(CSRF_SECRET, sessaoId))`, comparado com `timingSafeEqual`, em toda mutação autenticada. Vai no corpo do login e de `GET /auth/sessao`. O front guarda só em memória e repete a chamada uma vez quando recebe `CSRF_INVALIDO` (T28).
- **S34** `removeContentTypeParser('text/plain')`. Só JSON (e multipart nas rotas de upload, e `application/csp-report` na rota CSP). O resto dá 415 (T29).
- **S35** Sem `@fastify/cors`. Nenhuma resposta leva `Access-Control-Allow-Origin` (T30).
- **S36** Socket: Origin obrigatório e igual a `APP_ORIGIN` (T52).
- **S37** Dev: `APP_ORIGIN=http://localhost:5173` e proxy do Vite sem `changeOrigin`.

**Limites, bloqueio e proxy**
- **S38** `trustProxy` recebe exatamente o `TRUST_PROXY` parseado. Todo limite usa `request.ip` (T15).
- **S39** Rate limit global de 300/min com chave `u:<id>` ou `ip:<ip>`. Por rota:

| Rota | Limite | Chave |
|---|---|---|
| login | 10/min | IP |
| 2fa/verificar | 10/min | IP |
| upload | 30/h | usuário |
| busca | 60/min | usuário |
| trocar-senha | 5/h | usuário |
| CSP | 10/min | IP |
| comentário | 30/min | usuário |
| mencionáveis | 120/min | usuário |
| leitura | 120/min | usuário |
| contagens (`GET /chamados/contagens`) | 30/min | usuário |

  Excedido, a resposta é 429 `MUITAS_TENTATIVAS` (T16).
- **S40** Bloqueio persistido em `falhas_login`: 5 falhas do login em 15 min ou 30 do IP dão 429, igual para login existente ou não, **mesmo com a senha certa**. O sucesso apaga as falhas do login; o admin pode desbloquear. Cruzar o limite gera auditoria `login.bloqueado` (T13).
- **S41** `@fastify/under-pressure` com `maxEventLoopDelay: 1000` responde 503 `INDISPONIVEL`.
- **S42** Corpo limitado a 1 MiB (T14); `requestTimeout 120_000`; `headersTimeout 30_000`; `connectionTimeout 60_000`.

**Autorização**
- **S43** Toda rota `/api/v1` declara `config.acesso`. A checagem em `preValidation` nega rotas sem declaração (T41).
- **S44** Escopo só por `escopoChamados`/`podeVerChamado`/`podeVerInterno`/`podeAtender` (seção 3.5), usados em lista, detalhe, painel, relatórios, CSV, busca, feed, notificações, menções, sockets e anexos. `escopoChamados` (Prisma) e `podeVerChamado` (TS) devolvem sempre o mesmo conjunto, conferido por `apps/api/test/escopo-equivalencia.test.ts` (T-5.11, T33); toda tarefa que amplia o `ChamadoEscopo` (T-13.2, T-13.3, T-15.1, T-15.6) estende a fixture desse teste e o mantém verde.
- **S45** Sempre `AND: [escopoChamados(u), filtros]`. Proibido espalhar escopo e filtros no mesmo objeto. Nenhum filtro (`areaId`, `areaIds`, `operadorId`, `solicitanteId`) amplia o escopo, inclusive em relatórios, CSV de relatório e exportação de chamados (T34).
- **S46** Fora do escopo dá 404, igual a inexistente. O 403 é só para recurso visível com ação proibida (T33).
- **S47** Cada ação é uma rota própria e checa, nesta ordem: permissão, escopo, estado do chamado e versão.
- **S48** Ninguém desativa nem rebaixa a si mesmo. Remover o último ADMIN ativo dá 409, com a contagem feita dentro da transação (T39).
- **S49** Conteúdo interno (comentário, anexo, digitando, leitura, notificação, trecho) fica oculto do solicitante em qualquer perfil (T35). Vale também para os sinais derivados:
  - `ultimaAtividadeEm` só muda em evento público;
  - `qtdAnexos` conta só `interno=false` para quem não passa em `podeVerInterno`;
  - eventos internos não chegam ao solicitante pelo socket (S93);
  - tags são internas: `tagIds` sem `chamado.atender` dá 403 `SEM_PERMISSAO`, e alterar tags não chama `registrarSistema` (só o evento TAGS_ALTERADAS com `interno:true`, sem assentamento SISTEMA público).
- **S50** Abrir em nome de outro exige `chamado.abrirEmNome`. O alvo precisa estar ativo; OPERADOR não escolhe ADMIN. Grava `abertoPorId` e audita `chamado.abertoEmNome` (T38).
- **S51** Diretório de usuários só por `GET /usuarios/busca` (`usuario.buscar`, até 20 resultados, sem login para quem não é admin). Busca de ativos para USUARIO exige ≥ 3 caracteres e devolve só `{id, etiqueta, tipo}`. (Fase 2, T-17.8) `GET /usuarios/:id/avatar` só responde 200 se `alvo.id === u.id`, ou `temPermissao(u.perfil,'chamado.atender')`, ou o alvo é OPERADOR/ADMIN (mesma regra de `podeVerPresenca`). Nos demais casos, 404, igual a "sem avatar".
- **S52** Menção nunca concede acesso.
- **S53** Reavaliar salas de socket depois de encaminhar ou classificar (T56).

**Validação**
- **S54** Todo body usa `z.strictObject`; chave desconhecida dá 400. Toda rota declara `response`, e o serializer descarta campos extras (T36, T40).
- **S55** Mapeamento explícito para o Prisma. **Proibido `data: request.body`**. `omit` global para `senhaHash`, `totpSecretEnc`, `totpSecretPendenteEnc`, `tokenHash`, `codigoHash` e `buscaNorm` (T40).
- **S56** Limites em `packages/shared/src/limites.ts`:

| Campo | Limite |
|---|---|
| assunto | 3 a 150 |
| descrição | ≤ 20.000 |
| comentário | ≤ 10.000 |
| solução | ≤ 20.000 |
| nome | 2 a 120 |
| e-mail | `z.email()`, ≤ 254 |
| telefone | ≤ 30, `^[0-9+()\- ]*$` |
| contato | ≤ 120 |
| busca | 2 a 100 |
| nome de arquivo | ≤ 200 |
| cor | `^#[0-9a-fA-F]{6}$` |
| tag | 1 a 30 |
| motivo/justificativa | 5 a 2.000 |

- **S57** Paginação: `pagina` de 1 a 10.000, `porPagina` de 1 a 100 (T42).
- **S58** Datas com `z.iso.date()` e `z.iso.datetime()`. Período de relatório de até 366 dias.
- **S59** Erros no formato único da seção 3.3. Prisma mapeado (P2002 → 409, P2025 → 404, P2003 → 409/422, P2034 → 409). Com driver adapter o P2002 não traz `meta.target`: o campo de `detalhes` vem de `CAMPO_POR_INDICE[causa.constraint.index]` (`lib/erros.ts`). P2039 e P2010 são decididos por `causa.originalCode`: `23P01` → 409, `23514` → 422 `VALIDACAO` (§7, `plugins/erros.ts`). 500 sem stack nem SQL (T51).
- **S60** Só `$queryRaw`/`$executeRaw` com template marcado ou `Prisma.sql`. **Proibidos `$queryRawUnsafe` e `$executeRawUnsafe`**. `Prisma.raw` só com identificadores de lista fixa validados por `/^[a-z_][a-z0-9_]*$/`.
- **S61** `onProtoPoisoning: 'error'` e `onConstructorPoisoning: 'error'`. Consulta por chave vinda do cliente só com `z.enum`, `Map` ou `Object.hasOwn` (T32).
- **S62** `escaparLike()` em todo `contains` com texto livre (T62).

**Anexos**
- **S63** Autorizar **antes** de consumir o stream:
  - `anexo.enviar` e `podeVerChamado` (sem acesso dá 404);
  - chamado não encerrado (senão 409);
  - `anexos.habilitados` (senão 403);
  - cota de ≤ 50 arquivos e ≤ 100 MB por chamado (senão 413);
  - interno exige `podeVerInterno` (senão 403, sem nada no disco);
  - `assentamentoId`, se vier, existe com o mesmo `chamadoId` da rota, `autorId === u.id` e `criadoEm` ≥ agora − 10 min (senão 422 `REGRA_NEGOCIO`); o anexo herda `assentamento.interno`, ignorando o campo enviado (T47).
- **S64** Limites do multipart: `{fileSize: MAX_ANEXO_MB MiB (e ≤ anexos.tamanhoMaxMb), files: 5, fields: 5, fieldSize: 1024, parts: 10, headerPairs: 200}`. Excedido dá 413 (T44).
- **S65** Stream para `UPLOAD_DIR/tmp/<uuid>` com sha256, `fileTypeFromFile` e `rename` atômico. O temporário é apagado no `finally` (T44).
- **S66** Lista de tipos conferida pelo tipo **detectado**:

| Tipo detectado | Condição |
|---|---|
| png, jpg, gif, webp | — |
| pdf | — |
| docx, xlsx, pptx, odt, ods, odp, zip | — |
| `cfb` | extensão original .doc, .xls, .ppt ou .msg (servido como `application/octet-stream`) |
| não detectado (texto) | extensão .txt, .csv ou .log, UTF-8 válido (`TextDecoder` fatal) e sem byte NUL (servido como `text/plain; charset=utf-8`) |

  Qualquer outro tipo dá 415 `TIPO_ARQUIVO_INVALIDO`, inclusive svg, html, xml, js, exe, msi, bat e ps1 (T43).
- **S67** Chave `AAAA/MM/<uuid>` validada por regex, que aceita uuid de qualquer versão (inclusive o v8 determinístico `uuidLegado` dos anexos importados, §4.5). Caminho com `path.resolve` e conferido com `startsWith(UPLOAD_DIR + sep)` (T45).
- **S68** Nome original: NFC, sem `\x00-\x1F\x7F`, `/`, `\` nem `.`/`..` iniciais, até 200 caracteres. Usado só para exibição (T45).
- **S69** `UPLOAD_DIR` fora do webroot e do repositório. O `@fastify/static` serve só `WEB_DIST_DIR`.
- **S70** Download com:
  - `content-disposition` (`inline` só para png, jpeg, gif e webp);
  - `Content-Type` detectado e `nosniff`;
  - `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox`;
  - `Cross-Origin-Resource-Policy: same-origin` e `Cache-Control: private, no-store`;
  - envio por `createReadStream` (T46).
- **S71** Anexo interno: listar e baixar exigem `podeVerInterno` (sem acesso dá 404).
- **S72** O importador usa o mesmo pipeline.

**Cabeçalhos e front**
- **S73** CSP (NODE_ENV test e production), comparada por conjunto de diretivas:
  - `default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://<host>; media-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; worker-src 'self'; manifest-src 'self'; report-uri /api/v1/seguranca/csp; upgrade-insecure-requests`;
  - em http: `ws://` e sem `upgrade-insecure-requests` (T31).
- **S74** Outros cabeçalhos:
  - `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `nosniff`;
  - COOP e CORP `same-origin`;
  - HSTS `max-age=31536000` só em https;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- **S75** `POST /seguranca/csp` só registra log `warn`, com corpo ≤ 8 KB.
- **S76** Estáticos:
  - `index.html` com `no-cache` e `/assets/*` com `immutable`;
  - fallback da SPA só para GET fora de `/api` e `/socket.io`;
  - `/saude` devolve só `{ok:true}`.
- **S77** Nenhum `<script>` inline no HTML. `theme-init.js` aplica o tema e define `window.__zod_globalConfig = { jitless: true }`. Fontes locais, nenhuma CDN.
- **S78** Proibido `dangerouslySetInnerHTML` fora de `components/ui/**`, e proibido `innerHTML`. Markdown com `react-markdown` + `remark-gfm` sem `rehype-raw`. Links com `target="_blank" rel="noopener noreferrer nofollow"`. `urlTransform` aceita `usuario:` e, no resto, usa `defaultUrlTransform` (T67). Sem `<iframe>`, `<embed>` nem `<object>` no front (a CSP tem `frame-src 'none'` e `object-src 'none'`): a prévia de anexo é só para imagens.
- **S79** `redirect` do login só é aceito se casar `^/(?!/)[^\s\\]*$` (T70).
- **S80** Nada sensível em `localStorage`/`sessionStorage` (só tema, densidade, rascunho do novo chamado, recentes e preferências de painel). Chaves de dados do usuário levam o id: `vinimon:u<id>:rascunho:novo-chamado`, `vinimon:u<id>:recentes`. CSRF só em memória. O logout faz `queryClient.clear()`, chama `limparDadosDoUsuario()` (remove todas as chaves `vinimon:u*`) e desconecta o socket (T70).
- **S81** Produção com `build.sourcemap: 'hidden'`; devtools só em dev.
- **S82** CSV neutraliza fórmulas: células que começam com `[=+\-@\t\r]` ganham o prefixo `'`.

**Logs e auditoria**
- **S83** Redação do pino: `req.headers.cookie`, `req.headers.authorization`, `req.headers["x-csrf-token"]`, `res.headers["set-cookie"]`, `*.senha`, `*.senhaAtual`, `*.novaSenha`, `*.token`, `*.codigo`, `*.segredo`, `*.password`, com `[REDACTED]` (T49).
- **S84** Nunca logar corpo. Segredos nunca na querystring. `reqId` e `usuarioId` em cada linha.
- **S85** Proibido `console.log` em `apps/api/src` (checado no CI). 500 é logado com stack só no servidor.
- **S86** Tabela `auditoria`, somente inserção, garantida pelos triggers da §4.3 (T50):
  - `tg_auditoria_sem_update` (`BEFORE UPDATE ... FOR EACH STATEMENT`, função `f_auditoria_imutavel`): todo UPDATE lança 42501, mesmo com 0 linhas;
  - `tg_auditoria_delete` (`BEFORE DELETE ... FOR EACH ROW`, função `f_auditoria_delete`): só permite com `current_setting('vinimon.purga_auditoria', true) = 'on'` e `OLD.criado_em < now() - interval '365 days'`; senão lança 42501;
  - sem trigger de TRUNCATE (o `limparBanco` dos testes usa TRUNCATE).
- **S87** Eventos obrigatórios:
  - `login.sucesso`, `login.falha`, `login.bloqueado`, `logout`;
  - `sessao.revogada`;
  - `senha.alterada`, `senha.redefinida`, `senha.migrada`;
  - `mfa.ativado`, `mfa.removido`, `mfa.recuperacaoUsada`;
  - `usuario.criado`, `usuario.alterado` (com antes e depois);
  - `cadastro.criado`, `cadastro.alterado`, `cadastro.excluido`, `config.alterada`;
  - `chamado.abertoEmNome`, `exportacao.csv`, `anexo.excluido`.
- **S88** Job mensal de purga com mais de 365 dias (`SET LOCAL vinimon.purga_auditoria = 'on'`). A idade mínima também é imposta no banco, pelo trigger de DELETE de S86.
- **S89** Tela de auditoria filtrável e paginada.

**Tempo real**
- **S90** Configuração do servidor da seção 3.7. Payload acima de 16 KB derruba a conexão (T57).
- **S91** Handshake com a mesma `carregarSessao` da API, só estado ATIVA, sem Bearer, no máximo 10 sockets por usuário (T52).
- **S92** Salas definidas só pelo servidor. `chamado:entrar` checa escopo (T53).
- **S93** Conteúdo interno só na sala interna. O público vai sem o remetente. Evento com `interno=true` (COMENTARIO interno, TAGS_ALTERADAS, ANEXO_ADICIONADO/REMOVIDO interno) só emite `chamado:atualizado` para `salaChamadoInterno` e nunca chama `emitirFila`; `fila:atualizada` só é emitido com motivo ∈ {criado, atribuido, status, encaminhado, prioridade} (T54).
- **S94** Revalidação periódica e ganchos de revogação: queda em menos de 1 s após revogação (T55).
- **S95** Payloads Zod. Inválido recebe ack `payload_invalido` (`INVALIDO`) (T57).
- **S96** Limites por evento da seção 3.7 (T57).
- **S97** Presença `{usuarioId, estado}` sem IP nem horário. USUARIO só vê a equipe (T58).
- **S98** Leitura limitada ao último público para quem não vê interno (T54).
- **S99** Todo chat é gravado pela mesma service HTTP.

**Menções, feed, notificações e busca**
- **S100** Menções `@[Nome](usuario:ID)`, no máximo 20 por mensagem (21 dão 400). Só valem para ativos com `podeVerChamado`, e em interno também com `podeVerInterno`. As inválidas voltam em `mencoesIgnoradas` (T59).
- **S101** Destinatários filtrados por acesso. O ator fica de fora.
- **S102** Notificação sem texto de usuário (T61).
- **S103** O feed reaplica escopo e regra de interno na leitura. O `where` sai de uma função única, `whereNotificacoesVisiveis(u)`, usada também na contagem de não lidas (badge, `notificacao:contagem`, `GET /notificacoes/contagem` e contagem pós-fanout). Depois de encaminhar, as notificações não lidas de quem perdeu o acesso ao chamado são marcadas como lidas e a contagem é reemitida (`emitirContagem`) (T60).
- **S104** A notificação na área de trabalho nunca leva o texto. A permissão só é pedida por clique (T69).
- **S105** `notificacao:nova` só para `usuario:<id>`.
- **S106** Busca: chamados via escopo Prisma; número fora do escopo não aparece (T62).
- **S107** Busca: assentamento interno nunca aparece para o solicitante. USUARIO não busca pessoas (T62).
- **S108** Artigo INTERNO ou não publicado é invisível para USUARIO.

**Dependências**
- **S109** Versões exatas, lockfile commitado e `--frozen-lockfile` no CI.
- **S110** `prisma`, `@prisma/client` e `@prisma/adapter-pg` fixados em 7.10.1. Nunca `@latest` (T04).
- **S111** `pnpm audit --prod --audit-level=high` no CI.
- **S112** Renovate com `minimumReleaseAge` de 3 dias, sem automerge em produção.
- **S113** `minimumReleaseAge: 1440` e `allowBuilds` só para esbuild, prisma e @prisma/engines.
- **S114** Node 24 LTS. O serviço roda como usuário `vinimon` com `ProtectSystem=strict`.

**Banco, backup e deploy**
- **S115** Papéis `vinimon_migrator` (DDL) e `vinimon_app` (só DML no `public` e dono do schema `pgboss`).
- **S116** Postgres de dev só em `127.0.0.1`.
- **S117** Banco remoto com `sslmode=require`.
- **S118** TLS no Caddy, `TRUST_PROXY=<IP do Caddy>`, API em `127.0.0.1`.
- **S119** Backup diário com restic cifrado e retenção 7/4/12.
- **S120** Teste mensal de restauração (RPO 24 h, RTO 4 h).
- **S121** Erro de migração no deploy interrompe o restart.

**LGPD**
- **S122** "Anonimizar usuário" (ADMIN): nome, e-mail e telefone trocados por marcadores, sessões revogadas, histórico preservado. Na mesma transação:
  - nos chamados em que ele é solicitante, `contato` = "Usuário anonimizado #<id>", `contatoEmail` e `telefone` nulos;
  - nos assentamentos, os tokens de menção `@[Nome](usuario:<id>)` viram `@[Usuário anonimizado #<id>](usuario:<id>)`;
  - a auditoria não guarda o nome antigo. Depois de anonimizar, nenhuma coluna de `chamados` nem de `assentamentos` contém o nome ou o e-mail antigos.
- **S123** Retenção: `falhas_login` 24 h, notificações lidas 180 dias, auditoria 365 dias, logs com IP 90 dias.
- **S124** (Fase 2, T-17.8) `GET /me/exportar`, limitado a 1 por hora. Na revisão final do MVP (T-11.11), entra com status "Fase 2 (T-17.8)", que não conta como pendência.

**Fase 2 e 3 (aplicar quando o recurso entrar)**

Estes S# ficam fora do MVP (a revisão da T-11.11 cobre S1–S123; S124 consta como Fase 2, T-17.8); cada grupo indica a fase e a tarefa em que entra.
- **S125–S131 LDAP** (Fase 2, T-13.1; ldapts 9.2.0):
  - `ldaps://` ou StartTLS obrigatório, com CA configurada e `rejectUnauthorized`;
  - fluxo "buscar e depois fazer bind", com filtros em objetos (`EqualityFilter`), `sizeLimit: 2` e exatamente 1 resultado;
  - DN tirado da busca;
  - senha vazia recusada **antes** do bind;
  - `userAccountControl & 2` nega; papel vindo de `memberOf`;
  - a senha nunca é gravada; `unbind` no `finally`;
  - erro de LDAP responde igual a S9 e conta em S40;
  - sempre existe um admin local de emergência.
- **S132–S138 Tokens de API** (Fase 2, T-17.1 e T-17.2):
  - formato `vnm_` + 32 bytes em base62; o banco guarda só o sha256 e um prefixo de 8 caracteres;
  - escopos; validade obrigatória (padrão 90 dias, máximo 365);
  - escopo por rota: `GET /chamados` e `GET /chamados/:id` → `chamados:ler`; `POST /chamados` → `chamados:escrever`; `POST /chamados/:id/assentamentos` e `POST /chamados/:id/anexos` → `comentarios:escrever` (`interno=true` só se o dono passar em `podeVerInterno`);
  - permissão efetiva = permissões do dono ∩ escopos; dono inativo invalida o token;
  - `req.usuario` vindo de token = `{ ...dono, estado: 'ATIVA', sessaoId: null }` (`sessaoId: string | null` em `UsuarioSessao`); se `dono.deveTrocarSenha` ou (`exigeMfa(dono.perfil)` e `mfaAtivadoEm === null`), responde 401 `NAO_AUTENTICADO`;
  - toda revogação de sessões do usuário (troca de senha, redefinição pelo admin, reset de 2FA, "encerrar todas", mudança de perfil ou área, desativação, anonimização) revoga também os tokens dele: `revogarTokensDoUsuario(tx, usuarioId, motivo)` em `lib/token-api.ts` (`updateMany { revogadoEm: now }` + auditoria `token.revogado`), chamada na mesma transação de toda chamada a `revogarSessoesDoUsuario`. Após `POST /usuarios/:id/redefinir-senha`, `/resetar-2fa` ou `/anonimizar`, o token do alvo dá 401;
  - token não acessa auth, tokens, usuários, config, auditoria nem o socket;
  - só OPERADOR e ADMIN criam, e só para si; tudo auditado;
  - limite próprio por token.
- **S139–S145 E-mail** (saída na Fase 2, T-12.1 a T-12.3; entrada e link de avaliação na Fase 3, T-19.1 e T-19.4):
  - anti-loop: Auto-Submitted, Precedence, List-Id, remetentes do sistema; deduplicação por Message-ID;
  - remetente só é aceito com `dmarc=pass`; senão vai para a triagem;
  - respostas só pelo endereço `suporte+<id>.<hmac10>@`. Além de participante, o usuário do remetente precisa estar ativo e passar em `podeVerChamado` no momento do processamento; o comentário criado é sempre público (`interno=false`) e passa pelo mesmo service da T-6.3, com `clienteId` = uuid determinístico do Message-ID;
  - HMAC com separação de domínio: o `hmac10` do endereço de resposta e o link de avaliação (T-19.4) usam `hmacProposito(proposito: 'email-resposta' | 'avaliacao', valor) = createHmac('sha256', createHmac('sha256', CSRF_SECRET).update('vinimon:' + proposito).digest()).update(valor).digest()`, em `lib/cripto.ts`, nunca o `CSRF_SECRET` direto; um teste confere que propósitos diferentes geram valores diferentes;
  - só a parte texto é gravada;
  - anexos pelo pipeline S63–S68;
  - e-mails de saída nunca levam conteúdo interno ao solicitante;
  - cabeçalhos `Auto-Submitted: auto-generated`.

### 5.2 Checklist de testes de segurança

Ferramentas: **[V]** Vitest + `app.inject`, **[S]** socket.io-client (`listen({port:0})`, `transports:['websocket']`, `extraHeaders:{cookie, origin}`), **[P]** Playwright contra o build servido pela API (`NODE_ENV=test`, `APP_ORIGIN=http://localhost:3100`), **[CI]** pipeline.

**Repositório e configuração**
- **T01 [CI]** Sem `.db` nem `.env` versionados; gitleaks limpo.
- **T02 [V]** `env.ts` recusa, em production: http, `TRUST_PROXY=true`, falta de `TRUST_PROXY`, `CSRF_SECRET` curto, `ENCRYPTION_KEY` com tamanho diferente de 32 bytes, "troque" no valor decodificado e `API_DOCS=true`. A mensagem não contém valores.
- **T03 [CI]** Os greps do workflow voltam vazios.
- **T04 [CI]** `pnpm audit`; Prisma em 7.10.1 exata, sem pré-release.

**Senhas e login**
- **T05 [V]** Senha nova gravada como `$argon2id$v=19$m=19456,t=2,p=1$…`.
- **T06 [V]** Hash v1 gerado com `scryptSync(senha, saltHex, 64)`: senha correta passa, a coluna vira argon2id e surge a auditoria `senha.migrada`; senha errada não altera nada.
- **T07 [V]** Login inexistente e senha errada: mesmo status e mesmo corpo, com `verify` chamado 1 vez em cada caso. Num arquivo próprio, `apps/api/src/modules/auth/tempo-constante.test.ts`, com `vi.mock('@node-rs/argon2', { spy: true })` no topo e `import { verify } from "@node-rs/argon2"`; o teste confere `expect(vi.mocked(verify)).toHaveBeenCalledTimes(1)` para login inexistente e para senha errada (`vi.spyOn` no namespace do pacote CJS lança "Cannot redefine property").
- **T08 [V]** `senhaSchema` + zxcvbn recusam 11 caracteres, 129 caracteres, "vinimon2026!!", senha com o login e score < 3.
- **T09 [V]** Seed em production cria só o admin com `deveTrocarSenha`; `seed:dev` falha em production.
- **T10 [V]** O importador anula o hash de quem usa `admin123`.
- **T11 [V]** Sessão em TROCA_SENHA: `GET /chamados` dá 403 `TROCA_SENHA_OBRIGATORIA`; `trocar-senha` funciona.
- **T12 [V]** "ADMIN" é normalizado para "admin"; duplicata dá 409.

**Limites e bloqueio**
- **T13 [V]** A 6ª tentativa no mesmo login dá 429 mesmo com a senha certa (e também para login inexistente). Recuando `criadoEm` das falhas em 16 min, o login volta a funcionar.
- **T14 [V]** Login com 10.000 caracteres dá 400 e não grava falha; corpo de 2 MB dá 413.
- **T15 [V]** XFF ignorado sem `TRUST_PROXY`; respeitado com `TRUST_PROXY=127.0.0.1` e `remoteAddress` 127.0.0.1; ignorado com outro `remoteAddress`.
- **T16 [V]** A 11ª requisição de login no minuto dá 429; a 31ª falha do mesmo IP, em vários logins, dá 429.

**Sessões**
- **T17 [V]** Com `APP_ORIGIN=https://vinimon.test`: `Set-Cookie` com `__Host-vinimon_sid`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` e sem `Domain`.
- **T18 [V]** O cookie é diferente do `tokenHash` e `sha256(cookie) === tokenHash`.
- **T19 [V]** `expiraEm` no passado dá 401; inatividade de 61 min dá 401; `ultimoUsoEm` é atualizado no máximo a cada 60 s.
- **T20 [V]** Troca de senha na sessão A: B dá 401, A continua válida com cookie novo, o cookie antigo de A dá 401.
- **T21 [V]** Reset, desativação e mudança de perfil derrubam tudo; reativar não revive nada.
- **T22 [V]** Logout; "encerrar todas"; a 11ª sessão revoga a mais antiga.
- **T23 [V]** Cookie e Bearer juntos dão 400; `vinimon_sid=%E0` dá 401.

**2FA**
- **T24 [V]** OPERADOR sem 2FA cai em CADASTRO_MFA e `GET /chamados` dá 403 `MFA_PENDENTE`.
- **T25 [V]** Código gerado com otplib ativa; o segredo começa com `v1:` e não aparece em claro.
- **T26 [V]** Reuso do código no mesmo passo é recusado; 5 erros revogam a sessão.
- **T27 [V]** Código de recuperação funciona uma vez; regenerar invalida os antigos.

**CSRF, CORS e cabeçalhos**
- **T28 [V]** Retornam 403: sem Origin e sem Sec-Fetch-Site; Origin `https://evil.test`; Origin `null`; sem token; token de outra sessão. Com tudo correto, 2xx.
- **T29 [V]** `text/plain` com JSON válido dá 415.
- **T30 [V]** Nenhum `Access-Control-Allow-Origin`, nem no OPTIONS com Origin externo.
- **T31 [V]** CSP com o mesmo conjunto de diretivas de S73, mais os cabeçalhos de S74 (HSTS só em https).
- **T32 [V]** `{"__proto__":{"x":1}}` e `{"constructor":{"prototype":{}}}` dão 400; chave desconhecida dá 400.

**Autorização e atribuição em massa**
- **T33 [V]** Matriz: rotas de chamado × {solicitante USUARIO, outro USUARIO, OPERADOR da área, OPERADOR de área secundária, OPERADOR de outra área, OPERADOR responsável de outra área, ADMIN}. Fora do escopo é sempre 404. Equivalência (`apps/api/test/escopo-equivalencia.test.ts`, T-5.11): fixture com esses 7 atores e 12 chamados (área primária, secundária, outra área, operador responsável de outra área, solicitante OPERADOR, encerrado, cancelado); para cada ator, `ids(await prisma.chamado.findMany({ where: escopoChamados(u), select: { id: true } }))` é igual a `chamados.filter(c => podeVerChamado(u, c)).map(c => c.id)`.
- **T34 [V]** `?solicitanteId=<outro>` para USUARIO devolve só os próprios; painel, relatórios e CSV contam só o escopo. OPERADOR da área A, com fixture de chamados em A e B: os 8 tipos de `GET /relatorios/:tipo` e de `GET /relatorios/:tipo/csv` somam só A, e `areaId=<B>` ou `operadorId=<operador de B>` devolve totais 0; `GET /chamados/exportar` com `areaIds=<B>` devolve só BOM + cabeçalho; USUARIO na exportação dá 403.
- **T35 [V]** OPERADOR solicitante não vê comentário interno no detalhe, no feed, na busca nem nas notificações. Comentário interno não muda `ultimaAtividadeEm`, e `qtdAnexos` não conta anexo interno para o solicitante. USUARIO com `tagIds` dá 403; depois de alterar tags, `GET /chamados/:id/assentamentos` do solicitante não muda.
- **T36 [V]** `POST /chamados` com `statusId`, `operadorId`, `concluidoEm` ou extras dá 400; USUARIO com `solicitanteId` de outro dá 400 ou 403.
- **T37 [V]** `PATCH /me {perfil:'ADMIN'}` dá 400; operação em várias tabelas é transacional.
- **T38 [V]** OPERADOR em nome de ADMIN dá 403; em nome de USUARIO grava `abertoPorId`, auditoria e notificação.
- **T39 [V]** Último ADMIN dá 409; desativar ou rebaixar a si mesmo dá 409.
- **T40 [V]** `JSON.stringify` das respostas GET não contém `senhaHash`, `totpSecret`, `tokenHash`, `codigoHash` nem `buscaNorm`. Em `apps/api/test/vazamento-segredos.test.ts` (T-2.11): semear ADMIN com 2FA ativo (`totpSecretEnc`, 10 códigos de recuperação) e uma sessão; percorrer `app.rotasApi` com `metodo==='GET'` e `acesso!=='publico'`, substituindo `:id` pelo id do ADMIN e pulando as demais rotas com parâmetro; para cada rota, `inject` como ADMIN e `expect(res.body).not.toMatch(/senhaHash|senha_hash|totpSecret|tokenHash|token_hash|codigoHash|\$argon2id|^v1:/m)`. Como o teste lê `app.rotasApi`, as rotas criadas depois entram automaticamente.
- **T41 [V]** Toda rota `/api/v1` registrada tem `config.acesso`; uma rota de teste sem ele dá 403.
- **T42 [V]** `porPagina=-1` e `porPagina=1000` dão 400; data inválida dá 400.

**Anexos**
- **T43 [V]** PNG com extensão `.pdf` é gravado como `image/png`; HTML como `.png`, SVG, `MZ` e `.txt` com NUL dão 415; `.csv` UTF-8 é aceito.
- **T44 [V]** `MAX_ANEXO_MB` + 1 byte, 6 arquivos e cota de 100 MB dão 413; depois de cada falha, `tmp/` fica vazio.
- **T45 [V]** Nome `../../etc/passwd\r\n.png`: chave válida e nome exibido limpo.
- **T46 [V]** Cabeçalhos de S70.
- **T47 [V]** Anexo interno para o solicitante dá 404; anexo fora do escopo dá 404; `anexos.habilitados=false` dá 403; chamado encerrado dá 409; upload sem acesso dá 404 **sem gravar no disco**; USUARIO com `interno=true` dá 403 e nada vai para o disco; `assentamentoId` de outro chamado dá 422.
- **T48 [V]** `UPLOAD_DIR` nunca dentro de `dist`.

**Logs e auditoria**
- **T49 [V]** Logs capturados não contêm senha, cookie, token nem código TOTP, e `[REDACTED]` aparece.
- **T50 [V]** Eventos de S87 gravados com ator, IP e `requestId`; `UPDATE auditoria SET acao='x'` falha com 42501 mesmo com a tabela vazia; `DELETE` sem a GUC lança 42501; com a GUC ligada, `DELETE FROM auditoria WHERE criado_em > now() - interval '1 day'` lança 42501, e a purga de registros com mais de 365 dias funciona.
- **T51 [V]** 500 provocado devolve `{erro:{codigo:'INTERNO', requestId}}` sem stack.

**Socket.IO**
- **T52 [S]** Sem cookie, Origin externo, sessão PENDENTE_MFA ou Bearer: `connect_error` `NAO_AUTENTICADO` ou recusa.
- **T53 [S]** `chamado:entrar` fora do escopo dá `{ok:false}`, e o comentário seguinte não chega.
- **T54 [S]** Interno, `digitando` interno e leitura real não chegam ao solicitante, nem quando ele é OPERADOR; a equipe recebe. Depois de um comentário interno, o socket do solicitante OPERADOR não recebe `chamado:atualizado` nem `fila:atualizada`.
- **T55 [S]** Logout, troca de senha, desativação e revogação derrubam o socket em menos de 1 s; expiração com `SOCKET_REVALIDAR_MS=200` também.
- **T56 [S]** Encaminhar para outra área: o operador antigo recebe `chamado:acessoRevogado` e deixa de receber eventos.
- **T57 [S]** Payload de 20 KB derruba a conexão; payload inválido recebe `INVALIDO`; a 21ª `digitando` em 2 s é descartada; o 11º socket é recusado.
- **T58 [S]** USUARIO não recebe presença de outro USUARIO; o payload tem só `{usuarioId, estado}`.

**Menções, feed, notificações e busca**
- **T59 [V]** Menção sem acesso: `mencoesIgnoradas` e nenhuma notificação; USUARIO mencionado em interno: o mesmo; 21 menções dão 400.
- **T60 [V]** Depois de encaminhar, quem perdeu o acesso não vê mais o item no feed nem o trecho, e a contagem de não lidas (`GET /notificacoes/contagem` e `notificacao:contagem`) não o inclui.
- **T61 [V]** `notificacoes` não tem coluna de texto; o payload de `notificacao:nova` não traz o corpo.
- **T62 [V]** A busca não devolve chamado fora do escopo nem pelo número; não devolve interno ao solicitante; USUARIO não encontra pessoas; `%` não devolve tudo; "50%" encontra o chamado que contém "50%".

**Ponta a ponta**
- **T66 [P]** Todas as telas sem nenhum evento `securitypolicyviolation`.
- **T67 [P]** XSS armazenado no assunto, no comentário e em link `javascript:`: `window.__xss` continua indefinido.
- **T68 [P]** Primeiro acesso do admin: troca de senha → cadastro de 2FA → painel; cookie `httpOnly` e `sameSite: 'Strict'`.
- **T69 [P]** `Notification` simulado não recebe o texto; a permissão só é pedida depois do clique.
- **T70 [P]** `/login?redirect=//evil.test` termina em `/`; depois do logout, voltar não exibe dados, o socket está desconectado e não resta chave `vinimon:u*` no `localStorage`.
- **T71 [P]** Download com os cabeçalhos de T46; o app não carrega em iframe de outra origem.
- **T72 [P]** Inatividade de 1 min no ambiente de teste: depois de 61 s, a próxima ação leva ao login.
