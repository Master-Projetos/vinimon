> Relatório do especialista, copiado literalmente (referência). Em conflito vale a Parte A (`docs/plano/fundamentos/`), depois a Parte B (`docs/plano/tarefas/`), depois este relatório.

# Auditoria de segurança do Vinimon v1 e requisitos de segurança da v2

**O que foi verificado:**
- Li inteiros `/home/user/vinimon/server.js` (516 linhas), `/home/user/vinimon/db.js` (111), `/home/user/vinimon/public/app.js` (412) e `/home/user/vinimon/README.md`.
- Rodei `git ls-files` e passei `strings` nos arquivos WAL commitados.
- Testei em memória, com `node:sqlite` (Node v22.22.0 neste container), dois achados: `LIMIT -1` e o desvio da lista de permitidos por chave do protótipo. Os dois se confirmaram.
- Medi `scryptSync` com os parâmetros da v1: **58,6 ms por operação**.
- Consultei as versões com `npm view` em 2026-10-21.

Não rodei nada que alterasse o estado do repositório.

---

## 1. Achados no código atual

| # | Severidade | Local | Problema | Cenário concreto de exploração ou falha | Como a v2 resolve |
|---|---|---|---|---|---|
| F01 | **Crítico** | db.js:90-91, 106-109, 111; README.md:12-17 | Senhas padrão fixas e documentadas (admin/admin123, operador/operador123, usuario/usuario123). O seed roda sozinho sempre que `usuarios` está vazia. Nada obriga a trocar a senha. | Instalação nova na LAN: qualquer pessoa entra como `admin/admin123`, cria administradores, lê todos os chamados e anexos e muda a configuração. | SEN-5, SEN-6, SEN-7, MFA-1 |
| F02 | **Alto** | `git ls-files`: data/VINIMON.db, -wal, -shm e data/ocomon.db, -wal, -shm. Não existe .gitignore. | Os bancos estão versionados. Conferi os WALs: têm os 3 usuários do seed com hash scrypt (6 ocorrências `salt:hash` em ocomon.db-wal) e chamados de teste (8 e 2 registros "Chamado aberto"). Os anexos ficam como BLOB dentro do próprio banco (db.js:72-76). | (a) Quem lê o repositório leva os hashes para quebra offline, e eles correspondem às senhas padrão. (b) `git status` já mostra `data/VINIMON.db-shm` modificado só de rodar o app. Um `git commit -a` publica o banco de produção inteiro: chamados, anexos e hashes. (c) Um deploy por `git pull` sobrescreve o banco de produção ou entra em conflito com ele. | REP-1, REP-2, REP-3, UPL-6 |
| F03 | **Alto** | server.js:17, 28-33, 342, 346-349, 357-361; 65 e 449 (reset feito pelo admin) | As sessões ficam num `Map` em memória. (1) Trocar a senha (360) ou o admin redefini-la (65/449) **não derruba as outras sessões**. (2) Desativar o usuário só bloqueia pelo filtro `ativo=1` (32). A entrada fica no Map e **volta a valer se ele for reativado**. (3) Uma sessão expirada só é apagada se for usada de novo (31): não há varredura nem limite por usuário. (4) Só existe expiração absoluta, sem expiração por inatividade. (5) Não há "sair de todos os dispositivos". (6) Reiniciar o servidor desloga todo mundo. | Um atacante rouba o cookie ou entra com uma senha vazada. A vítima troca a senha, mas o atacante continua dentro por até `sessao_horas`, que pode chegar a 168 h (426). | SES-1 a SES-9, RT-6 |
| F04 | **Alto** | server.js:18, 331, 336, 339; 11 | O `Map` de falhas de login nunca é limpo (só apaga quando o login dá certo, 339). A chave inclui o **login enviado pelo cliente, sem limite de tamanho**, e o corpo aceita até 12 MB. | DoS sem autenticação: cerca de 200 `POST /api/login` com `{"login":"<12 MB aleatórios>"}` deixam ~2,4 GB presos nas chaves do Map. O heap estoura, o Node cai e todas as sessões (F03) se perdem. Variar o login também esgota a memória aos poucos. | RL-3 (tabela `falhas_login`, login ≤64), VAL-8 (bodyLimit 1 MiB) |
| F05 | Médio | server.js:331, 333, 336; README.md:31-32 | A chave do bloqueio usa `req.socket.remoteAddress`. Não há limite por IP. Depois de 5 min o contador volta a zero. | **Atrás do proxy recomendado no README**, todos os clientes saem com o IP do proxy, e qualquer pessoa bloqueia o `admin` com 5 erros a cada 5 min. **Sem proxy**, testar uma senha comum em todos os logins nunca dispara o bloqueio, e cada IP faz 1.440 tentativas por dia em cada login. | RL-1, RL-2, RL-3 |
| F06 | Médio | server.js:334-335; db.js:16-22 | Enumeração de logins por tempo de resposta: `!row \|\|` pula o scrypt, então um login inexistente responde em ~0 ms e um existente em ~58 ms. Além disso, `scryptSync` é síncrono e trava o event loop a cada tentativa. | O atacante mede o tempo de resposta, descobre os logins válidos e concentra o spraying neles. Rajadas de tentativas em logins existentes travam o servidor para todos. | SEN-1, SEN-3 |
| F07 | Médio | server.js:65, 359 | Política de senha fraca: mínimo de 6 caracteres, sem máximo, sem lista de senhas comuns. | "123456" é aceita. Junto com F05, o spraying funciona na prática. | SEN-4 |
| F08 | Médio | server.js:343, 466-467; README.md:31-32 | Sem HTTPS, cookie sem `Secure`, sem HSTS. | Num Wi-Fi ou numa LAN compartilhada, alguém captura o `POST /api/login` (a senha em claro) ou o cookie `sid` e sequestra a sessão. | SES-6, HDR-1, BKP-6 |
| F09 | Médio | server.js:489-493, 471-475 | O CSRF só confere o `Origin` **quando ele vem**. Não há token. O corpo é parseado como JSON **qualquer que seja o Content-Type**. `Origin: null` faz `new URL('null')` lançar exceção e devolver 500 em vez de 403. | Hoje só o `SameSite=Strict` (343) protege. Basta um cliente que omita o `Origin` (navegador antigo, extensão ou proxy que remove o cabeçalho) e um atacante no mesmo site (subdomínio irmão comprometido). Um `<form enctype="text/plain">` com JSON montado nos nomes dos campos chega a `/api/cad/usuarios` e cria um administrador. | CSRF-1 a CSRF-6 |
| F10 | Médio | server.js:371, 275; app.js:265 | A tela promete comentário "Privado (invisível ao solicitante)". O servidor, porém, só esconde de quem tem `nivel===3` (371) e só deixa de notificar `nivel>2` (275). | A operadora Ana (TI) abre um chamado para Manutenção. Os técnicos escrevem uma nota privada sobre ela. Ana vê a nota no histórico e ainda é notificada. O mesmo acontece quando um operador é escolhido como solicitante em "abrir em nome de". | AUTZ-9, NOT-2, RT-8 |
| F11 | Médio | server.js:142-146, 151; db.js:51-63 | Qualquer `nivel≤2` abre chamado em nome de **qualquer** usuário ativo, inclusive um administrador. Não existe coluna `aberto_por`: o único rastro é um texto num assentamento. | Um operador abre "liberar acesso administrativo para X" em nome da diretora. O chamado aparece como pedido dela nas listas e em "Relatórios › Por solicitante" (321), e ela recebe notificações de algo que nunca pediu. | AUTZ-10, AUD-2 |
| F12 | Médio | server.js:11, 471-478, 494; 135, 149, 356 | Corpo de até 12 MB em todas as rotas, inclusive `/api/login`, lido **antes** de qualquer autenticação, todo em buffer, com `JSON.parse` síncrono. Os anexos vão em base64, que soma 33%. Não há limite de tamanho em assunto, descrição, nome, contato ou telefone. | 50 POSTs simultâneos sem autenticação, de 12 MB cada, ocupam ~1,2 GB de buffers. Uma descrição de 12 MB fica gravada e é varrida por `LIKE` em toda busca (122). | VAL-4, VAL-8, VAL-11, UPL-1 |
| F13 | Médio | server.js:155-164, 388-399; app.js:200, 288; db.js:72-76 | O MIME é o que o cliente declara (162). Não há lista de tipos permitidos, nem checagem de magic bytes, nem cota. Os arquivos ficam como BLOB no banco. O download carrega o BLOB inteiro na memória (`SELECT *`, 390). | (a) Um usuário anexa `orcamento.pdf.exe` (ou `.docm` com macro) dizendo qualquer MIME. O arquivo é servido como download com o nome original e o operador executa. (b) Um `nivel 3` repete `acao: anexar` com 5 MB em loop, o banco e os backups crescem até lotar o disco e o serviço cai. | UPL-1 a UPL-11 |
| F14 | Médio | server.js:421-457, 353-363, 512 | Não existe trilha de auditoria. Mudanças em cadastros, papéis, senhas e configuração não ficam registradas. O único log é um `console.error` sem estrutura. | Uma conta admin comprometida (via F01) promove usuários e redefine senhas sem deixar rastro para investigação. | AUD-1 a AUD-5, LOG-1 a LOG-4 |
| F15 | Baixo | server.js:435, 438, 444, 453, 455 | A lista de entidades permitidas é consultada num objeto comum. `ENT['constructor']` e `ENT['__proto__']` são verdadeiros, e `exige(u, escrita['constructor']\|\|1)` compara `3 > Object` (resultado: falso), **então a checagem de permissão passa**. Testei e confirmei. | Um `nivel 3` manda `DELETE /api/cad/constructor/1` e chega a executar `DELETE FROM constructor` (500 "no such table"). Hoje não dá para explorar, mas a autorização depende de uma consulta frágil. | VAL-10, AUTZ-2 |
| F16 | Baixo | server.js:55, 61, 445-446 | Num PUT parcial, campo bool ausente vira `0`. A proteção contra se desativar só reconhece `ativo === false`. | `PUT /api/cad/usuarios/1 {"nivel":1}` desativa o próprio admin. Se for o único, o sistema fica sem administrador. | VAL-2, AUTZ-8 |
| F17 | Baixo | server.js:128 | `por=-1` vira `LIMIT -1`, que no SQLite significa sem limite (testei: devolveu 298 de 300 linhas). | `GET /api/chamados?por=-1` despeja todo o escopo, chamando `enriquece` em cada linha. Dashboard (292) e relatório (312) também carregam tudo. | VAL-5 |
| F18 | Baixo | server.js:97, 99; app.js:123 | Chamado inexistente responde 404, sem permissão responde 403. | Varrendo os números, o atacante descobre o volume e a faixa de numeração dos chamados. | AUTZ-5 |
| F19 | Baixo | server.js:23-27, 118-119, 305-306 | `decodeURIComponent` lança erro com cookie malformado e toda chamada à API vira 500. Com dois `sid`, vale o último. Data inválida lança `RangeError` e devolve 500. | Um subdomínio irmão grava `sid=%E0` com `Domain=.empresa` e a vítima fica com tudo em 500. Ou grava o próprio `sid` válido e a vítima trabalha, sem perceber, na conta do atacante (login CSRF). | SES-6 (`__Host-`), VAL-6 |
| F20 | Baixo | server.js:410, 412 | `/api/meta` entrega todos os equipamentos a qualquer usuário e todos os logins aos operadores. | Facilita o reconhecimento e o spraying (F05). | AUTZ-11 |
| F21 | Baixo | server.js:334; db.js:29 | A busca de login ignora maiúsculas (`lower(login)`), mas o UNIQUE diferencia. | O admin cria "Admin" além de "admin". O `.get()` devolve só o primeiro, e a identidade de quem entra fica ambígua. | SEN-8 |
| F22 | Baixo | server.js:353-361, 278 | O perfil grava nome e e-mail **antes** de conferir a senha atual (356 antes de 358). O nome é livre e aparece nas notificações. | A resposta é "Senha atual incorreta", mas a alteração já foi gravada. Um usuário se renomeia "Suporte TI" e engana os outros pelas notificações. | VAL-3, SEN-9, AUD-2 |
| F23 | Baixo | server.js:372, 163 | Anexos são sempre visíveis ao solicitante. Não existe anexo interno. | Um operador anexa um print com credenciais internas e o solicitante consegue baixar. | UPL-9 |
| F24 | Baixo | server.js:466-467, 394-398 | A CSP não define `base-uri`, `form-action` nem `object-src 'none'`. Não há Permissions-Policy. O download de anexo sai sem `Cache-Control`. | Anexos sensíveis ficam no cache de um computador compartilhado depois do logout. | HDR-1, UPL-8 |
| F25 | Baixo | server.js:147-152; 356-360 | Nada roda em transação. | Se o 2º anexo falhar, o chamado já foi criado mas o cliente recebe erro, tenta de novo e gera duplicata. | VAL-3 |
| F26 | Baixo | db.js:7; README.md:9 | O caminho do banco é relativo ao diretório atual, e o nome da variável no README (`OCOMON_DB`, `data/ocomon.db`) não bate com o código (`VINIMON_DB`, `./data/VINIMON.db`). | Iniciar o servidor de outro diretório (`node C:\vinimon\server.js`) cria em silêncio um banco novo, **já com as senhas padrão**. Configurar `OCOMON_DB` não tem efeito. | REP-4 |

