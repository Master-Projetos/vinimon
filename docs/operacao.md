# Operação do Vinimon

Este guia cobre a implantação em produção (§3.13): um único processo Node com API, SPA, Socket.IO e workers do pg-boss, atrás do Caddy, que faz só TLS e compressão.

## 1. Banco de dados (uma vez)

Rodar como superusuário do Postgres. Os papéis e o schema `pgboss` estão em `scripts/papeis-postgres.sql`:

```sh
psql -v senha_migrator="$SENHA_MIGRATOR" -v senha_app="$SENHA_APP" -f scripts/papeis-postgres.sql
```

- `vinimon_migrator` (DDL): dono do banco e das migrações. Só é usado no deploy.
- `vinimon_app` (DML): usado pela aplicação. Não tem permissão de DDL no `public` (S115).
- Banco remoto: `DATABASE_URL` com `sslmode=require` (S117).

## 2. Servidor com systemd (caminho principal)

1. Criar o usuário e as pastas:
   ```sh
   sudo useradd --system --home /var/lib/vinimon --shell /usr/sbin/nologin vinimon
   sudo install -d -o vinimon -g vinimon /var/lib/vinimon/anexos
   sudo install -d -m 0750 -o root -g vinimon /etc/vinimon
   ```
2. Copiar `deploy/api.env.example` para `/etc/vinimon/api.env` (modo `0640`, dono `root:vinimon`) e trocar **todos** os valores `troque…`. Gerar os segredos com:
   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```
   O `env.ts` recusa a aplicação em `NODE_ENV=production` se algum segredo ainda for de exemplo (S4).
3. Instalar a unit `deploy/vinimon.service` em `/etc/systemd/system/vinimon.service` e rodar `sudo systemctl daemon-reload && sudo systemctl enable vinimon`.
4. Caddy: usar `deploy/Caddyfile` como `/etc/caddy/Caddyfile` (TLS automático, `reverse_proxy 127.0.0.1:3000`). A API fica só em `127.0.0.1` e `TRUST_PROXY=127.0.0.1` (S118).
5. Deploy: com `DATABASE_URL_MIGRATOR` (papel `vinimon_migrator`) e `HOST` (domínio público) no ambiente:
   ```sh
   DATABASE_URL_MIGRATOR='postgresql://vinimon_migrator:…@host:5432/vinimon?sslmode=require' HOST=chamados.suaempresa.com.br scripts/release.sh
   ```
   O script faz `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm build`, `db:deploy` com o papel de migração e só então `systemctl restart vinimon`. Se a migração falhar, o script para e **não reinicia** o serviço (S121). Por fim confere `https://$HOST/api/v1/saude/pronto`.

## 3. Imagem Docker (alternativa)

Mesmo processo, empacotado em imagem. O `Dockerfile` usa `node:24-bookworm-slim` fixada por digest e roda como `USER node`.

Antes de subir a imagem final, **rodar as migrações** com o papel de migração. Se falhar, não suba a imagem:

```sh
docker build --target migrar -t vinimon-migrar . && docker run --rm -e DATABASE_URL="$DATABASE_URL_MIGRATOR" vinimon-migrar
docker build -t vinimon .
```

Subir a aplicação (com `deploy/api.env.example` já preenchido com segredos reais, fora do repositório):

```sh
sudo install -d -o 1000 -g 1000 /var/lib/vinimon/anexos
docker run -d --name vinimon --network host --read-only --tmpfs /tmp \
  --env-file /etc/vinimon/api.env \
  -v /var/lib/vinimon/anexos:/data/anexos \
  --restart always vinimon
```

- `--network host` deixa a API em `127.0.0.1:3000` do host, para o Caddy (`reverse_proxy 127.0.0.1:3000`).
- Em Docker, `UPLOAD_DIR=/data/anexos` (o volume). No `api.env` usado pelo systemd, o valor é `/var/lib/vinimon/anexos`.

## 4. Windows (NSSM + Caddy)

Alternativa para servidor Windows, com o mesmo processo Node:

