# Registro de portões

Um portão é registrado por um PR `plano/portao-PNN` com o título `portão: PNN — …`. A tabela é preenchida pelo coordenador.

| Portão | Data | Intervalo revisado | Achados → cartões novos |
|---|---|---|---|
| MVP | 2026-10-26 | Fases 1 a 11 (v2 até `1e8082a`) | Revisão final de segurança (T-11.11, `docs/plano/revisao-seguranca.md`): 122 requisitos OK; S111 e S81 corrigidos na própria tarefa; **S2** (dois `.db` antigos no histórico do git) fica como decisão humana, sem cartão. Revisão de performance (T-11.12, `docs/plano/revisao-performance.md`): desvios D1 a D5 → cartões T-11.91 a T-11.95. E2E (T-11.5 a T-11.7) verdes; `pnpm verificar` verde na `v2` (shared 98, web 430, api 953). |