**Itens conferidos que estão corretos (as tarefas da v2 não podem piorar nenhum deles):**
- SQL sempre parametrizado. Os nomes dinâmicos de tabela e coluna vêm de listas fixas (125, 435, 48).
- O LIKE escapa `%` e `_` (121, 417).
- Comentário privado não aparece para `nivel 3` (371) e não gera notificação para ele (275). A notificação reconfere o escopo (276-277).
- O download de anexo confere o escopo (392) e usa `nosniff`, CSP com `sandbox` e `attachment` para tipos fora da lista (393-397).
- O servidor de estáticos bloqueia path traversal (503-504).
- O front escapa tudo pelo template `h` (app.js:7-13). Não achei `raw` com dado de usuário (165 usa `esc`).
- O CSV neutraliza injeção de fórmula (app.js:37).
- Token de sessão de 256 bits (340), `timingSafeEqual` (db.js:21), cookie HttpOnly e SameSite=Strict (343).
- JSON sai com `no-store` (469).
- O usuário é recarregado a cada requisição, então mudança de papel vale na hora (32).

---

## 2. Requisitos de segurança da v2

Cada item tem um ID fixo para as tarefas citarem. "Teste:" remete à seção 3.

### REP: repositório, configuração e segredos
- **REP-1** Rodar `git rm --cached data/*.db data/*.db-wal data/*.db-shm` e criar `.gitignore` com: `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite*`, `.env`, `.env.*`, `!.env.example`, `storage/`, `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`.
- **REP-2** Job de CI `higiene`: falha se `git ls-files | grep -E '\.(db|db-wal|db-shm|sqlite)$|(^|/)\.env$'` devolver qualquer linha.
  - Reescrever o histórico **não é obrigatório**: só achei dados de demonstração (@exemplo.com).
  - Se o repositório for ficar público, rodar antes `git filter-repo --path data --invert-paths`. Registrar isso em `SECURITY.md`.
- **REP-3** gitleaks no CI (`gitleaks detect --no-banner --redact`), falhando o build quando achar algo.
- **REP-4** `apps/api/src/config/env.ts` valida o ambiente com Zod na inicialização. Se falhar, imprime **apenas o nome das chaves** e as mensagens e encerra com `process.exit(1)`. Variáveis:
  - `NODE_ENV` ∈ {development, test, production}.
  - `HOST` (padrão `127.0.0.1`) e `PORT` (padrão 3000).
  - `APP_ORIGIN`: URL sem barra no final. **Obrigatoriamente `https://` em production.**
  - `DATABASE_URL`: `postgresql://…`.
  - `TRUST_PROXY`: `"false"` ou uma lista de IPs/CIDRs separados por vírgula. O valor `"true"` é **rejeitado**. Obrigatória em production.
  - `CSRF_SECRET`: base64 com ≥32 bytes depois de decodificado.
  - `ENCRYPTION_KEY`: base64 com exatamente 32 bytes.
  - `UPLOAD_DIR`: absoluto em production e fora de `apps/web/dist`.
  - `MAX_ANEXO_MB`: inteiro de 1 a 25, padrão 10.
  - `LOG_LEVEL`, `SEED_ADMIN_PASSWORD` (opcional), `SMTP_URL` e `MAIL_FROM` (opcionais).
  - Grupo `LDAP_*`: ou todas as variáveis, ou nenhuma.
  - `SOCKET_REVALIDAR_MS`: padrão 60000.
  - Rejeitar qualquer segredo que contenha `troque` ou `changeme`.
- **REP-5** Commitar `.env.example` com valores `troque-me`, que por REP-4 falham em production.

### SEN: senhas, contas e seed
- **SEN-1** Argon2id com `@node-rs/argon2@2.2.2`.
  - Constante `ARGON2_PARAMS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }` (configuração mínima da OWASP).
  - **Não importar o `const enum Algorithm`**, que quebra com `isolatedModules`. O padrão da biblioteca já é Argon2id.
  - Hash e verificação sempre assíncronos (rodam no threadpool do libuv, sem travar o event loop).
  - `precisaRehash(hash)`: parsear o PHC com `^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$` e comparar com `ARGON2_PARAMS`. Se diferir, refazer o hash no próximo login.
- **SEN-2** Migração transparente do scrypt legado. Um hash que casa `^([0-9a-f]{32}):([0-9a-f]{128})$` é verificado assim:
  ```ts
  // v1 passava o salt como STRING hex (não Buffer.from(hex)), com os parâmetros padrão do Node (N=16384, r=8, p=1)
  const calc = await promisify(scrypt)(senha, saltHex, 64);
  ok = timingSafeEqual(calc, Buffer.from(hashHex, 'hex'));
  ```
  Se a senha confere, gravar o hash argon2id na mesma requisição e auditar `senha.migrada`. Nunca usar `scryptSync`.
- **SEN-3** Resposta uniforme no login. Login inexistente, inativo ou exclusivo de LDAP verifica a senha contra um `DUMMY_HASH`, gerado no boot a partir de `randomUUID()`. A resposta é sempre 401 `{"erro":"Login ou senha inválidos"}`.
- **SEN-4** Política de senha num `senhaSchema` em `packages/shared`, usado pelo front e pela API:
  - de 12 a 128 caracteres;
  - `@zxcvbn-ts/core@4.2.0` com `language-common` e `language-pt-br@4.1.1`, exigindo score ≥ 3, com `userInputs = [login, nome, email, "vinimon", organização]`;
  - nova senha diferente da atual;
  - sem regras de composição e sem expiração periódica.
- **SEN-5** Seed de produção:
  - Cria **somente** o admin, com `SEED_ADMIN_PASSWORD` (validada por SEN-4). Se a variável faltar, gera 20 caracteres aleatórios e imprime **uma única vez** no stdout.
  - Marca `deveTrocarSenha=true` e força o cadastro de 2FA.
  - `seed:dev` cria os usuários de demonstração e **se recusa a rodar** com `NODE_ENV=production`.
  - O README não traz nenhuma senha.
- **SEN-6** Importador da v1:
  - Lê o arquivo SQLite por um argumento da CLI, nunca do repositório.
  - Se o hash legado bater com `admin123`, `operador123`, `usuario123` ou `<login>123`, grava `senhaHash = null` (login impossível) e lista os logins afetados.
  - Criar o comando `pnpm --filter api cli usuario:redefinir-senha <login>`, que exige acesso ao servidor, imprime uma senha temporária e marca `deveTrocarSenha=true`.
