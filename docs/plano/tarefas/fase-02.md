> Parte B (tarefas). Antes de executar qualquer tarefa leia `CLAUDE.md`, `docs/plano/tarefas/00-convencoes.md` e as seções da Parte A citadas no cartão (mapa §→arquivo em `docs/plano/README.md`).

### Fase 2 — Autenticação, sessões, 2FA e endurecimento

### T-2.1 — Força de senha (zxcvbn)
- **Depende de:** T-1.11 · **Paralelo com:** T-2.3
- **Requisitos:** S10; T08
- **Arquivos:** `apps/api/src/lib/forca-senha.ts`, `apps/api/src/lib/forca-senha.test.ts`
- **Passos:**
  1. `avaliarSenha(senha, e: EntradasForca): Promise<{ ok: boolean; score: number; dica: string | null }>`.
  2. Inicialização preguiçosa única (`@zxcvbn-ts/core` 4.x, que não exporta `zxcvbnOptions`; se a §2.2 fixar a 3.0.4, usar `zxcvbnOptions.setOptions(...)` com as mesmas opções e registrar a versão no commit): `import { ZxcvbnFactory } from '@zxcvbn-ts/core'; import * as common from '@zxcvbn-ts/language-common'; import * as ptBr from '@zxcvbn-ts/language-pt-br'; let fabrica: ZxcvbnFactory | undefined; const obter = () => (fabrica ??= new ZxcvbnFactory({ dictionary: { ...common.dictionary, ...ptBr.dictionary }, graphs: common.adjacencyGraphs, translations: ptBr.translations }));` e, em `avaliarSenha`, `const r = await obter().checkAsync(senha, userInputs)`.
  3. `userInputs = [login, nome, email, 'vinimon', organizacao]`. A senha é aceita com `ok = SenhaSchema.safeParse(senha).success && score >= 3`.
  4. Exportar também `validarNovaSenha(senha, e, hashAtual|null)`, que lança `ErroApp(400,'VALIDACAO', …, [{campo:'novaSenha', mensagem}])` quando a senha é fraca ou igual à atual (`verificarSenha`).
- **Pronto quando:**
  - [ ] T08: recusa 11 e 129 caracteres, `vinimon2026!!`, senha contendo o login e `"Senha123456!"`;
  - [ ] aceita `Cavalo-Bateria-Grampo-2026`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-2.2 — Seed seguro
- **Depende de:** T-2.1 · **Paralelo com:** T-2.3
- **Requisitos:** S11; T09; §4.4
- **Arquivos:** `apps/api/prisma/seed.ts`, `apps/api/test/seed.test.ts`
- **Passos:**
  1. Exportar `seedBase(tx, { catalogos }: { catalogos: boolean })`:
     - sempre: passos 1–5 da §4.4;
     - com `catalogos=true`: também os passos 6–7 (status e prioridades, só se a tabela estiver vazia).
     - **O importador (T-11.3) usa `catalogos:false`.**
  2. Exportar `seedInicial(tx)`, que faz os passos 8–9 e devolve a senha gerada ou `null`.
  3. `main()` roda `prisma.$transaction(async tx => { await seedBase(tx,{catalogos:true}); return seedInicial(tx) }, { timeout: 60_000 })`. Depois do commit, faz `process.stdout.write` uma única vez, com o quadro da §4.4.
  4. `SEED_ADMIN_PASSWORD` passa por `avaliarSenha`; se for fraca, `throw`.
  5. Executar `main` só quando `import.meta.url === pathToFileURL(process.argv[1] ?? '').href`.
- **Pronto quando:**
  - [ ] o teste roda o seed 2 vezes: as contagens não mudam, o admin tem `deveTrocarSenha=true`, há 9 status com papéis e 5 canais `sistema`;
  - [ ] a senha impressa autentica com `verificarSenha`;
  - [ ] `pnpm db:seed` no banco de dev imprime a senha;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** M

