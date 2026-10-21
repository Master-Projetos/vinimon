# Revisão de PR (coordenador)

Para o PR `<n>` da tarefa `T-x.y`:

1. `gh pr view <n> --json baseRefName,headRefName,title,body,statusCheckRollup`
   - A base é `v2`, a head é `tarefa/T-x.y` e o título começa com `T-x.y: `.
   - Os checks `protocolo` e `verificar` (este a partir da T-1.11) estão verdes.
2. `node scripts/plano/proxima.mjs --cartao T-x.y`: leia o cartão e confira o diff com `gh pr diff <n>`.
   - Cada **Passo** foi feito? Cada **Pronto quando** tem evidência no corpo do PR?
   - Nada de supressões: `gh pr diff <n> | grep -nE '@ts-expect-error|@ts-ignore|biome-ignore|as unknown as|\.skip\(|\.only\(|it\.todo'` vem vazio.
   - Nenhum teste removido ou afrouxado, nenhuma migração existente editada, e dependências novas com a versão exata da §2.2.
   - Segurança (§5): rota com `config.acesso`, escopo de chamado só por `autorizacao/chamados.ts`, nada de comentário interno vazando.
3. Decida uma destas três:
   - **Merge:** `gh pr merge <n> --squash --auto`.
   - **Ajustes:** `gh pr edit <n> --add-label ajustes` + `gh pr comment <n> --body "1. … 2. …"`, com itens numerados e cada um verificável. O runner do executor retoma sozinho.
   - **Escalar:** se o modelo claramente não dá conta, abra um PR `plano:` mudando o **Modelo** do cartão (Haiku → Sonnet → Opus), feche o PR e rode `proxima.mjs --liberar T-x.y --motivo "escalado"`.