- **SEN-7** Com `deveTrocarSenha`, a sessão fica no estado `TROCA_SENHA` (SES-1). Nesse estado só respondem `GET /api/auth/sessao`, `POST /api/auth/trocar-senha` e `POST /api/auth/logout`. O resto devolve 403 `{"codigo":"TROCA_SENHA_OBRIGATORIA"}`.
- **SEN-8** Login normalizado com `trim().toLowerCase()` e validado por `^[a-z0-9._-]{3,64}$`. É gravado já em minúsculas com índice UNIQUE. E-mail também em minúsculas, UNIQUE e anulável.
- **SEN-9** A troca de senha exige `senhaAtual`. Tudo roda numa única `$transaction`: grava o novo hash, revoga as **outras** sessões, gera token novo para a atual e audita. Se houver SMTP, avisa o usuário por e-mail.
- **SEN-10** Reset pelo admin: senha temporária, `deveTrocarSenha=true`, revogação de **todas** as sessões e auditoria.
  - "Esqueci minha senha" (só com SMTP e só para contas locais):
    - token de 32 bytes guardado como SHA-256, válido por 30 min e de uso único;
    - resposta sempre igual: "Se o login existir, enviaremos instruções";
    - limite de 3 por hora por IP e por login;
    - o reset revoga todas as sessões.

### SES: sessões e cookie
- **SES-1** Modelo `Sessao` (`@@map("sessoes")`) com os campos:
  - `id` uuid, `usuarioId`, `tokenHash` (char 64, UNIQUE);
  - `estado` ∈ {PENDENTE_MFA, CADASTRO_MFA, TROCA_SENHA, ATIVA};
  - `criadaEm`, `ultimoUsoEm`, `expiraEm` (absoluta), `revogadaEm?`, `motivoRevogacao?`;
  - `ip`, `userAgent` (truncado em 256).
- **SES-2** Token = 32 bytes de `randomBytes` em base64url, entregue só no cookie. O banco guarda **apenas** `sha256(token)` em hex, e a busca é feita pelo hash.
- **SES-3** Expiração:
  - **Absoluta:** `config.sessaoHorasAbsoluta`, padrão 12, entre 1 e 72.
  - **Por inatividade (deslizante):** `config.sessaoMinutosInatividade`, padrão 60, entre 15 e 480.
  - Estados pendentes duram no máximo 10 min.
  - `ultimoUsoEm` é atualizado no máximo uma vez a cada 60 s.
  - O heartbeat do Socket.IO **não** estende a sessão.
- **SES-4** Rotação e invalidação, todas auditadas:
  - **Login:** sessão nova.
  - **Fim do MFA e troca de senha:** token novo na mesma linha.
  - **Troca de senha:** revoga as outras sessões.
  - **Reset pelo admin, desativação, mudança de papel ou de área, ativação ou remoção de 2FA:** revoga todas e desconecta os sockets (RT-6).
  - **Logout:** revoga a atual.
  - **"Sair de todos os dispositivos":** revoga todas.
  - **Reativar o usuário não revive nenhuma sessão antiga.**
- **SES-5** No máximo 10 sessões ativas por usuário. A 11ª revoga a mais antiga.
- **SES-6** Cookie:
  - Com `APP_ORIGIN` em https: nome `__Host-vinimon_sid`, `{ path: '/', httpOnly: true, secure: true, sameSite: 'strict', maxAge: <segundos até expiraEm> }`, sem `domain`.
  - Em http (desenvolvimento e teste): nome `vinimon_sid`, `secure: false`.
  - O logout limpa o cookie com os mesmos atributos e `maxAge: 0`.
  - Os cookies são parseados por `@fastify/cookie@11.1.3`, sem parser próprio.
- **SES-7** A autenticação vem **ou** do cookie **ou** de `Authorization: Bearer`. Requisição com os dois recebe 400.
- **SES-8** Tela "Dispositivos conectados" apoiada em `GET /api/auth/sessoes`, `DELETE /api/auth/sessoes/:id` e `POST /api/auth/sessoes/encerrar-todas`. O admin pode revogar sessões de outros usuários (`sessao.revogarQualquer`).
- **SES-9** Job pg-boss de hora em hora apaga sessões expiradas ou revogadas há mais de 7 dias e registros de `falhas_login` com mais de 24 h.

### MFA: 2FA TOTP
- **MFA-1** Obrigatório para ADMIN e OPERADOR, sem opção de desligar. Fluxo do login:
  - senha correta → `PENDENTE_MFA` se já cadastrado, ou `CADASTRO_MFA` se não;
  - em seguida, `TROCA_SENHA` se aplicável;
  - por fim, `ATIVA`.
- **MFA-2** Segredo gerado por `generateSecret()` do `otplib@13.5.0` (API v13 funcional; não usar exemplos da v12). Fica cifrado com AES-256-GCM e `ENCRYPTION_KEY`, no formato `v1:<iv12 b64>:<tag b64>:<ct b64>`.
- **MFA-3** Verificação com `verify({ secret, token, epochTolerance: 30, afterTimeStep: usuario.totpUltimoPasso ?? undefined })`.
  - Em caso de sucesso, gravar `result.timeStep` em `totpUltimoPasso` (anti-replay).
  - O código é validado por `^\d{6}$`.
  - 5 falhas na mesma sessão pendente revogam a sessão e contam em `falhas_login`.
- **MFA-4** Cadastro:
  - `POST /api/auth/2fa/iniciar` grava `totpSecretPendenteEnc` e devolve a URI `otpauth` (issuer = nome do sistema, label = login) e o QR em SVG (`qrcode@1.5.4`, `toString(uri,{type:'svg'})`).
  - `POST /api/auth/2fa/confirmar {codigo}` ativa o segredo e devolve os códigos de recuperação **uma única vez**.
- **MFA-5** Códigos de recuperação:
  - 10 códigos de 16 caracteres em base32 Crockford, no formato `XXXX-XXXX-XXXX-XXXX`;
  - guardados como SHA-256, de uso único (`usadoEm`);
  - gerar novos invalida os anteriores;
  - usar um gera auditoria e e-mail.
- **MFA-6** Resetar o 2FA de outro usuário exige a senha do admin, revoga as sessões do alvo e é auditado.
- **MFA-7** Contas de LDAP também seguem MFA-1. O TOTP é local.

### CSRF e CORS
- **CSRF-1** Hook `onRequest` em todo POST/PUT/PATCH/DELETE de `/api/*` autenticado por cookie, **inclusive `/api/auth/login`**:
  - aceita se `Origin === APP_ORIGIN`;
  - sem `Origin`, aceita só se `Sec-Fetch-Site === 'same-origin'`;
  - em qualquer outro caso, 403 `{"erro":"Origem não permitida"}`.
- **CSRF-2** Token sincronizador sem estado: `csrf = base64url(HMAC-SHA256(CSRF_SECRET, sessao.id))`.
  - Vai no corpo de `GET /api/auth/sessao` e da resposta do login.
  - O front guarda **só em memória** e envia `X-CSRF-Token` em toda mutação.
  - Comparação com `timingSafeEqual`. Só o login fica isento.
  - Diante de 403 `CSRF_INVALIDO`, o front busca a sessão de novo e repete a chamada uma vez.
- **CSRF-3** `fastify.removeContentTypeParser('text/plain')`. Aceitar só `application/json` e, nas rotas de upload, `multipart/form-data`. Os demais tipos recebem 415.
- **CSRF-4** Requisições com Bearer pulam CSRF-1 e CSRF-2 e nunca leem cookie.
- **CSRF-5** No Socket.IO, conferir o `Origin` no `allowRequest` (RT-2).
- **CSRF-6** Em desenvolvimento, `APP_ORIGIN=http://localhost:5173`, com o proxy do Vite repassando `/api` e `/socket.io` sem reescrever o `Origin`.
- **CORS-1** **Não registrar `@fastify/cors`.** Tudo é same-origin. Nenhuma resposta, nem a de OPTIONS, leva `Access-Control-Allow-Origin`.

### RL: limite de taxa, bloqueio e proxy
- **RL-1** `trustProxy` recebe exatamente o `TRUST_PROXY` parseado: `false` ou a lista de IPs/CIDRs. Proibido `true` e número de saltos. Todo limite usa `request.ip`.
- **RL-2** `@fastify/rate-limit@11.2.1` com:
  - `global: true, max: 300, timeWindow: '1 minute', hook: 'preHandler'`;
  - `keyGenerator`: `u:<usuarioId>`, depois `t:<tokenId>`, por fim `ip:<request.ip>`;
  - 429 `{"erro":"Muitas requisições. Aguarde e tente novamente."}`.
  - A autenticação é resolvida no `onRequest`, antes do limitador.
  - Limites por rota (`config.rateLimit`):

  | Rota | Limite | Chave |
  |---|---|---|
  | login | 10/min | IP |
  | 2fa/verificar | 10/min | IP |
  | upload | 30/hora | usuário |
  | busca | 60/min | usuário |
  | trocar-senha | 5/hora | usuário |
  | esqueci-senha | 3/hora | IP |
  | relatório CSP | 10/min | IP |
- **RL-3** Bloqueio persistido na tabela `falhas_login(id, loginNormalizado varchar(64), ip, criadoEm)`, com índices `(loginNormalizado, criadoEm)` e `(ip, criadoEm)`.
  - Antes de verificar a senha:
    - ≥5 falhas do login nos últimos 15 min → 429 "Muitas tentativas para este login. Tente novamente em 15 minutos.", **igual para login existente ou não**;
    - ≥30 falhas do IP nos últimos 15 min → 429.
  - Sucesso apaga as linhas daquele login. O admin pode desbloquear (também apaga as linhas).
  - Ao cruzar o limite, auditar `login.bloqueado`.
- **RL-4** `@fastify/under-pressure` com `maxEventLoopDelay: 1000` responde 503. A rota de saúde fica isenta.
- **RL-5** Limites do Socket.IO (RT-10).

