> Parte A (fundamentos), §1. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 1. Visão e escopo

### 1.1 Visão

- O Vinimon v2 é um help desk no estilo OCOMON com experiência de uso inspirada no Microsoft Teams: app bar à esquerda, painel de lista, conversa ao vivo no chamado, presença, menções, feed de Atividade e busca Ctrl+K.
- A stack é TypeScript de ponta a ponta: Fastify + Zod + Prisma/PostgreSQL na API; React + TanStack + Tailwind/shadcn no front. Os contratos Zod são compartilhados entre os dois.
- Prioridade: correção e segurança vêm antes de completude. O MVP precisa substituir a v1 em produção e importar os dados dela.
- A execução é feita por agentes Haiku, tarefa por tarefa, seguindo o `CLAUDE.md` (seção 7).

### 1.2 MVP (Fase 1)

IDs `A..I` vêm do inventário OCOMON (`docs/plano/relatorios/ocomon.md` §1); `TM1`–`TM8` são os recursos estilo Teams (`T##` é sempre um teste da §5.2).

| Módulo | Itens |
|---|---|
| Fundação | Monorepo, CI, segurança S1–S123 (seção 5; a S124, exportação de dados pessoais, fica para a Fase 2, T-17.8), sessões no banco, 2FA TOTP, auditoria (A16), seed seguro, importador da v1 |
| Acesso | A01 (perfis ADMIN/OPERADOR/USUARIO e `ativo`), A02 (área primária e secundárias), A03 (isolamento por área, fixo), A06 (unidades → departamentos), A10 (login robusto, bloqueio persistido, rehash scrypt → argon2id) |
| Abertura | B01, B02 (`abertoPorId`), B04/B05 (tipo de problema N:N com áreas, área padrão), B12 (canais), B13 (tags; filtro "contém todas"), B16 (anexos em disco, multipart), B17/I02 (reincidência do ativo), B20 (sugestão da base ao digitar) |
| Ciclo de vida | C01/C02 (status com tipo, papel, cor, pausa de SLA, ignorado), C03, C04/C05 (visões, selo "Novo", última interação), C06, C07, C09 (com job de retorno), C11, C12 (público/interno), C13, C14, C15 (job), C16, C17, C22 (histórico campo a campo), C23 (impressão com layout fixo) |
| SLA | D01–D04, D06 (tempos úteis gravados); D05 adaptado (estado "em risco") |
| Comunicação | E01 (central de notificações = feed de Atividade) |
| Conhecimento | F01 (artigos com visibilidade e N:N com tipos de problema; substituem a FAQ e os roteiros) |
| Consultas | G01 (filtro avançado, CSV), G03 (painel com KPIs), G04 (relatórios básicos, SLA útil, avaliações) |
| Inventário | I01 (ativo básico com tipo em cadastro), I02 |
| Teams | TM1 chat ao vivo na linha do tempo; TM2 presença (Disponível/Ocupado/Ausente/Offline); TM3 "digitando…"; TM4 confirmação de leitura ("Visto por"); TM5 @menções; TM6 feed de Atividade unificado; TM7 notificações na área de trabalho; TM8 busca global Ctrl+K |
| Conta | Perfil (dados, aparência, preferências de notificação in-app e desktop), troca de senha, 2FA, dispositivos conectados |
| Administração | CRUD de cadastros (um arquivo de rota por entidade), usuários (redefinir senha, resetar 2FA, encerrar sessões, desbloquear login), configurações, auditoria |