### T-2.3 — Cifra AES-GCM e TOTP
- **Depende de:** T-1.11 · **Paralelo com:** T-2.1, T-2.2
- **Requisitos:** S27, S28, S30
- **Arquivos:** `apps/api/src/lib/{cripto.ts,totp.ts,cripto.test.ts,totp.test.ts}`
- **Passos:**
  1. `cripto.ts`:
     - `cifrar(texto)` usa `aes-256-gcm` com chave `Buffer.from(env.ENCRYPTION_KEY,'base64')`, IV de 12 bytes e devolve `v1:<iv b64>:<tag b64>:<ct b64>`;
     - `decifrar(v)` valida o prefixo `v1:` e lança erro se a tag não conferir.
  2. `totp.ts` (otplib 13):
     - `gerarSegredo()`;
     - `uriOtpauth({ issuer, label, secret })` com `generateURI`;
     - `async verificarCodigo(secret, codigo, ultimoPasso)`: `^\d{6}$` e depois `const r = await verify({ secret, token: codigo, epochTolerance: 30, afterTimeStep: ultimoPasso ?? undefined }); return r.valid && 'timeStep' in r ? { valido: true, passo: r.timeStep } : { valido: false, passo: null }` (o `verify` devolve a união TOTP|HOTP; `timeStep` só existe no ramo TOTP);
     - `gerarCodigosRecuperacao()`: 10 códigos `XXXX-XXXX-XXXX-XXXX` em base32 Crockford (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), com `randomBytes`;
     - `hashCodigo(c)` = sha256 hex do código normalizado (sem hífens, maiúsculo).
- **Pronto quando:**
  - [ ] ida e volta de `cifrar`/`decifrar`;
  - [ ] alterar 1 byte do texto cifrado lança erro;
  - [ ] um código gerado com `generate({secret})` é aceito; reusado com `ultimoPasso` devolvido, é recusado;
  - [ ] 10 códigos únicos que casam com a regex;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** P

### T-2.4 — Auth: login, sessão e logout
- **Depende de:** T-2.2 · **Paralelo com:** —
- **Requisitos:** S9, S14, S17, S19, S22, S23, S26, S32, S33; T05–T07, T12, T14, T17, T18, T23; §3.6 (Auth), §7 (`estados.ts`, `service.entrar`, rota de login)
- **Arquivos:** `packages/shared/src/{modulos/auth.ts,index.ts}`, `apps/api/src/modules/auth/{estados.ts,schemas.ts,service.ts,routes.ts,auth.test.ts,tempo-constante.test.ts}`, `apps/api/src/app.ts`
- **Passos:**
  1. `modulos/auth.ts`:
     - `EntrarBodySchema` (§7);
     - `UsuarioMeSchema = {id, nome, login, email, telefone, perfil, areaId, areaIds, permissoes: z.array(z.enum(PERMISSOES)), mfaAtivo, deveTrocarSenha, tema, densidade, enviarComEnter}`;
     - `SessaoRespostaSchema = {estado, csrf, usuario: UsuarioMeSchema.nullable()}`;
     - `authApi = { entrar: POST /auth/login, sessao: GET /auth/sessao, sair: POST /auth/logout }`.
  2. `service.ts`:
     - `entrar` literal da §7;
     - `obterUsuarioMe(id)`;
     - `sair(ctx)`: `revogarSessao(sessaoId,'logout')` + auditoria `logout`.
  3. `routes.ts`:
     - login literal da §7;
     - `sessao` com `acesso:'autenticado'` e `estados:ESTADOS_SESSAO`, devolvendo `{estado, csrf: csrfDaSessao(u.sessaoId), usuario: estado==='ATIVA' ? me : null}`;
     - `logout` com todos os estados: `reply.clearCookie(NOME_COOKIE, opcoesLimparCookie())`, 204.
  4. Registrar `rotasAuth`.
- **Pronto quando:**
  - [ ] testes T05, T06 (com auditoria `senha.migrada`), T12, T14 (10.000 caracteres dão 400 sem linha em `falhas_login`; 2 MB dão 413), T17 (`buildApp` com `APP_ORIGIN=https://vinimon.test` via `vi.stubEnv` + `vi.resetModules`), T18, T23;
  - [ ] T07 num arquivo próprio `apps/api/src/modules/auth/tempo-constante.test.ts`, com `vi.mock('@node-rs/argon2', { spy: true })` no topo e `import { verify } from "@node-rs/argon2"`. O teste confere `expect(vi.mocked(verify)).toHaveBeenCalledTimes(1)` para login inexistente e para senha errada (não usar `vi.spyOn`: o namespace ESM do pacote CJS não é configurável);
  - [ ] USUARIO entra direto em `ATIVA`;
  - [ ] `pnpm verificar`.