### AUTZ: RBAC e autorização por recurso
- **AUTZ-1** `packages/shared/src/permissoes.ts` define:
  - o enum `Papel` {ADMIN, OPERADOR, USUARIO}, que mapeia os níveis 1, 2 e 3 da v1;
  - o tipo `Permissao` e a tabela fixa `PERMISSOES_POR_PAPEL`;
  - a função `tem(u, p)`.
  - Papéis e permissões:
    - **USUARIO:** `chamado.abrir`, `chamado.comentar`, `chamado.encerrarProprio`, `chamado.reabrirProprio`, `anexo.enviar`, `faq.ver`, `perfil.editar`.
    - **OPERADOR:** tudo do USUARIO, mais `chamado.abrirEmNome`, `chamado.verArea`, `chamado.verInterno`, `chamado.comentarInterno`, `chamado.assumir`, `chamado.alterarStatus`, `chamado.alterarPrioridade`, `chamado.encaminhar`, `chamado.agendar`, `chamado.encerrar`, `chamado.reabrir`, `relatorio.ver`, `inventario.ver`, `inventario.gerenciar`, `faq.gerenciar`, `usuario.buscar`, `tokenApi.gerenciarProprios`.
    - **ADMIN:** tudo do OPERADOR, mais `chamado.verTodos`, `cadastro.gerenciar`, `usuario.gerenciar`, `config.gerenciar`, `auditoria.ver`, `sessao.revogarQualquer`.
- **AUTZ-2** Toda rota declara `config: { permissao: '<p>' }` ou `config: { publica: true }`.
  - Um `onRoute` guarda o registro e um `preHandler` global **nega** qualquer rota `/api` sem uma das duas declarações (fail-closed).
  - `config.estados` (padrão `['ATIVA']`) restringe por estado da sessão.
- **AUTZ-3** `apps/api/src/autorizacao/chamados.ts` é a **única** fonte de escopo:
  ```ts
  escopoChamados(u): Prisma.ChamadoWhereInput
  // verTodos → {}
  // verArea  → { OR: [ ...(u.areaId ? [{ areaId: u.areaId }] : []), { operadorId: u.id }, { solicitanteId: u.id } ] }
  // senão    → { solicitanteId: u.id }
  podeVerChamado(u, c)
  podeVerInterno(u, c)  // tem(u,'chamado.verInterno') && c.solicitanteId !== u.id && podeVerChamado(u, c)
  podeExecutar(u, c, acao)
  ```
  Usada obrigatoriamente em: lista, detalhe, painel, relatórios, CSV, busca Ctrl+K, feed, notificações, menções, sockets, anexos e e-mail.
- **AUTZ-4** O escopo é **sempre** combinado com `AND: [escopoChamados(u), filtros]`. **Proibido** espalhar os dois no mesmo objeto (`{...escopo, solicitanteId: q.x}`), porque o filtro sobrescreveria o escopo e abriria um IDOR.
- **AUTZ-5** Recurso fora do escopo devolve **404** "não encontrado", igual ao inexistente. O 403 fica só para recurso visível com ação não permitida.
- **AUTZ-6** O chamado mantém id inteiro (é o número que o usuário vê). Anexo, assentamento, notificação, sessão e token usam uuid. Mesmo assim, tudo passa por autorização.
- **AUTZ-7** Cada ação é uma rota própria (`POST /api/chamados/:id/assumir`, etc.) e checa permissão, depois escopo, depois o estado do chamado. USUARIO só encerra e reabre se for o solicitante.
- **AUTZ-8** Ninguém desativa nem rebaixa a si mesmo. Também não é possível remover o último ADMIN ativo: a contagem é feita dentro da `$transaction`, com 409.
- **AUTZ-9** Conteúdo interno (comentário, anexo, "digitando", confirmação de leitura, notificação, trecho exibido) fica **oculto do solicitante em qualquer papel**, por `podeVerInterno`. Isso corrige F10.
- **AUTZ-10** Abrir em nome de outro:
  - exige `chamado.abrirEmNome`;
  - o alvo precisa estar ativo, e OPERADOR não pode escolher um ADMIN;
  - grava a coluna `abertoPorId`, notifica o alvo e audita `chamado.abertoEmNome`;
  - a interface mostra "Aberto por X em nome de Y".
- **AUTZ-11** Diretório de usuários:
  - `GET /api/usuarios/busca?q=` (`usuario.buscar`), q com 2 a 50 caracteres, até 20 resultados;
  - devolve `id`, `nome` e `areaNome`; `login` só para ADMIN;
  - não existe endpoint que liste todos os usuários para quem não é admin.
  - Equipamentos para o USUARIO: busca por etiqueta com ≥3 caracteres, devolvendo só `id`, `etiqueta` e `tipo`. Listagem completa exige `inventario.ver`.

### VAL: validação e atribuição em massa
- **VAL-1** `fastify-type-provider-zod@7.0.0`, com `validatorCompiler` e `serializerCompiler`. Toda rota tem `params`, `querystring`, `body` **e `response`**: o serializer descarta campos não declarados.
- **VAL-2** Corpos definidos com `z.strictObject(...)` (Zod 4.6.7). Chave desconhecida dá 400.
- **VAL-3** Mapeamento explícito dos campos para o Prisma. **Proibido `data: request.body`**.
  - `omit` global no client: `usuario: { senhaHash, totpSecretEnc, totpSecretPendenteEnc }`, `sessao: { tokenHash }`, `tokenApi: { tokenHash }`, `codigoRecuperacao: { codigoHash }`.
  - Toda operação que mexe em várias linhas usa `$transaction`, o que corrige F22 e F25.
- **VAL-4** Limites em `packages/shared/src/limites.ts`:

  | Campo | Limite |
  |---|---|
  | assunto | 3 a 150 |
  | descrição | ≤ 20.000 |
  | comentário/chat | ≤ 10.000 |
  | solução | ≤ 20.000 |
  | nome | 2 a 120 |
  | e-mail | `z.email()`, ≤ 254 |
  | telefone | ≤ 30, `^[0-9+()\- ]*$` |
  | contato | ≤ 120 |
  | busca | 2 a 100 |
  | nome de arquivo | ≤ 200 |
  | cor | `^#[0-9a-fA-F]{6}$` |
- **VAL-5** Paginação:
  - `pagina` inteiro de 1 a 10.000; `porPagina` inteiro de 1 a 100, padrão 25 (corrige F17);
  - feed e chat paginam por cursor;
  - exportação: até 5.000 linhas, em stream, e auditada.
- **VAL-6** Datas com `z.iso.date()` e `z.iso.datetime()`. Intervalo de relatório de no máximo 366 dias.
- **VAL-7** Tratamento de erros:
  - ZodError → 400 `{erro:"Dados inválidos", campos:[{caminho,mensagem}]}`, sem repetir valores;
  - P2002 → 409, P2025 → 404, P2003 → 400;
  - demais → 500 `{erro:"Erro interno do servidor", requestId}`, sem stack nem SQL.
- **VAL-8** `bodyLimit: 1_048_576` global. O multipart tem limites próprios (UPL-1).
- **VAL-9** Só `$queryRaw` e `$executeRaw` com template marcado ou `Prisma.sql`. **Proibidos** `$queryRawUnsafe` e `$executeRawUnsafe`.
- **VAL-10** Declarar explicitamente `onProtoPoisoning: 'error'` e `onConstructorPoisoning: 'error'`. Qualquer consulta por chave vinda do cliente usa `z.enum`, `Map` ou `Object.hasOwn` (corrige F15).
- **VAL-11** `requestTimeout: 120_000`, `server.headersTimeout = 30_000`, `connectionTimeout: 60_000`.

### UPL: anexos
- **UPL-1** `@fastify/multipart@10.1.4` com `limits: { fileSize: MAX_ANEXO_MB*1024*1024, files: 5, fields: 5, fieldSize: 1024, parts: 10, headerPairs: 200 }`. Arquivo acima do limite → 413.
- **UPL-2** Autorizar **antes** de consumir o stream:
  - `anexo.enviar`;
  - `podeVerChamado`;
  - chamado não encerrado (senão 409);
  - `config.permitirAnexos` ligado (senão 403);
  - cota por chamado: ≤50 arquivos e ≤100 MB no total (senão 413).
- **UPL-3** Gravação:
  - stream para `${UPLOAD_DIR}/tmp/<uuid>`, calculando SHA-256 no caminho;
  - tipo detectado com `fileTypeFromFile` do `file-type@22.2.0`;
  - em caso de sucesso, `rename` para a chave final; em qualquer falha, apagar o temporário no `finally`.
- **UPL-4** Lista de tipos permitidos, conferida pelo tipo **detectado** (o MIME do cliente é ignorado):

  | Tipo detectado | Condição extra | Servido como |
  |---|---|---|
  | png, jpg, gif, webp | — | MIME da imagem |
  | pdf | — | `application/pdf` |
  | docx, xlsx, pptx, odt, ods, odp, zip | — | MIME correspondente |
  | `cfb` | extensão original .doc, .xls, .ppt ou .msg | `application/octet-stream` |
  | não detectado (texto) | extensão .txt, .csv ou .log; `TextDecoder('utf-8',{fatal:true})` válido; sem byte NUL | `text/plain; charset=utf-8` |

  Qualquer outro tipo dá 415 "Tipo de arquivo não permitido". Isso inclui explicitamente svg, html, xml, js, exe, msi, bat, ps1 e o que mais não estiver na lista.