1. Instalar Node 24, PostgreSQL e Caddy; criar os papéis e o banco como na seção 1.
2. Copiar `deploy/api.env.example` para `C:\vinimon\api.env` com segredos novos e `UPLOAD_DIR` numa pasta fora do repositório.
3. Rodar `pnpm install --frozen-lockfile` e `pnpm build`, e as migrações com o papel `vinimon_migrator` (`pnpm db:deploy`).
4. Registrar o serviço com o NSSM:
   ```bat
   nssm install Vinimon "C:\Program Files\nodejs\node.exe" "--enable-source-maps dist\server.mjs"
   nssm set Vinimon AppDirectory C:\vinimon\apps\api
   nssm set Vinimon AppEnvironmentExtra :C:\vinimon\api.env
   nssm set Vinimon AppStdout C:\vinimon\logs\vinimon.log
   nssm start Vinimon
   ```
5. Caddy como serviço (`caddy run --config Caddyfile` via NSSM), com o mesmo `deploy/Caddyfile`. A API fica só em `127.0.0.1`.

## 5. Saúde

- `GET /api/v1/saude`: processo no ar (`{ok: true}`).
- `GET /api/v1/saude/pronto`: faz `SELECT 1` e confere que o pg-boss iniciou. É o endereço usado no `release.sh`.

## 6. Segredos e arquivos que não vão ao repositório

- `/etc/vinimon/api.env` e `DATABASE_URL*` nunca são commitados. O repositório só tem `deploy/api.env.example`, com valores de exemplo que o `env.ts` recusa em produção.
- Não usar `TRUST_PROXY=true` nem `@fastify/cors`; o Caddy é o único proxy.

## 7. Rotação de segredos

- `CSRF_SECRET`: gerar um novo valor (`openssl rand -base64 32`), atualizar `/etc/vinimon/api.env` e `sudo systemctl restart vinimon`. Os tokens CSRF das sessões abertas deixam de valer; o front busca outro sozinho.
- `ENCRYPTION_KEY` (cifra os segredos de 2FA): **não troque sem recifrar** os segredos existentes, ou todos os 2FA deixam de funcionar. Sem procedimento de recifragem, mantenha a chave e reinicie só se ela vazar; nesse caso, redefina o 2FA da equipe.
- Senhas dos papéis do Postgres: `ALTER ROLE vinimon_app PASSWORD '…'`, atualizar `DATABASE_URL` no `api.env` e reiniciar.
- Senha do repositório restic: a chave do repositório é guardada fora do servidor; perder a senha torna os backups irrecuperáveis.

## 8. Release

`scripts/release.sh` (seção 2, passo 5). Para voltar uma versão com problema: `git checkout <tag anterior>`, `scripts/release.sh` e, se a migração nova já foi aplicada, restaurar o backup do dia (seção 9). Nunca `prisma migrate reset`.

## 9. Backup e restauração

- **Backup diário (S119):** `scripts/backup.sh` faz `pg_dump -Fc` e `restic backup` (cifrado) do dump e de `UPLOAD_DIR`, com retenção 7 diários, 4 semanais e 12 mensais. Variáveis em `/etc/vinimon/backup.env`: `RESTIC_REPOSITORY` e `RESTIC_PASSWORD_FILE`.
  ```sh
  sudo cp deploy/vinimon-backup.service deploy/vinimon-backup.timer /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now vinimon-backup.timer   # todo dia às 02:17
  ```
- **Teste mensal (S120):** `scripts/teste-restauracao.sh` restaura o último snapshot num diretório temporário e num banco `vinimon_restauracao_<data>`, confere `count(chamados) > 0` e o sha256 de 10 anexos aleatórios, e apaga tudo. Precisa de um usuário do Postgres que possa criar bancos (`PGHOST`, `PGUSER`, `PGPASSWORD`). O timer `deploy/vinimon-restauracao.timer` dispara o serviço `vinimon-restauracao.service`, que deve ter a mesma forma de `vinimon-backup.service` com `ExecStart=/opt/vinimon/scripts/teste-restauracao.sh`.
- **Restauração real:** `restic restore latest --target /tmp/restauracao`, `pg_restore --clean --if-exists --no-owner --dbname vinimon /tmp/restauracao/var/lib/vinimon/backup/vinimon.dump` e copiar os anexos de volta para `UPLOAD_DIR`. Metas: RPO 24 h, RTO 4 h.

## 10. Corte da v1 para a v2

Pré-requisitos: MVP aceito em homologação, importador (T-11.3), release, backup e este runbook prontos, e janela aprovada (sugestão: sexta-feira às 18h, 4 h de janela).