Decisões que ajustam a priorização OCOMON:
- Decisão: no MVP, A03 tem o isolamento por área **sempre ligado**. A chave configurável `isolar_visibilidade_areas` vai para a Fase 2.
- Decisão: no MVP, os comentários (C12) não podem ser editados nem excluídos. A edição em até 15 min, com histórico, fica para a Fase 2.
- Decisão: a "tolerância" do OCOMON (D05: amarelo depois do vencimento) passa a ser **"em risco"**: amarelo antes do vencimento, quando já se consumiu `sla.alertaPct` (padrão 80%) da meta. Vencido é sempre vermelho. Motivo: o alerta chega antes, quando ainda dá para agir.
- Decisão: a avaliação usa os 4 níveis do OCOMON (Ótimo, Bom, Regular, Ruim), não estrelas.
- Decisão: 2FA TOTP é obrigatório para ADMIN e OPERADOR desde o MVP, sem chave para desligar. Para USUARIO é opcional.
- Decisão: FAQ e roteiros (F01) viram um único modelo `Artigo`, com `visibilidade` PUBLICO|INTERNO e vínculo N:N com tipos de problema. Roteiro de operador é artigo INTERNO.
- Decisão: tipos de anexo seguem a lista fixa de S66 (não configurável). São configuráveis só: habilitar, tamanho máximo e quantidade por envio.
- Decisão: A06 transforma `locais` em `Departamento` dentro da unidade "Principal". A interface usa o rótulo "Departamento".
- Decisão: na D02, feriado significa "sem expediente" (sem grupo de horário FERIADO). A jornada vem sempre da área de atendimento, ou da jornada padrão.
- Decisão: as notificações da v1 não são migradas. São descartáveis.
- Decisão: avatar mostra só as iniciais no MVP. Upload de foto fica para a Fase 2.

### 1.3 Fase 2

- **E-mail:** E03, E04 (SMTP, fila, modelos), A11 (recuperação de senha), coluna "E-mail" nas preferências de notificação.
- **Acesso:** A12 (LDAP/AD com ldapts, regras S125–S131), A04 (gerente de área), A05 (áreas destino por área solicitante), A17 (módulos por área), A19, B03, configuração `isolar_visibilidade_areas`.
- **Abertura:** B07 (categorias, 3 grupos), B09/B10 (formulários), B11 (campos personalizados), B14 (tags E/OU/NÃO).
- **Ciclo:** C08 (vários operadores), C10 (calendário), C18 (solicitar retorno), C19 (auto-encerramento por inatividade), C20 (subchamados), C24 (lembretes), C25 (co-autoria), edição e remoção de comentários (15 min).
- **Tempo:** D07 (registro de horas: aba "Tempo"), D08 (tempo em fila direta).
- **Comunicação e conhecimento:** E02 (mural de avisos), F02 (busca em soluções com tsvector), F03 (soluções padrão).
- **Consultas:** G02 (colunas salvas, XLSX/PDF), G05 (relatórios avançados), filtros salvos.
- **Integração:** H01 (API pública `/api/v1` com tokens Bearer, regras S132–S138).
- **Inventário:** I03–I09 (fabricantes, modelos, movimentações, composição, garantias, documentos, relatórios).
- **Outros:** upload de avatar, exportação de dados pessoais (S124).

### 1.4 Fase 3

- **Clientes e custos:** A07 (clientes), A09 (centros de custo), C26 (custos), C27 (recursos).
- **Acesso:** A13 (OIDC), A14 (auto-cadastro).
- **Entrada externa:** B18 (abertura por e-mail via IMAP, regras S139–S145), B19 (formulário anônimo), E05 (listas de distribuição), E07 (avaliação por link assinado).
- **Organização:** C21 (projetos), B15 e G06 (nuvem de tags e relatórios de nicho).
- **Inventário:** I11–I13, I15, I17.
- **Escala:** escala horizontal (`@socket.io/postgres-adapter`, várias instâncias).

### 1.5 Fora do escopo

- **Do Teams:** reações com emoji; conversas, DMs, canais e equipes; reuniões de vídeo e áudio; status "Não perturbe" (só Disponível, Ocupado e Ausente).
- **Do OCOMON:** A08, A15, A18 (multi-idioma; a interface é 100% pt-BR), B06, B08, C28, D09, D10, E06 (URL sem login), G07, I10, I14, I16, I18.