- **UPL-5** Chave de armazenamento `AAAA/MM/<uuid>`, sem extensão, validada por `^\d{4}/\d{2}/[0-9a-f-]{36}$`. O caminho é resolvido com `path.resolve` e conferido com `startsWith(UPLOAD_DIR + sep)`.
- **UPL-6** `UPLOAD_DIR` fica fora do webroot e do repositório. Padrões: `./storage/anexos` em desenvolvimento (ignorado no git) e `/var/lib/vinimon/anexos` em produção. O `@fastify/static` serve só `apps/web/dist`. Atrás da interface `StorageAnexos`, a implementação de disco é a padrão e a de S3 vem depois.
- **UPL-7** Nome original:
  - normalizado com `normalize('NFC')`;
  - removidos `\x00-\x1F\x7F`, `/`, `\` e as sequências iniciais `.`/`..`;
  - truncado em 200 caracteres;
  - usado **apenas** para exibição e no `Content-Disposition`.
- **UPL-8** Download `GET /api/anexos/:id`:
  - `Content-Disposition` gerado por `content-disposition@3.0.0` (`inline` só para png, jpeg, gif e webp; `attachment` para o resto);
  - `Content-Type` = tipo detectado;
  - `X-Content-Type-Options: nosniff`;
  - `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox`;
  - `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, no-store`;
  - envio por `fs.createReadStream`, sem buffer inteiro.
- **UPL-9** `Anexo.visibilidade` ∈ {PUBLICA, INTERNA}. INTERNA exige `chamado.comentarInterno` para enviar e `podeVerInterno` para listar e baixar (corrige F23).
- **UPL-10** O importador da v1 grava os BLOBs pelo mesmo caminho de UPL-3. Tipo fora da lista vira `application/octet-stream`, sempre como `attachment`.
- **UPL-11** Os anexos chegados por e-mail (MAIL-6) passam pelo mesmo pipeline.

### HDR e FRONT: cabeçalhos e SPA
- **HDR-1** `@fastify/helmet@13.2.0` com `useDefaults: false` e CSP **exata**, aplicada com NODE_ENV test ou production:
  ```
  default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss://<host de APP_ORIGIN>;
  media-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none';
  form-action 'self'; worker-src 'self'; manifest-src 'self'; report-uri /api/seguranca/csp; upgrade-insecure-requests
  ```
  - Usar `ws://` no lugar de `wss://` e omitir `upgrade-insecure-requests` quando `APP_ORIGIN` for http.
  - `'unsafe-inline'` **só em estilos**: Radix (react-remove-scroll) e sonner injetam `<style>`. `script-src` continua estrito.