1. **Identificar o banco vivo da v1** (`VINIMON_DB` ou `./data/VINIMON.db`; o README antigo cita `ocomon.db`):
   ```sh
   node -e "const {DatabaseSync}=require('node:sqlite');for(const f of process.argv.slice(1)){const d=new DatabaseSync(f,{readOnly:true});console.log(f,d.prepare('SELECT count(*) n, max(data_abertura) ult FROM chamados').get())}" data/VINIMON.db data/ocomon.db
   ```
   O arquivo com o `ult` mais recente é o de produção.
2. **Backup B0:** copie `<db>`, `<db>-wal` e `<db>-shm` para fora do servidor e grave o `sha256sum`.
3. **Homologação:** Postgres com `scripts/papeis-postgres.sql`, `api.env` com segredos novos e `scripts/release.sh`. Não rode `db:seed`: o importador faz o seed base.
4. **Dry-run** sobre uma cópia de B0: `pnpm -F @vinimon/api importar:v1 --sqlite /tmp/b0/VINIMON.db --dry-run`. Erros abortam (corrija na cópia e documente); avisos (e-mail duplicado, operador sem área, cor inválida) são revisados e aceitos.
5. **Ensaio completo** em homologação: execução real com `--exigir-troca-todos` (obrigatório, porque os `.db` com hashes estiveram no git), criar o admin de emergência com `pnpm -F @vinimon/api cli usuario:redefinir-senha admin`, validar contagens, testar logins (devem pedir troca de senha e, para a equipe, 2FA). Para refazer, um DBA recria o banco e roda `db:deploy`.
6. **Validar contagens** (tolerância zero): áreas, usuários, locais → departamentos, prioridades/status/problemas, equipamentos → ativos, faq → artigos, chamados (`count`, `max(id)`, encerrados), assentamentos (`count` e privados), anexos (`count`, soma de tamanhos e arquivos em `UPLOAD_DIR`). Faça uma amostra manual de 20 chamados, confira `last_value` da sequence de chamados e abra um chamado novo, que deve receber `max+1`.
7. **Comunicar** em D-5 e D-1: data, indisponibilidade, primeiro acesso com troca de senha, 2FA para a equipe e o novo endereço HTTPS.
8. **Congelar a v1** no início da janela: pare o processo, confirme que o `-wal` não muda por 1 min e faça o backup B1 com checksum (fonte da migração).
9. **Migrar:** banco de produção vazio com `db:deploy`; `importar:v1 --sqlite <B1> --dry-run` e depois sem `--dry-run`, ambos com `--exigir-troca-todos`; validar as contagens; `scripts/backup.sh`.
10. **Trocar:** apontar DNS ou Caddy para a v2, `systemctl start vinimon`, `curl -fsS https://<host>/api/v1/saude/pronto`, o admin troca a senha e cadastra o 2FA, smoke test (abrir chamado, comentar, anexar, concluir e validar) e liberar o acesso.
11. **Pós-corte:** monitorar por 48 h (`journalctl -u vinimon -p warning`, `/saude/pronto`, fila `pgboss`, tamanho de `UPLOAD_DIR`). A v1 fica desligada, com B1 guardado por 90 dias. Rollback só até D+1, se houver falha crítica sem correção em 4 h: parar a v2 e religar a v1 com B1; depois disso, corrigir à frente.
12. **Limpeza:** apagar `data/` do diretório de trabalho depois de confirmar B0 e B1, decidir sobre `git filter-repo` (S2, registrar em `SECURITY.md`) e rodar o primeiro `teste-restauracao.sh`.

## 11. Desbloqueio e redefinição de senha

- Redefinir a senha e encerrar as sessões do usuário (gera uma senha temporária e exige troca no próximo acesso):
  ```sh
  pnpm -F @vinimon/api cli usuario:redefinir-senha <login>
  ```
- Conta bloqueada por tentativas: a tabela `falhas_login` é limpa sozinha em 24 h pelo job `sessoes-limpeza`; se for urgente, um administrador redefine a senha pelo comando acima.
- Administrador de emergência: o mesmo comando com o login `admin`.

## 12. Logs e retenção

- Logs do serviço: `journalctl -u vinimon` (avisos e erros: `journalctl -u vinimon -p warning`).
- Retenção de 90 dias (S123): em `/etc/systemd/journald.conf` defina `MaxRetentionSec=90d` e rode `sudo systemctl restart systemd-journald`.
- Outras retenções feitas pelos jobs: `falhas_login` 24 h, sessões revogadas ou expiradas 7 dias, auditoria 365 dias.
