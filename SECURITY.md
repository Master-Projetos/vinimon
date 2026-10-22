# Segurança

## Como reportar uma vulnerabilidade
Não abra issue pública. Envie os detalhes (passos para reproduzir, impacto, versão) por mensagem privada ao responsável pelo projeto ou pelo recurso "Report a vulnerability" do GitHub (aba Security). Respondemos em até 3 dias úteis.

## Arquivos de banco da v1 no histórico do git
Os arquivos `data/*.db*` (SQLite da v1, com hashes de senha) foram retirados do índice na T-0.1 e estão no `.gitignore`, mas **continuam no histórico** dos commits antigos.

- Considere vazadas as senhas padrão da v1 (`admin123`, `operador123`, `usuario123`). O importador anula esses hashes (S12) e a migração usa `--exigir-troca-todos`.
- Reescrever o histórico com `git filter-repo --path data --invert-paths` é uma **decisão humana** (S2): ela invalida os clones existentes. Registre aqui a decisão tomada e a data.

Decisão: _pendente_.

## Segredos
- Segredos só em variáveis de ambiente (`apps/api/.env`, nunca versionado). O `env.ts` recusa em produção valores de exemplo, `http`, `API_DOCS=true` e `TRUST_PROXY=true`.
- Rotação: gere novos `CSRF_SECRET` e `ENCRYPTION_KEY` (`openssl rand -base64 32`) e reinicie o serviço. Trocar o `CSRF_SECRET` invalida os tokens CSRF das sessões abertas; trocar a `ENCRYPTION_KEY` exige recifrar os segredos de 2FA antes (ver `docs/operacao.md`, T-11.10).
- O gitleaks roda no CI a cada push e pull request.

## Dependências
- Versões exatas (sem `^`), lockfile versionado e `pnpm install --frozen-lockfile` no CI (S109).
- `prisma`, `@prisma/client` e `@prisma/adapter-pg` fixados em 7.10.1; o CI confere (S110, T04).
- `pnpm audit --prod --audit-level=high` no CI (S111). O Renovate propõe atualizações com idade mínima de 3 dias.

## Requisitos e testes
Os requisitos de segurança (S1…) e o checklist de testes (T01…T72) estão em `docs/plano/fundamentos/05-seguranca.md`.
