# Como iniciar os agentes (uma pessoa por conta)

## Quem faz o quê

| Conta | Papel | Modelo | Comando |
|---|---|---|---|
| 1 | Coordenador (revisa, faz merge, desbloqueia, portões) | Opus | `claude --model opus --permission-mode manual` + colar `coordenador.md` |
| 1 (outro terminal) | Executor da trilha C (16 tarefas Opus) | Opus | `node ../vinimon-controle/scripts/plano/rodar.mjs --trilha C` |
| 2 | Executor da trilha A (API) | o do cartão | `node ../vinimon-controle/scripts/plano/rodar.mjs --trilha A` |
| 3 | Executor da trilha W (Web) | o do cartão | `node ../vinimon-controle/scripts/plano/rodar.mjs --trilha W` |

- Com só 2 contas, a conta 2 roda `--trilha A,W`.
- Cada executor fica numa máquina própria. O coordenador não usa Docker e pode dividir a máquina com o executor C.

## 1. Preparar a máquina (uma vez)

```bash
# Linux, macOS ou WSL2. Ferramentas: Node 24, pnpm 12, Docker, git, gh, claude
git config --global pull.rebase false
git config --global core.autocrlf false

# Login: confira que nenhuma variável sobrepõe a conta
env | grep -E '^(ANTHROPIC|CLAUDE_CODE)' | cut -d= -f1    # deve sair vazio
claude auth status                                        # conta e organização certas
gh auth login && gh auth refresh -s workflow              # usuário GitHub com papel Write

git clone https://github.com/Master-Projetos/vinimon.git && cd vinimon
git fetch origin v2 controle/travas
git worktree add --detach ../vinimon-controle origin/v2   # o runner roda daqui

# Nome único deste agente (conta-máquina); coloque no ~/.bashrc
export VINIMON_AGENTE=conta2-notebook-joao
```

## 2. Primeira vez: só o coordenador (passo 0)

O coordenador cola `coordenador.md` na sessão do Opus. O passo 0 roda `passo0.mjs`, que:
- cria a branch `v2` e o livro-razão;
- protege `v2` e `main`;
- cria as labels;
- configura o merge por squash.

Os executores só começam depois disso.

## 3. Fases 0 e 1: modo interativo, com alguém olhando

Até o merge da T-1.11 ainda não existe CI. Nessas fases, rode:

```bash
node ../vinimon-controle/scripts/plano/rodar.mjs --trilha A --interativo
```

O runner trava a tarefa, prepara a worktree e mostra três coisas:
1. o comando `cd <worktree> && claude --model <modelo>`;
2. a frase para colar na sessão ("Leia ~/.vinimon/prompts/T-x.y.md e execute…");
3. o comando final: `rodar.mjs --finalizar T-x.y`, ou `--finalizar T-x.y --bloqueado "motivo"`.

## 4. Depois da T-1.11: automático

```bash
node ../vinimon-controle/scripts/plano/rodar.mjs --trilha A      # ou W, C, A,W
```

O runner repete o ciclo sozinho:
1. pega a próxima tarefa livre;
2. trava a tarefa no livro-razão;
3. roda o modelo do cartão (Haiku, Sonnet ou Opus) com permissões fechadas e teto de custo;
4. confere o resultado (`pnpm verificar` e arquivos dentro do cartão);
5. abre o PR.

Quando não há tarefa livre, ele espera.

**O runner para sozinho** (sem pegar tarefa nova) em três casos:
- erro de execução;
- dois `BLOQUEADO` seguidos;
- 8 h sem nada para fazer.

Leia a última mensagem e avise o coordenador.

**Útil:**
- `--uma` faz uma tarefa e sai.
- `node ../vinimon-controle/scripts/plano/proxima.mjs --status` mostra o quadro geral.
- Para fixar a versão dos modelos: `export VINIMON_MODELO_OPUS=claude-opus-5-5` (e o mesmo para `_SONNET` e `_HAIKU`).
- Teto de custo por tarefa: `VINIMON_ORCAMENTO_HAIKU=3`, `_SONNET=10`, `_OPUS=30` (USD).

## Por que os agentes não colidem
- **Trilhas fixas:** cada cartão tem dono (A, W ou C).
- **Travas no livro-razão:** quem reivindica uma tarefa grava a trava na branch `controle/travas` com push sem force. Se dois tentarem ao mesmo tempo, só um push entra; o outro relê o estado e escolhe outra tarefa.
- **Arquivos e schema:** uma tarefa só é oferecida se nenhum arquivo dela estiver com outra tarefa aberta. O schema do banco também é travado, para uma tarefa por vez.
- **Git e GitHub só pelo runner:** o modelo não faz push nem PR e não troca de branch.
- **Merge pelo próprio executor:** o runner liga o auto-merge (squash) do PR da tarefa. A `v2` é protegida: só entra por PR, e o check `protocolo` (e o `verificar`, depois da T-1.11) reprova PR fora do cartão.
