# Portão de fase (coordenador)

**Quando:** todas as tarefas das Fases 2, 5, 6, 7 ou 11 mergeadas (portões `P02`, `P05`, `P06`, `P07`, `P11`), e depois da Fase 11 o `MVP`.

1. Encontre o intervalo da fase no log:
   ```bash
   git log origin/v2 --first-parent --format='%h %s' | grep -E ' T-N\.'
   ```
   O intervalo vai do commit anterior à primeira tarefa da fase até o último.
2. Rode a revisão no diff desse intervalo. Não use `/security-review`: ele compara com a `main`, que é a v1.
   ```bash
   git diff <antes>..<depois> | claude -p --model opus "Revise este diff do Vinimon v2 contra docs/plano/fundamentos/05-seguranca.md. Liste só problemas reais: arquivo, linha, risco e correção."
   ```
3. Cada achado real vira um cartão novo `T-N.9x` no `fase-NN.md` correspondente, com Depende de, Requisitos, Arquivos, Passos, Pronto quando, Trilha, Modelo e Tamanho. Achado de segurança alta usa Modelo Sonnet ou Opus.
4. Abra um PR `plano/portao-PNN` com os cartões novos e uma linha em `docs/plano/execucao/portoes.md`. O título é `portão: PNN — <resumo>`, ou `portão: MVP — …` no fim da Fase 11. O merge desse PR registra o portão: as tarefas com "Depende de: MVP" só abrem depois do `portão: MVP`.