- **HDR-2** Outros cabeçalhos:
  - `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`;
  - `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`;
  - `Strict-Transport-Security: max-age=31536000` só com https;
  - cabeçalho manual `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- **HDR-3** `POST /api/seguranca/csp`: rota pública, limite de taxa, corpo ≤ 8 KB, só grava log (`warn`).
- **HDR-4** Estáticos: `index.html` com `Cache-Control: no-cache`; `/assets/*` com `public, max-age=31536000, immutable`; fallback da SPA só para GET fora de `/api` e `/socket.io`; `GET /api/saude` devolve só `{ok:true}`.
- **FRONT-1** Nenhum `<script>` inline no `index.html`. O tema escuro é aplicado por `public/theme-init.js`. Fontes locais via `@fontsource-variable/*`. Nenhuma CDN.
- **FRONT-2** Proibido `dangerouslySetInnerHTML` (ESLint `react/no-danger: error`) e `innerHTML`. Markdown via `react-markdown` + `remark-gfm`, **sem `rehype-raw`**, com o `urlTransform` padrão e links `target="_blank" rel="noopener noreferrer nofollow"`.
- **FRONT-3** Chamar `z.config({ jitless: true })` no início do front, porque o Zod 4 tenta `new Function`, que a CSP bloqueia. (Não verificado aqui: confirmar o nome da opção na versão fixada.)
- **FRONT-4** O parâmetro `redirect` do login só é aceito se casar `^/(?!/)[^\s\\]*$`. Fora disso, vai para `/`.
- **FRONT-5** Nada sensível em `localStorage` ou `sessionStorage`. O token CSRF fica só em memória e a persistência do TanStack Query fica desligada. O logout faz `queryClient.clear()` e desconecta o socket.
- **FRONT-6** Produção com `build.sourcemap: 'hidden'`. Devtools só em desenvolvimento.
- **FRONT-7** A exportação CSV mantém a neutralização de fórmulas da v1 (`^[=+\-@\t\r]` ganha o prefixo `'`).

### LOG e AUD: logs e auditoria
- **LOG-1** pino 10.4.0 (o logger do Fastify) com:
  ```
  redact: { paths: ['req.headers.cookie','req.headers.authorization','req.headers["x-csrf-token"]',
    'res.headers["set-cookie"]','*.senha','*.senhaAtual','*.novaSenha','*.token','*.codigo','*.totp',
    '*.segredo','*.password'], censor: '[REDACTED]' }
  ```
- **LOG-2** Nunca logar corpo de requisição ou resposta. Segredos nunca vão na querystring. Cada linha leva `reqId` (gerado por `randomUUID`, `requestIdHeader: false`) e `usuarioId`.
- **LOG-3** Proibido `console.log` em `apps/api/src` (o CI checa por grep). Erro 500 é logado com stack apenas no servidor.
- **LOG-4** Logs com IP são retidos por 90 dias.
- **AUD-1** Tabela `auditoria`:
  - campos `id`, `criadoEm`, `atorTipo` (USUARIO, TOKEN ou SISTEMA), `atorId?`, `acao`, `entidade`, `entidadeId?`, `ip`, `userAgent` (256), `requestId`, `dados` (Json, só o diff e sem segredos);
  - índices `(criadoEm)` e `(entidade, entidadeId)`.
- **AUD-2** Eventos obrigatórios:
  - `login.sucesso`, `login.falha` (com o login truncado), `login.bloqueado`, `logout`;
  - `sessao.revogada`;
  - `senha.alterada`, `senha.redefinida`, `senha.migrada`;
  - `mfa.ativado`, `mfa.removido`, `mfa.recuperacaoUsada`;
  - `usuario.criado`, `usuario.alterado` (papel, área, ativo, nome e e-mail com antes e depois);
  - `cadastro.*`, `config.alterada`;
  - `token.criado`, `token.revogado`;
  - `chamado.abertoEmNome`, `exportacao.csv`, `relatorio.gerado`.
- **AUD-3** Tabela somente de inserção, garantida por migration SQL:
  ```sql
  CREATE FUNCTION auditoria_imutavel() RETURNS trigger AS $$ BEGIN
    IF TG_OP='DELETE' AND current_setting('vinimon.purga_auditoria', true)='on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'auditoria é somente inserção'; END $$ LANGUAGE plpgsql;
  CREATE TRIGGER trg_auditoria_imutavel BEFORE UPDATE OR DELETE ON auditoria FOR EACH ROW EXECUTE FUNCTION auditoria_imutavel();
  ```
- **AUD-4** Job mensal: `$transaction` com `SET LOCAL vinimon.purga_auditoria='on'` apaga registros com mais de 365 dias.
- **AUD-5** Tela de auditoria (`auditoria.ver`) com filtros por ator, ação, entidade e período, paginada.

### RT: Socket.IO 4.8.4 (chat, presença, "digitando…", confirmação de leitura)
- **RT-1** Servidor criado com `maxHttpBufferSize: 65_536`, `pingInterval: 25000`, `pingTimeout: 20000`, `connectionStateRecovery` desligado e sem `cors`.
- **RT-2** `allowRequest`:
  - rejeita se `req.headers.origin !== APP_ORIGIN`;
  - limita a 30 conexões por minuto por IP (o `req.ip` vem do mesmo `trustProxy`).
- **RT-3** Middleware `io.use`:
  - parseia o cookie de `socket.request.headers.cookie` e valida a sessão com **a mesma função da API HTTP**;
  - exige estado `ATIVA`;
  - grava `socket.data = { usuarioId, sessaoId, papel, areaId, expiraEm }`;
  - em caso de erro, `next(new Error('nao_autenticado'))`;
  - no máximo 5 sockets por usuário (o 6º recebe `limite_conexoes`).
  - Token Bearer **não** abre socket.
- **RT-4** Salas, sempre definidas pelo servidor e nunca pelo cliente:
  - `usuario:<id>` e `sessao:<id>`, entradas no connect;
  - `chamado:<id>`, via o evento `chamado:entrar {chamadoId}`, depois de `podeVerChamado`;
  - `chamado:<id>:interno`, só se `podeVerInterno`;
  - `equipe`, só para OPERADOR e ADMIN.
- **RT-5** Revalidação: a cada `SOCKET_REVALIDAR_MS`, juntar os `sessaoId` dos sockets locais, consultar os válidos de uma vez e chamar `disconnect(true)` nos inválidos (expirados por tempo absoluto ou por inatividade, revogados).
- **RT-6** Ganchos de revogação:
  - SES-4 chama `io.in('sessao:<id>').disconnectSockets(true)`, ou `usuario:<id>` quando revoga todas;
  - mudança de papel ou área desconecta todos os sockets do usuário.
- **RT-7** Depois de `encaminhar` ou de qualquer mudança em `areaId`, `operadorId` ou `solicitanteId`, chamar `reavaliarSalas(chamadoId)`:
  - `fetchSockets()` nas duas salas do chamado;
  - quem perdeu `podeVerChamado` sai das duas e recebe `chamado:acessoRevogado`;
  - quem perdeu `podeVerInterno` sai da sala interna.
- **RT-8** Roteamento do conteúdo interno:
  - mensagem, anexo, `chamado:digitando {interno:true}` e confirmações de leitura de itens INTERNA vão **só** para `chamado:<id>:interno`;
  - o público vai para `chamado:<id>`, menos o remetente.
- **RT-9** Todo payload é validado com Zod (`packages/shared/src/eventos.ts`), com resposta por ack `{ok:false, erro:'payload_invalido'}`. Evento desconhecido é ignorado. Toda mensagem de chat é gravada pela **mesma** service HTTP, com a mesma autorização.
- **RT-10** Limites por socket (token bucket em memória, limpo no `disconnect`):

  | Evento | Limite | Ao estourar |
  |---|---|---|
  | `chat:mensagem` | 20 a cada 10 s | ack `limite_excedido` |
  | `chamado:digitando` | 1 a cada 2 s | descarta em silêncio |
  | `presenca:definir` | 10/min | ack `limite_excedido` |
  | `chamado:entrar` | 30/min | ack `limite_excedido` |
- **RT-11** Presença:
  - payload `{usuarioId, status:'online'|'ocupado'|'ausente'}`, sem IP e sem horário exato;
  - presença global só na sala `equipe`; dentro do chamado, só para quem está em `chamado:<id>`.
- **RT-12** Confirmação de leitura via `leituras(usuarioId, chamadoId, ultimoAssentamentoLidoId, lidoEm)`. A exposição segue AUTZ-9.

### NOT: menções, feed de Atividade e notificações
- **NOT-1** Menções:
  - o editor insere `@[Nome](usuario:<uuid>)`; o servidor extrai só IDs, no máximo 20 por mensagem;
  - cada menção vale só se o usuário estiver ativo, se `podeVerChamado(mencionado)` e, em mensagem INTERNA, se `podeVerInterno(mencionado)`;
  - menções inválidas viram texto sem notificação e voltam em `mencoesIgnoradas` para a interface avisar "Fulano não tem acesso a este chamado";
  - **menção nunca concede acesso**.
- **NOT-2** Destinatários: participantes e mencionados, filtrados por `podeVerChamado` e, para conteúdo interno, por `podeVerInterno`. O autor da ação fica de fora.
- **NOT-3** A notificação guarda só `{usuarioId, chamadoId, assentamentoId?, tipo, atorId, criadoEm, lidaEm?}`, **sem texto**.
- **NOT-4** `GET /api/atividade` (feed, cursor `(criadoEm,id)`) reaplica tudo **na leitura**:
  - `chamado: escopoChamados(u)`;
  - se o usuário não tem `chamado.verInterno`: `visibilidade:'PUBLICA'`;
  - se tem: `OR:[{visibilidade:'PUBLICA'},{visibilidade:'INTERNA', chamado:{solicitanteId:{not:u.id}}}]`;
  - trecho de até 140 caracteres montado na hora, e só se visível.
- **NOT-5** Notificação na área de trabalho:
  - permissão pedida **só** depois de clique em "Ativar notificações";
  - `new Notification('Chamado #123', { body: '<Autor> mencionou você' | '<Autor> comentou', tag: 'chamado-123' })`;
  - **nunca** inclui o texto da mensagem, porque fica visível na tela de bloqueio.
- **NOT-6** O evento `notificacao:nova` vai só para `usuario:<id>`, com o mesmo payload sem texto.
- **NOT-7** E-mails (nodemailer 10.1.7):
  - texto simples ou HTML gerado com escape, sem HTML vindo de usuário;
  - o solicitante nunca recebe conteúdo interno;
  - cabeçalhos `Auto-Submitted: auto-generated` e `X-Auto-Response-Suppress: All`;
  - links só para `APP_ORIGIN`, sem token (salvo o de reset, SEN-10).

### BUS: busca global (Ctrl+K)
- **BUS-1** `GET /api/busca?q=` com q de 2 a 100 caracteres, limite de RL-2 e no máximo 5 resultados por categoria.
- **BUS-2** Chamados:
  - `findMany({ where: { AND: [escopoChamados(u), { OR: [{ id: num }, { assunto: { contains: q, mode: 'insensitive' } }, { descricao: … }] }] } })`;
  - índices GIN `pg_trgm` criados via migration SQL;
  - **sem SQL cru**, para não duplicar o escopo;
  - número fora do escopo simplesmente não aparece.
- **BUS-3** Categorias:
  - assentamentos: só de chamados no escopo, aplicando AUTZ-9;
  - usuários: só com `usuario.buscar` (campos de AUTZ-11);
  - FAQ: só publicada;
  - equipamentos: conforme AUTZ-11.
- **BUS-4** Teste obrigatório de curingas: buscar `%` ou `_` não pode devolver tudo. Se o `contains` do Prisma não escapar curingas (não verificado aqui), escapar `[\\%_]` antes de montar a consulta.

### API: tokens de API
- **API-1** Formato `vnm_` + 32 bytes em base62. A interface mostra o token **uma única vez**. O banco guarda `tokenHash = sha256` e `prefixo` (8 caracteres) para identificação.
- **API-2** Campos:
  - `usuarioId` (dono);
  - `escopos`, de {`chamados:ler`, `chamados:escrever`, `cadastros:ler`, `inventario:ler`, `inventario:escrever`};
  - `expiraEm` obrigatória (padrão 90 dias, máximo 365);
  - `revogadoEm?`, `ultimoUsoEm`, `ultimoIp`.
- **API-3** Permissão efetiva = permissões do dono ∩ mapeamento dos escopos. O escopo de dados (AUTZ-3) é o do dono, revalidado a cada requisição: dono inativo invalida o token.
- **API-4** Token não acessa `/api/auth/*`, `/api/tokens*`, `/api/admin/usuarios*`, `/api/config*`, `/api/auditoria*` nem o Socket.IO.
- **API-5** Só OPERADOR e ADMIN criam tokens, e só para si. O ADMIN pode revogar qualquer token. Criação e revogação são auditadas.
- **API-6** Limite próprio por token (RL-2, chave `t:`). Comparação pelo hash, sem diferença de tempo observável.
- **API-7** O OpenAPI (`@fastify/swagger`) fica atrás de autenticação de ADMIN em produção.

### LDAP: AD/LDAP com ldapts 9.2.0
- **LDAP-1** `new Client({ url: 'ldaps://…', timeout: 10000, connectTimeout: 5000, tlsOptions: { ca: [LDAP_CA], rejectUnauthorized: true } })`. Também aceita `ldap://` com StartTLS obrigatório. **Proibido** LDAP sem TLS em produção.
- **LDAP-2** Fluxo "buscar e depois fazer bind":
  - bind com a conta de serviço;
  - busca com **objetos de filtro** (`new AndFilter({ filters: [new EqualityFilter({ attribute: 'objectClass', value: 'user' }), new EqualityFilter({ attribute: LDAP_ATTR_LOGIN, value: login })] })`), que escapam o valor;
  - **nunca** montar filtro concatenando strings;
  - `sizeLimit: 2`; resultado diferente de exatamente 1 é tratado como falha.
- **LDAP-3** O DN usado no bind vem do resultado da busca, **nunca** montado a partir do login.
- **LDAP-4** **Rejeitar senha vazia ou só com espaços antes do bind**, porque o "unauthenticated bind" com DN e senha vazia é aceito por muitos servidores. O login passa pela mesma regex de SEN-8.
- **LDAP-5** Conta desativada no AD (`userAccountControl & 2`) é negada. O papel vem de `memberOf`, comparado com `LDAP_GRUPO_ADMIN` e `LDAP_GRUPO_OPERADOR`; o resto vira USUARIO.
- **LDAP-6** A senha do LDAP nunca é gravada. Conta `origem=LDAP` não tem senha local nem reset local. `unbind()` sempre no `finally`.
- **LDAP-7** Erro de LDAP responde igual a SEN-3 e conta em RL-3. O detalhe vai para o log sem a senha. Existe sempre um admin local de emergência.

### MAIL: abertura e resposta por e-mail (se implementado)
- **MAIL-1** `imapflow@2.5.9` + `mailparser@3.10.0`, via job pg-boss. Conexão TLS validada.
- **MAIL-2** Anti-loop: ignorar a mensagem quando:
  - `Auto-Submitted` existe e é diferente de `no`;
  - `Precedence` é bulk, junk ou list;
  - tem `List-Id` ou `X-Auto-Response-Suppress`;
  - o remetente é MAILER-DAEMON, postmaster, no-reply/noreply ou o próprio `MAIL_FROM`.
  - Também: no máximo 10 chamados por hora por remetente, e deduplicação por `Message-ID` (UNIQUE).
- **MAIL-3** O remetente **não é confiável** (o From é falsificável).
  - O chamado é criado em nome do usuário cujo e-mail bate **e** cujo `Authentication-Results` (com `authserv-id` = `MAIL_AUTHSERV_ID` configurado) traz `dmarc=pass`.
  - Fora disso, vai para a fila "Triagem: remetente não verificado", visível só a operadores, sem notificar ninguém.
- **MAIL-4** Respostas entram no chamado só pelo endereço `suporte+<chamadoId>.<hmac10>@`, com HMAC de `CSRF_SECRET` sobre `chamadoId`, **e** se o remetente for participante. `[#123]` no assunto, sozinho, não basta.
- **MAIL-5** Usar só a parte `text/plain`. Mensagem só em HTML é convertida para texto. HTML de e-mail nunca é renderizado.
- **MAIL-6** Anexos de e-mail passam por UPL-3 a UPL-5, mais um limite de 10 arquivos por mensagem.
- **MAIL-7** E-mails de saída seguem NOT-7.
- **MAIL-8** Credenciais de IMAP e SMTP ficam só no env (REP-4).

### DEP: dependências e cadeia de suprimentos
- **DEP-1** Versões exatas (`save-exact=true`), `pnpm-lock.yaml` commitado e `pnpm install --frozen-lockfile` no CI.
- **DEP-2** **Fixar `prisma` e `@prisma/client` em 7.10.1.** Hoje a dist-tag `latest` do Prisma aponta para `8.0.0-rc.24`, uma RC publicada em 2026-10-21. Nunca instalar com `@latest`.
- **DEP-3** `pnpm audit --prod --audit-level=high` no CI, falhando o build.
- **DEP-4** Renovate (`renovate.json`):
  - `extends: ["config:recommended"]`, `minimumReleaseAge: "3 days"`;
  - atualizações minor e patch agrupadas por workspace;
  - `vulnerabilityAlerts` ligado, `lockFileMaintenance` mensal;
  - sem automerge de dependências de produção.
- **DEP-5** pnpm:
  - manter `minimumReleaseAge` em 1440 min (padrão da v11);
  - permitir scripts de build só para `prisma`, `@prisma/engines` e `esbuild`.
  - **Não verificado:** o nome da chave mudou entre `onlyBuiltDependencies` (v10) e `allowBuilds` (v11+). Conferir na versão do pnpm fixada em `packageManager` (pnpm.io bloqueado nesta rede).
- **DEP-6** Node 24 LTS. Imagem `node:24-bookworm-slim` fixada por digest e rodando como `USER node`. Sistema de arquivos só leitura, exceto `UPLOAD_DIR` e `/tmp`.
- **DEP-7** Usar `@node-rs/argon2` (com binários pré-compilados, inclusive para Windows, onde roda o `iniciar.bat`), e não o `crypto.argon2` nativo. A API nativa só existe a partir do Node 24.7 e é experimental (não verificado aqui; o ambiente local é v22.22.0).

### BKP: backups, banco e implantação
- **BKP-1** Serviço `backup` no compose de produção, rodando todo dia às 02:17:
  - `pg_dump -Fc` mais `UPLOAD_DIR`;
  - destino num repositório **restic** (cifrado, com `RESTIC_PASSWORD` no env), fora do servidor;
  - retenção `forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune`.
- **BKP-2** `scripts/teste-restauracao.sh` restaura o último snapshot num banco temporário e confere `SELECT count(*) FROM chamados` > 0 e a existência de uma amostra de anexos. Roda uma vez por mês. Metas: RPO de 24 h e RTO de 4 h.
- **BKP-3** Papéis do Postgres:
  - `vinimon_migrator` é dono do schema e roda as migrations;
  - `vinimon_app` (o `DATABASE_URL` do app) tem só DML e não é superusuário nem tem CREATEDB.
- **BKP-4** Compose de desenvolvimento publica o Postgres só em `127.0.0.1:5432:5432`, com senha vinda do `.env`.
- **BKP-5** Banco remoto exige `sslmode=require` na URL.
- **BKP-6** TLS termina no Caddy (HTTPS automático, ou CA interna na intranet), com `TRUST_PROXY=<IP do Caddy>`. A API escuta em `127.0.0.1`, ou na rede interna quando roda em container.

### PRIV: LGPD (mínimo)
- **PRIV-1** "Anonimizar usuário" (ADMIN) troca nome, e-mail e telefone por marcadores, revoga sessões e tokens e preserva chamados e auditoria.
- **PRIV-2** Retenção: logs com IP por 90 dias, `falhas_login` por 24 h, auditoria por 365 dias, notificações lidas por 180 dias (job pg-boss).
- **PRIV-3** Exportação dos dados do próprio usuário em JSON: `GET /api/perfil/exportar`, limitado a 1 por hora.

---

## 3. Checklist de testes de segurança automatizáveis

**Infraestrutura dos testes:**
- `apps/api/test/helpers/app.ts` exporta `criarApp(envOverrides)`, que monta o Fastify sem `listen`.
- `loginComo(papel, {area})` devolve `{cookie, csrf}`. Há fábricas de usuário, chamado e anexo.
- O `globalSetup` do Vitest roda `prisma migrate deploy` no banco de teste. Cada teste começa com `TRUNCATE … CASCADE` em todas as tabelas, menos `_prisma_migrations`. `fileParallelism: false` na API.
- Os testes de socket sobem o app com `listen({port:0})` e conectam `socket.io-client` com `{ transports:['websocket'], extraHeaders:{ cookie, origin } }`.
- O Playwright roda contra o build servido pela API, com `NODE_ENV=test` e `APP_ORIGIN=http://localhost:3100`.

**Legenda:** **[V]** Vitest + `fastify.inject`, **[S]** socket.io-client, **[P]** Playwright, **[CI]** script de pipeline.

**Repositório e configuração**
- T01 [CI] Nenhum `*.db`, `*.db-wal`, `*.db-shm` ou `.env` versionado (REP-2). gitleaks limpo (REP-3).
- T02 [V] `env.ts` rejeita: `APP_ORIGIN=http://…` em production, `TRUST_PROXY=true`, `CSRF_SECRET` curto, `ENCRYPTION_KEY` com tamanho diferente de 32 bytes, valor `troque-me`. A mensagem de erro não contém nenhum valor.
- T03 [CI] O grep em `apps/` e `packages/` volta vazio para: `\$queryRawUnsafe|\$executeRawUnsafe|dangerouslySetInnerHTML|\.innerHTML\s*=|data:\s*(req|request)\.body|trustProxy:\s*true|eval\(|new Function\(`. Também volta vazio `console\.log` em `apps/api/src`.
- T04 [CI] `pnpm audit --prod --audit-level=high`. As versões de `prisma` e `@prisma/client` são exatas e não são pré-release.

**Senhas e login**
- T05 [V] A senha nova é gravada no formato `$argon2id$v=19$m=19456,t=2,p=1$…`.
- T06 [V] Hash legado da v1 (gerado no teste com `scryptSync(senha, saltHexString, 64)`): login correto passa, a coluna vira argon2id e surge auditoria `senha.migrada`. Login errado não altera a coluna.
- T07 [V] Login inexistente e senha errada devolvem o mesmo status e o mesmo corpo. Um `vi.spyOn` em `verificarSenha` confirma **1 chamada** nos dois casos (verificação contra o hash fictício).
- T08 [V] `senhaSchema` rejeita 11 caracteres, 129 caracteres, "vinimon2026!!", senha contendo o login e score menor que 3.
- T09 [V] Seed em production cria só o admin com `deveTrocarSenha=true`. `seed:dev` falha com `NODE_ENV=production`.
- T10 [V] O importador zera o hash de quem usa `admin123` (hash scrypt gerado no teste).
- T11 [V] Sessão em `TROCA_SENHA`: `GET /api/chamados` dá 403 `TROCA_SENHA_OBRIGATORIA`. `trocar-senha` funciona.
- T12 [V] O login "ADMIN" é normalizado para "admin". Criar "Admin" com "admin" já existente dá 409.

**Limites de taxa, bloqueio e proxy**
- T13 [V] 5 falhas no mesmo login: a 6ª devolve 429 **mesmo com a senha certa**. O mesmo vale para um login inexistente. Recuando `criadoEm` das falhas em 16 min, o login volta a funcionar.
- T14 [V] Login com 10.000 caracteres dá 400 (Zod) e não insere nada em `falhas_login`. Corpo de 2 MB dá 413.
- T15 [V] Sem `TRUST_PROXY`: `inject({ remoteAddress:'10.0.0.5', headers:{'x-forwarded-for':'1.2.3.4'} })` faz o limite cair sobre 10.0.0.5. Com `TRUST_PROXY=127.0.0.1` e `remoteAddress:'127.0.0.1'`, a chave passa a ser 1.2.3.4. Com `TRUST_PROXY=127.0.0.1` e `remoteAddress` de outro IP, o XFF é ignorado.
- T16 [V] A 11ª requisição de login no mesmo minuto dá 429. A 31ª falha do mesmo IP, espalhada por vários logins, dá 429.

**Sessões e cookie**
- T17 [V] Com `APP_ORIGIN=https://vinimon.test`, o `Set-Cookie` tem `__Host-vinimon_sid=`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` e nenhum `Domain`.
- T18 [V] O valor do cookie ≠ `sessao.tokenHash`, e `sha256(cookie) === tokenHash`.
- T19 [V] `expiraEm` no passado dá 401. `ultimoUsoEm` 61 min atrás (com inatividade de 60) dá 401. Uma requisição atualiza `ultimoUsoEm` no máximo uma vez a cada 60 s.
- T20 [V] Sessões A e B. Trocar a senha em A faz B dar 401, A continuar válida com cookie novo e o cookie antigo de A dar 401.
- T21 [V] Reset pelo admin, desativação e mudança de papel: todas as sessões do alvo dão 401. **Reativar não revive nenhuma.**
- T22 [V] Logout dá 401 no reuso do cookie. "Encerrar todas" funciona. A 11ª sessão revoga a mais antiga.
- T23 [V] Cookie e Bearer na mesma requisição dão 400. Cookie malformado (`sid=%E0`) dá 401, nunca 500.

**2FA**
- T24 [V] Um OPERADOR sem 2FA entra em `CADASTRO_MFA` e `GET /api/chamados` devolve 403.
- T25 [V] Cadastro com código correto (gerado com otplib no teste) ativa. `totpSecretEnc` começa com `v1:` e não contém o segredo em claro.
- T26 [V] O mesmo código reutilizado no mesmo passo de tempo é rejeitado (anti-replay). 5 códigos errados revogam a sessão pendente.
- T27 [V] Código de recuperação funciona uma vez, e na segunda falha. Gerar códigos novos invalida os antigos.

**CSRF, CORS e cabeçalhos**
- T28 [V] POST autenticado sem `Origin` e sem `Sec-Fetch-Site` dá 403. Com `Origin: https://evil.test`, 403. Com `Origin: null`, 403 (não 500). Com `Origin` correto mas sem `X-CSRF-Token`, 403. Com token de outra sessão, 403. Com tudo correto, 2xx.
- T29 [V] `Content-Type: text/plain` com JSON válido no corpo dá 415.
- T30 [V] Nenhuma resposta tem `Access-Control-Allow-Origin`, inclusive o OPTIONS com `Origin` externo.
- T31 [V] `GET /` em modo test tem a CSP **exatamente igual** à string de HDR-1, além de `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin` e `Permissions-Policy`. Com https, também HSTS.
- T32 [V] `{"__proto__":{"x":1}}` e `{"constructor":{"prototype":{}}}` dão 400. Rota com nome de entidade `constructor` ou `__proto__` dá 400 ou 404, nunca 2xx nem 500.

**Autorização e atribuição em massa**
- T33 [V] **Matriz em tabela:** cada rota de chamado × {solicitante USUARIO, outro USUARIO, OPERADOR da área, OPERADOR de outra área, OPERADOR responsável de outra área, ADMIN} contra o status esperado. Fora do escopo é sempre 404.
- T34 [V] USUARIO com `GET /api/chamados?solicitanteId=<outro>` recebe só os próprios chamados (protege AUTZ-4). Painel, relatórios e CSV contam só o escopo.
- T35 [V] **Regressão de F10:** um OPERADOR solicitante não vê o comentário interno no detalhe, no feed, na busca nem nas notificações, e não recebe notificação do comentário.
- T36 [V] `POST /api/chamados` com `statusId`, `operadorId`, `dataFechamento` ou campos extras dá 400. USUARIO tentando `solicitanteId` diferente de si dá 400 ou 403.
- T37 [V] `PUT /api/perfil {papel:'ADMIN'}` dá 400. Senha atual errada não altera nome nem e-mail (é transação).
- T38 [V] OPERADOR abrindo em nome de um ADMIN dá 403. Em nome de um USUARIO: `abertoPorId` gravado, auditoria `chamado.abertoEmNome` criada e notificação enviada ao alvo.
- T39 [V] Remover o último ADMIN ativo dá 409. Desativar ou rebaixar a si mesmo dá 400 ou 409.
- T40 [V] Varrer `JSON.stringify` das respostas de todas as rotas GET principais e confirmar que não aparecem `senhaHash`, `totpSecret`, `tokenHash` nem `codigoHash`.
- T41 [V] Percorrer as rotas registradas e confirmar que toda `/api/*` tem `permissao` ou `publica` (AUTZ-2). Uma rota de teste sem declaração devolve 403.
- T42 [V] `porPagina=-1` e `porPagina=1000` dão 400. Data inválida dá 400, nunca 500.

**Anexos**
- T43 [V] PNG renomeado para `.pdf` é gravado como `image/png`. HTML renomeado para `foto.png` dá 415. SVG dá 415. Cabeçalho `MZ` (exe) dá 415. `.txt` com byte NUL dá 415. `.csv` UTF-8 é aceito.
- T44 [V] Arquivo com `MAX_ANEXO_MB`+1 byte dá 413. 6 arquivos dão 413. Cota de 100 MB por chamado dá 413. Depois de cada falha, `UPLOAD_DIR/tmp` fica vazio.
- T45 [V] Nome `../../etc/passwd\r\n.png`: a `storageKey` casa a regex de UPL-5 e o nome exibido não tem `/`, `\` nem caracteres de controle.
- T46 [V] Cabeçalhos do download: imagem com `inline`, pdf e docx com `attachment`, e ainda `nosniff`, `CSP ... sandbox`, `Cache-Control: private, no-store` e `CORP same-origin`.
- T47 [V] Anexo INTERNA baixado pelo solicitante dá 404. Anexo de chamado fora do escopo dá 404. `permitirAnexos=false` dá 403. Chamado encerrado dá 409. USUARIO sem acesso fazendo upload: 404 **sem gravar nada no disco**.
- T48 [V] `UPLOAD_DIR` resolvido não fica dentro de `apps/web/dist` (teste unitário de `env.ts`).

**Logs e auditoria**
- T49 [V] Com logger capturando para um array, fazer login, troca de senha e chamada com Bearer. Nenhuma linha contém a senha, o valor do cookie, o token nem o código TOTP, e `[REDACTED]` aparece.
- T50 [V] Os eventos de AUD-2 são gravados com `atorId`, `ip` e `requestId`. `UPDATE auditoria` e `DELETE FROM auditoria` levantam exceção. O job de purga apaga só registros com mais de 365 dias.
- T51 [V] Um erro 500 provocado devolve `{erro, requestId}` sem stack nem SQL.

**Socket.IO**
- T52 [S] Conexão sem cookie dá `connect_error` `nao_autenticado`. `Origin` externo é rejeitado. Sessão em `PENDENTE_MFA` é rejeitada. Token Bearer é rejeitado.
- T53 [S] `chamado:entrar` num chamado fora do escopo devolve `{ok:false}`, e um comentário posterior nesse chamado não chega ao socket.
- T54 [S] Comentário INTERNA, `digitando {interno:true}` e confirmação de leitura de item interno **não chegam** ao socket do solicitante, nem quando ele é OPERADOR. Os operadores da área recebem.
- T55 [S] Logout, troca de senha, desativação e revogação pelo admin derrubam o socket em menos de 1 s. Sessão expirada (com `SOCKET_REVALIDAR_MS=200` e `expiraEm` recuado) é desconectada.
- T56 [S] Encaminhar para outra área faz o operador da área antiga receber `chamado:acessoRevogado` e deixar de receber eventos.
- T57 [S] Payload de 70 KB derruba a conexão. Payload inválido devolve ack `payload_invalido`. Com 25 `chat:mensagem` em 10 s, a 21ª em diante recebe `limite_excedido`. O 6º socket do mesmo usuário é rejeitado.
- T58 [S] USUARIO não recebe a presença da sala `equipe`. O payload de presença só tem `{usuarioId,status}`.

**Menções, feed, notificações e busca**
- T59 [V] Mencionar quem não vê o chamado devolve `mencoesIgnoradas` e não cria notificação. Mencionar um USUARIO num comentário INTERNA tem o mesmo efeito. 21 menções dão 400.
- T60 [V] O feed criado antes do encaminhamento: depois de encaminhar, o operador que perdeu o acesso não vê mais o item nem o trecho (reavaliação na leitura).
- T61 [V] A notificação no banco não tem coluna de texto. O payload de `notificacao:nova` não contém o corpo da mensagem.
- T62 [V] A busca não devolve chamado fora do escopo, nem pelo número exato. Não devolve assentamento interno ao solicitante. USUARIO não encontra usuários. Buscar `%` não devolve tudo.

**Tokens de API, LDAP e e-mail**
- T63 [V] O token é mostrado uma única vez e o banco guarda só o hash. Token expirado ou revogado dá 401. Token `chamados:ler` fazendo POST dá 403. Token chamando `/api/auth/*` ou `/api/tokens` dá 403. Dono desativado invalida o token.
- T64 [V] LDAP (com client mockado na fronteira da rede ou servidor de teste): login `*)(uid=*` é rejeitado pelo Zod. O filtro gerado escapa `*()\`. **Senha vazia não chega a chamar `bind`**. Mais de um resultado na busca resulta em falha.
- T65 [V] Mensagens de e-mail de exemplo: `Auto-Submitted: auto-replied` é ignorada. `Message-ID` repetido é ignorado. From sem `dmarc=pass` vai para a triagem. Resposta com HMAC inválido no endereço não entra no chamado. A parte HTML nunca é gravada como HTML.

**Ponta a ponta (Playwright)**
- T66 [P] Percorrer todas as telas principais (login, painel, lista, detalhe com chat, abrir chamado, cadastros, configurações, Ctrl+K e diálogos Radix) sem nenhum evento `securitypolicyviolation`. Um listener injetado por `addInitScript` confirma.
- T67 [P] XSS armazenado: criar chamado com assunto `<img src=x onerror="window.__xss=1">` e comentário com `<script>window.__xss=1</script>` e `[x](javascript:window.__xss=1)`. Depois de renderizar e clicar, `window.__xss` continua `undefined` e o `href` não começa com `javascript:`.
- T68 [P] Primeiro acesso do admin: troca obrigatória de senha, depois cadastro de 2FA (código gerado no teste a partir da URI exibida), e só então o painel. `context.cookies()` mostra `httpOnly` e `sameSite: 'Strict'`.
- T69 [P] A notificação na área de trabalho, com `Notification` simulado por `addInitScript` capturando os argumentos, não contém o texto do comentário. A permissão só é pedida depois do clique.
- T70 [P] `/login?redirect=//evil.test` termina em `/`. Depois do logout, voltar no navegador não exibe dados (o cache foi limpo) e o socket está desconectado.
- T71 [P] O download de anexo pelo app chega com os cabeçalhos de T46 (`page.waitForResponse`). O app não pode ser carregado dentro de um iframe de outra origem.
- T72 [P] Com inatividade configurada em 1 min no ambiente de teste, depois de 61 s sem uso a próxima ação leva à tela de login.

---

**Versões consultadas via `npm view` em 2026-10-21:**

| Pacote | Versão |
|---|---|
| fastify | 5.12.7 |
| @fastify/helmet | 13.2.0 |
| @fastify/rate-limit | 11.2.1 |
| @fastify/cookie | 11.1.3 |
| @fastify/multipart | 10.1.4 |
| @fastify/static | 10.1.6 |
| fastify-type-provider-zod | 7.0.0 (peer: fastify ^5.5, zod ≥4.1.5) |
| zod | 4.6.7 |
| @node-rs/argon2 | 2.2.2 |
| otplib | 13.5.0 (`epochTolerance` e `afterTimeStep` documentados no README de @otplib/totp) |
| file-type | 22.2.0 |
| content-disposition | 3.0.0 |
| socket.io | 4.8.4 |
| prisma | estável 7.10.1 (`latest` = 8.0.0-rc.24) |
| ldapts | 9.2.0 |
| pino | 10.4.0 |
| pg-boss | 12.38.0 |
| nodemailer | 10.1.7 |
| imapflow | 2.5.9 |
| mailparser | 3.10.0 |
| qrcode | 1.5.4 |
| @zxcvbn-ts/core | 4.2.0 |

**Não verificado (rede bloqueada para pnpm.io e para o site do otplib):**
- nomes exatos das chaves do pnpm para o allowlist de scripts de build;
- a opção `jitless` do Zod;
- a obrigatoriedade de driver adapter no Prisma 7 (o `omit` global entra junto do `adapter` no construtor);
- se o `contains` do Prisma escapa curingas (coberto pelo teste T62).

Fontes da busca sobre o pnpm: [pnpm.io/settings](https://pnpm.io/settings), [newreleases.io – pnpm 11.1.3](https://newreleases.io/project/npm/pnpm/release/11.1.3), [lilting.ch – pnpm 11 minimumReleaseAge](https://lilting.ch/en/articles/pnpm-11-minimum-release-age-default-shai-hulud-defense).