- **Trilha:** C
- **Modelo:** Opus
- **Tamanho:** M

### T-2.5 — Bloqueio persistido, limites de taxa e expiração
- **Depende de:** T-2.4 · **Paralelo com:** —
- **Requisitos:** S18, S21, S38–S40; T13, T15, T16, T19, T22 (11ª sessão)
- **Arquivos:** `apps/api/test/bloqueio.test.ts`, `apps/api/test/sessao.test.ts`, `apps/api/src/app.ts` (ajuste do parse de `TRUST_PROXY`, se necessário)
- **Passos:**
  1. Só testes, com eventuais correções no código existente:
     - T13: depois de recuar `criadoEm` em 16 min (`prisma.falhaLogin.updateMany`), o login volta a funcionar;
     - T15: `app.inject({ remoteAddress, headers:{'x-forwarded-for'} })` com `TRUST_PROXY` `false` e `127.0.0.1`;
     - T16;
     - T19: `ultimoUsoEm` recuado 61 min dá 401; recuado 30 s não grava;
     - 11ª sessão: a mais antiga é revogada.
  2. Auditoria `login.bloqueado` ao cruzar 5 falhas.
- **Pronto quando:**
  - [ ] `pnpm -F @vinimon/api exec vitest run test/bloqueio.test.ts test/sessao.test.ts`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** P

### T-2.6 — 2FA no login: verificação e código de recuperação
- **Depende de:** T-2.4, T-2.3 · **Paralelo com:** —
- **Requisitos:** S19, S26, S28, S30; T24, T26, T27 (uso)
- **Arquivos:** `packages/shared/src/modulos/auth.ts`, `apps/api/src/modules/auth/{mfa.ts,routes.ts,mfa.test.ts}`
- **Passos:**
  1. `POST /auth/2fa/verificar` com body `z.strictObject({ codigo: z.string().regex(/^\d{6}$/) }).or(z.strictObject({ codigoRecuperacao: z.string().max(19) }))`, `acesso:'autenticado'`, `estados:['PENDENTE_MFA']` e `rateLimit` 10/min por IP.
  2. Fluxo:
     - TOTP: decifra o segredo e verifica com `totpUltimoPasso`;
     - recuperação: hash, busca com `usadoEm=null`, grava `usadoEm` e audita `mfa.recuperacaoUsada`;
     - sucesso: `estadoAposMfa`, `promoverSessao` (cookie novo), `totpUltimoPasso = passo` e `ultimoLoginEm` quando chegar em `ATIVA`;
     - falha: `falhasMfa+1` e uma linha em `falhas_login`. Na 5ª falha, `revogarSessao(id,'mfa_falhas')` e 401.
  3. A resposta é `SessaoRespostaSchema`.
- **Pronto quando:**
  - [ ] T24: OPERADOR sem 2FA fica em `CADASTRO_MFA`, e `GET /api/v1/areas` com ADMIN nesse estado dá 403 `MFA_PENDENTE`;
  - [ ] T26;
  - [ ] o código de recuperação funciona uma vez;
  - [ ] o cookie muda depois do 2FA;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-2.7 — 2FA: cadastro, confirmação, novos códigos e desativação
