# Execução multi-conta (Opus, Sonnet e Haiku)

**Comece por [`prompts/iniciar-agentes.md`](prompts/iniciar-agentes.md).**

| Arquivo | Para quem |
|---|---|
| [`prompts/iniciar-agentes.md`](prompts/iniciar-agentes.md) | Pessoa de cada conta: preparar a máquina e o comando de partida |
| [`prompts/coordenador.md`](prompts/coordenador.md) | Prompt do coordenador (Opus): passo 0 e rodada |
| [`prompts/executor.md`](prompts/executor.md) | Template que o runner envia ao modelo de cada tarefa |
| [`prompts/revisao-pr.md`](prompts/revisao-pr.md), [`desbloqueio.md`](prompts/desbloqueio.md), [`portao.md`](prompts/portao.md) | Procedimentos do coordenador |
| [`portoes.md`](portoes.md) | Registro dos portões de fase |

## Divisão por modelo

| Modelo | Tarefas | Papel |
|---|---|---|
| **Opus** | 16 | Coordenação, revisão por amostragem, portões, desbloqueio. Executa 2.4, 4.3, 5.1, 5.11, 6.3, 6.8, 7.2, 7.4, 11.3, 11.11, 11.12, 13.2, 17.2, 19.1, 19.2, 20.7 |
| **Sonnet** | 36 | Lógica sutil ou de segurança: sessões, 2FA, SLA, ações de chamado, menções, socket, importador, LDAP etc. |
| **Haiku** | 161 | Tarefas mecânicas: cadastros, telas, componentes, configuração |

Cada cartão traz `Modelo:` e `Trilha:`. A trilha A é a API, a W é a Web e a C é a do Opus. Cartões marcados `A (apoio W)` podem ser pegos pela W quando ela está ociosa.

**Escalonamento:** quando uma tarefa termina duas vezes em BLOQUEADO, o coordenador sobe o Modelo do cartão (Haiku → Sonnet → Opus).

## Peças
- `scripts/plano/grafo.mjs`: lê os cartões. Expande dependências ("MVP", "Fase 2", intervalos, "todas as") e arquivos. `node scripts/plano/grafo.mjs --verificar --dir .` valida o plano.
- `scripts/plano/proxima.mjs`: estado e livro-razão. O livro-razão é a branch `controle/travas`, gravada com push sem force (compare-and-swap). Também tem quadro (`--status`), cartão, conferência do diff e operações do coordenador.
- `scripts/plano/rodar.mjs`: o runner de cada executor. Só ele faz push e PR; o modelo não.
- `scripts/plano/passo0.mjs`: configuração do GitHub, com dry-run por padrão.
- `scripts/plano/executor-settings.json`: permissões do modelo headless (allowlist fechada e denylist).
- `.github/workflows/protocolo.yml`: check obrigatório. Título ⇔ branch ⇔ cartão, arquivos dentro do cartão, migrações, LF.
- `scripts/plano/teste/simular.mjs`: simulação com repositório e `gh`/`claude` falsos. Cobre corridas, travas, dependências, portão, revert e runner.

## Regras que evitam colisão
1. Uma tarefa = uma trava no livro-razão. Só um push vence; o outro agente relê e escolhe outra tarefa.
2. Uma tarefa só é oferecida se nenhum arquivo dela estiver com outra tarefa aberta, de qualquer trilha. O schema do banco também é travado, para uma tarefa por vez.
   - Ficam fora dessa regra os arquivos de append-only (`app.ts`, `shared/src/index.ts`, `jobs/index.ts`) e os gerados (`pnpm-lock.yaml`, `routeTree.gen.ts`, `components/ui/**`).
3. Cada agente tem no máximo 2 tarefas abertas. Uma tarefa bloqueada segura só o ID, não os arquivos.
4. Tarefas novas só depois do merge das dependências na `v2`. O merge é sempre squash com o título `T-x.y: …`, ligado pelo runner do próprio executor (auto-merge) e liberado pelos checks obrigatórios.
5. Um executor por máquina. Os bancos de dev e de teste são da máquina; o runner recria o de teste a cada tarefa.
6. Correções de plano e portões entram por PR `plano/*`. Nada é commitado direto na `v2`.
