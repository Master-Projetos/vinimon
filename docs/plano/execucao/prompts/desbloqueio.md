# Desbloqueio (coordenador)

Para a issue `BLOQUEADO T-x.y: …`, leia o motivo e as evidências. O patch do trabalho parcial fica na máquina do executor, no caminho citado na issue. Classifique a causa:

| Causa | O que fazer |
|---|---|
| Cartão ambíguo ou contraditório | PR `plano/<assunto>` corrigindo o cartão (título `plano: …`) e merge |
| Versão ou API do plano não existe | Confirmar com `npm view` ou no `.d.ts`; corrigir a Parte A e o cartão no PR `plano:` |
| Precisa de arquivo fora da lista | Acrescentar o arquivo ao cartão no PR `plano:`, ou dar a label `escopo-aprovado` ao PR depois |
| Modelo fraco (falhou 2 vezes) | PR `plano:` subindo o **Modelo** do cartão |
| Bug em código já mergeado | Cartão novo `T-N.9x` para a correção (PR `plano:`); a tarefa bloqueada passa a depender dele |
| Ambiente (Docker, porta, login) | Falar com a pessoa da conta |

Depois do merge da correção:

```bash
VINIMON_PAPEL=coordenador node scripts/plano/proxima.mjs --desbloquear T-x.y
gh issue close <n> --comment "corrigido em <PR plano:>; retomando"
```

O runner do dono retoma a tarefa sozinho. Se a tarefa precisa ir para outra conta: `proxima.mjs --transferir T-x.y --para <agente>`.