- **Depende de:** T-2.6 · **Paralelo com:** —
- **Requisitos:** S20, S26, S27, S29–S31; T25, T27
- **Arquivos:** `packages/shared/src/modulos/auth.ts`, `apps/api/src/modules/auth/{mfa.ts,routes.ts,mfa-cadastro.test.ts}`
- **Passos:**
  1. `POST /auth/2fa/iniciar` (estados `CADASTRO_MFA` e `ATIVA`): grava `totpSecretPendenteEnc` e devolve `{otpauthUri, segredo}`.
  2. `POST /auth/2fa/confirmar {codigo}`:
     - ativa o segredo (`totpSecretEnc`, `mfaAtivadoEm`), gera os 10 códigos e grava os hashes;
     - audita `mfa.ativado`;
     - revoga as **outras** sessões (S20) e promove a atual para `estadoAposTrocaSenha`/`ATIVA`;
     - devolve `{ codigos: string[], sessao: SessaoResposta }` uma única vez.
  3. `POST /auth/2fa/codigos {senha}` (`ATIVA`): invalida os códigos anteriores (`deleteMany`) e cria novos.
  4. `POST /auth/2fa/desativar {senha, codigo}`: só USUARIO (os demais recebem 403); revoga as outras sessões; audita `mfa.removido`.
- **Pronto quando:**
  - [ ] T25: o segredo no banco começa com `v1:` e não contém o base32 em claro;
  - [ ] T27: regenerar invalida os antigos;
  - [ ] OPERADOR tentando desativar recebe 403;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-2.8 — Troca de senha
- **Depende de:** T-2.7 · **Paralelo com:** —
- **Requisitos:** S10, S13, S15, S19, S20; T11, T20
- **Arquivos:** `packages/shared/src/modulos/auth.ts`, `apps/api/src/modules/auth/{service.ts,routes.ts,senha.test.ts}`
- **Passos:**
  1. `POST /auth/trocar-senha {senhaAtual, novaSenha}` (estados `TROCA_SENHA` e `ATIVA`, 5/h por usuário).
  2. Valida com `validarNovaSenha` antes da transação; o hash é calculado fora da transação.
  3. Na `$transaction`:
     - atualiza `senhaHash`, `deveTrocarSenha=false`, `senhaAlteradaEm`;
     - `revogarSessoesDoUsuario(tx,id,'troca_senha',sessaoAtual)`;
     - audita `senha.alterada`.
  4. Depois do commit: `desconectarSessoes`, `promoverSessao(atual, estadoAposTrocaSenha(u))` e `Set-Cookie`.
  5. A resposta é `SessaoRespostaSchema`.
- **Pronto quando:**
  - [ ] T11;
  - [ ] T20 (A continua com cookie novo, B dá 401, o cookie antigo de A dá 401);
  - [ ] senha atual errada dá 400 `VALIDACAO` no campo `senhaAtual`;
  - [ ] `pnpm verificar`.
- **Nota (Fase 2):** a partir da T-17.2, toda chamada a `revogarSessoesDoUsuario` desta tarefa passa a ser acompanhada de `revogarTokensDoUsuario` na mesma transação.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M

### T-2.9 — Dispositivos conectados
- **Depende de:** T-2.8 · **Paralelo com:** T-2.10, T-2.11
- **Requisitos:** S20, S24; T22
- **Arquivos:** `packages/shared/src/modulos/auth.ts`, `apps/api/src/modules/auth/{sessoes.ts,routes.ts,sessoes.test.ts}`
- **Passos:**
  1. `GET /auth/sessoes`: ativas do usuário, `{id, criadaEm, ultimoUsoEm, ip, userAgent, atual}`.
  2. `DELETE /auth/sessoes/:id` (`UuidParamsSchema`): de outra pessoa dá 404; audita `sessao.revogada`.
  3. `POST /auth/sessoes/encerrar-todas`: revoga todas, inclusive a atual, e limpa o cookie.
- **Pronto quando:**
  - [ ] T22;
  - [ ] a sessão de outro usuário dá 404;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-2.10 — CLI e seed de demonstração
- **Depende de:** T-2.7 · **Paralelo com:** T-2.9, T-2.11
- **Requisitos:** S11, S12, S16
- **Arquivos:** `apps/api/scripts/cli.ts`, `apps/api/prisma/seed-dev.ts`, `apps/api/scripts/cli.test.ts`
- **Passos:**
  1. `cli.ts` com `parseArgs`: `const args = process.argv.slice(2); if (args[0] === '--') args.shift(); const { values, positionals } = parseArgs({ args, options: { ... }, strict: true, allowPositionals: true })` (subcomando + login; o pnpm repassa o `--` ao script):
     - `usuario:redefinir-senha <login>` gera 16 caracteres aleatórios, grava o hash e `deveTrocarSenha=true`, revoga as sessões, audita `senha.redefinida` com ator SISTEMA e imprime a senha;
     - `totp:codigo <login>` recusa `NODE_ENV=production`, decifra o segredo e imprime `await generate({secret})`.
  2. `seed-dev.ts` conforme a §4.4:
     - sai com código 1 se `NODE_ENV=production`;
     - cria o operador com segredo TOTP já cadastrado (`totpSecretEnc`, `mfaAtivadoEm`);
     - imprime logins e senhas.
- **Pronto quando:**
  - [ ] o teste via `spawnSync` mostra que `seed-dev` com `NODE_ENV=production` sai com 1 (T09);
  - [ ] `cli usuario:redefinir-senha admin` imprime uma senha que autentica e deixa o estado em `TROCA_SENHA`;
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Haiku
- **Tamanho:** P

### T-2.11 — Endurecimento: rota CSP, rotas de teste e testes de cabeçalhos e logs
- **Depende de:** T-2.4 · **Paralelo com:** T-2.9, T-2.10
- **Requisitos:** S32–S35, S43, S61, S73–S75, S83, S84; T28–T32, T40, T41, T49, T51
- **Arquivos:** `apps/api/src/modules/seguranca/{service.ts,routes.ts}`, `apps/api/src/app.ts`, `apps/api/test/{seguranca.test.ts,logs.test.ts,vazamento-segredos.test.ts}`
- **Passos:**
  1. `POST /seguranca/csp`:
     - `config:{acesso:'publico', csrf:false, rateLimit:{max:10,timeWindow:'1 minute'}}` e `bodyLimit: 8192`;
     - parser `app.addContentTypeParser(['application/csp-report','application/reports+json'], { parseAs:'string', bodyLimit:8192 }, …)` **dentro do plugin da rota**;
     - o service faz `req.log.warn({ csp: resumo }, 'violação CSP')` e a rota responde 204.
  2. `app.ts`:
     - `OpcoesApp.rotasDeTeste?: FastifyPluginAsyncZod`, registrado **dentro** do escopo `/api/v1`, depois dos plugins;
     - antes do escopo, `const rotasApi: {metodo:string; url:string; acesso: unknown}[] = []; app.addHook('onRoute', r => { if (r.url.startsWith('/api/v1')) rotasApi.push({ metodo: String(r.method), url: r.url, acesso: r.config?.acesso }) })`;
     - `app.decorate('rotasApi', rotasApi)` com o `declare module` correspondente.
  3. Testes T28–T32, T41 (percorre `app.rotasApi`; uma rota de teste sem `acesso` dá 403) e T51 (rota de teste que lança `new Error('x')`).
  4. `logs.test.ts` (T49): `buildApp({ logger: { level:'info', stream } })` com stream em array. O redact entra por `REDACT`; para isso, exportar `REDACT` de `app.ts` e aplicá-lo também quando `opcoes.logger` for objeto.
  5. T40 (`vazamento-segredos.test.ts`): semear ADMIN com 2FA ativo (`totpSecretEnc`, 10 códigos de recuperação) e uma sessão. Percorrer `app.rotasApi` com `metodo==='GET'` e `acesso!=='publico'`, substituindo `:id` pelo id do ADMIN e pulando as demais rotas com parâmetro. Para cada rota, `inject` como ADMIN e `expect(res.body).not.toMatch(/senhaHash|senha_hash|totpSecret|tokenHash|token_hash|codigoHash|\$argon2id|^v1:/m)`. Como o teste lê `app.rotasApi`, as rotas criadas depois entram automaticamente.
- **Pronto quando:**
  - [ ] testes verdes;
  - [ ] T40 verde;
  - [ ] CSP em `NODE_ENV=test` com o mesmo **conjunto** de diretivas de S73 (compare por `Set`);
  - [ ] `pnpm verificar`.
- **Trilha:** A
- **Modelo:** Sonnet
- **Tamanho:** M
