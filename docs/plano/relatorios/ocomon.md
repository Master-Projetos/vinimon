> Relatório do especialista, copiado literalmente (referência). Em conflito vale a Parte A (`docs/plano/fundamentos/`), depois a Parte B (`docs/plano/tarefas/`), depois este relatório.

# Inventário de funcionalidades do OCOMON comparado ao Vinimon

## 0. Fontes e convenções

O site oficial (ocomon.com.br) e o site antigo (ocomonphp.sourceforge.io) não puderam ser lidos: o DNS deles não resolve neste ambiente. O web.archive.org também está bloqueado. Por isso a pesquisa usou o SourceForge e o próprio código das versões oficiais. Os pacotes foram lidos por streaming (curl | tar -xzO), sem gravar nada em disco.

| Código | Fonte verificada |
|---|---|
| **S1** | Página do projeto: https://sourceforge.net/projects/ocomonphp/ (autor flavio_ribeiro, versão 6.8.1 de 02/09/2026, recursos listados) |
| **S2** | Lista de versões: https://sourceforge.net/projects/ocomonphp/files/OcoMon_6.x/ (6.0 de 12/2024 até 6.8.1 de 09/2026) |
| **S3** | LEIAME.md 6.8.1: https://sourceforge.net/projects/ocomonphp/files/OcoMon_6.x/6.8.1/ (requisitos, cron, LDAP, API) |
| **S4** | `changelog/Changelog incremental.md` (notas da 6.0), dentro de https://sourceforge.net/projects/ocomonphp/files/OcoMon_6.x/6.8.1/ocomon-6.8.1.tar.gz |
| **S5** | `changelog/changelog-4.0.md`, dentro de https://sourceforge.net/projects/ocomonphp/files/OcoMon_5.0/Final/ocomon-5.0.tar.gz |
| **S6** | `changelog/Changelog-5.0.pdf`, no mesmo pacote da 5.0 |
| **S7** | `changelog/changelog-3.0.md`, `changelog-3.1.1.md` e `changelog-3.3.md`, no mesmo pacote da 5.0 |
| **S8** | SQL de instalação `install/6.x/01-DB_OCOMON_6.x-FRESH_INSTALL_STRUCTURE_AND_BASIC_DATA.sql` do pacote 6.8.1 (estrutura, valores padrão e dados iniciais) |
| **S9** | Código-fonte 6.8.1: `ocomon/service/update_auto_approval.php`, `update_auto_close_due_inactivity.php`, `check_reminders.php`, `includes/functions/reminder_functions.php`, `ticket_delegate_functions.php`, `dbFunctions.php`, `api/ocomon_api/index.php`, `app/Core/OcomonApi.php`, `includes/common/auth_process.php`, `includes/languages/pt_BR.php`, `install/crontab/crontab_example.md` |
| **V** | Código atual do Vinimon: `/home/user/vinimon/server.js`, `/home/user/vinimon/db.js`, `/home/user/vinimon/README.md`, `/home/user/vinimon/public/app.js` |
| **[K]** | Conhecimento próprio ou inferência, **não verificado** |
| **[Decisão]** | Escolha de design proposta aqui para o Vinimon, para não deixar decisão em aberto para os agentes Haiku. Não é comportamento do OCOMON. |

**Lacunas.** Não li a documentação da API (ocomon.com.br/site/integracao/), os posts "versão 6 novas funcionalidades" e as notas das versões 6.1 a 6.8. O changelog dentro do pacote só cobre a 6.0. Os recursos posteriores a 6.0 (lembretes, co-autoria) foram identificados pelo código e pelo esquema do banco (S8, S9); a versão em que entraram não foi confirmada.

---

## 1. Tabela de funcionalidades

Na coluna "Vinimon", **sim**, **parcial** e **não** valem para o código atual (V).

### A. Acesso, organização e segurança
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| A01 | Níveis de acesso | Administrador, Operador, Somente abertura, Desabilitado | sim (flag `ativo` no lugar de "Desabilitado") | MVP | Base do controle de acesso; manter os 3 níveis mais a flag `ativo` | S8, V |
| A02 | Área primária + áreas secundárias | Usuário com 1 área primária e N secundárias; o encaminhamento aceita operador da área secundária | parcial (só primária) | MVP | Visibilidade e encaminhamento dependem disso; mudar depois exige migração | S5, S8 (`usuarios_areas`) |
| A03 | Isolamento de visibilidade entre áreas | Configuração que limita consultas e relatórios às áreas do operador | parcial (sempre isolado, sem configuração) | MVP | Já existe implícito; precisa virar regra única aplicada em API, tempo real e busca | S8 (`conf_isolate_areas`), S6 |
| A04 | Gerente de área | Gerente de várias áreas, seção "Áreas geridas", gestão limitada de usuários | não | Fase 2 | Útil para gestores, não bloqueia a operação | S5, S6 |
| A05 | Áreas destino por área solicitante | Define para quais áreas de atendimento cada área pode abrir chamado, com uma área padrão | não | Fase 2 | Restrição organizacional; o MVP abre para qualquer área que atende | S6, S8 (`areaxarea_abrechamado`) |
| A06 | Unidades e departamentos | Unidade (local físico) → Departamento (setor); usuário e ativo ligados a departamento | parcial (`locais` planos) | MVP | Substitui `locais` já na migração para evitar mudança de esquema depois | S6, S8 (`localizacao`, `instituicao`) |
| A07 | Clientes | Entidade multi-cliente (tipos, status, domínio de e-mail, unidade sede) | não | Fase 3 | Só faz sentido para prestador de serviço; aumenta muito o escopo | S6, S4 |
| A08 | Prédios, reitorias, domínios de rede | Classificações extras de localização | não | Não fazer | Legado de uso acadêmico; departamento e unidade bastam | S6, S8 |
| A09 | Centros de custo | Cadastro ligado a cliente e ativos | não | Fase 3 | Depende de custos e clientes | S6 |
| A10 | Login local robusto | Hash forte (bcrypt desde a 4.0), limite de tentativas, "lembrar usuário", login no formato de e-mail, registro do último login | parcial (bloqueio só em memória) | MVP | Pedido de segurança; o bloqueio precisa persistir | S5, S7 |
| A11 | Recuperação de senha por e-mail | Link de redefinição; só para autenticação local | não | Fase 2 | Depende do envio de e-mail (E03) | S5, S8 (evento `forget-password`) |
| A12 | Autenticação LDAP/AD | Bind LDAP; cria o usuário local no 1º login com área padrão; botão de teste | não | Fase 2 | Muito usado em empresas brasileiras; escopo moderado | S3, S5, S9 (chaves `LDAP_*`) |
| A13 | SSO OpenID Connect | Experimental, testado com Keycloak | não | Fase 3 | Marcado como experimental no próprio OCOMON | S4, S9 (chaves `OIDC_*`) |
| A14 | Auto-cadastro de usuário | Usuário se cadastra e o administrador confirma | não | Fase 3 | Risco de abuso; LDAP ou cadastro pelo admin cobre | S8 (`utmp_usuarios`, eventos `cadastro-usuario*`), S9 |
| A15 | Administrador navega como operador | Alterna o próprio nível | não | Não fazer | Pouco valor; complica as permissões | S5 |
| A16 | Log de auditoria | Ações de usuários; no OCOMON 6 só exclusão de ativos | não | MVP | Segurança: o Vinimon deve registrar todas as ações administrativas e exclusões | S4 |
| A17 | Módulos de acesso por área | Habilitar inventário por área, com restrição a clientes e unidades | não | Fase 2 | O MVP libera o inventário a operadores, como hoje | S6, S7 |
| A18 | Multi-idioma (pt-BR/en/es) | Arquivos de idioma | não | Não fazer | Decisão já tomada: interface 100% pt-BR | S7 |
| A19 | Operador não trata o próprio chamado | Configuração: chamados abertos pelo operador são tratados como de somente-abertura | não | Fase 2 | Regra de governança simples | S5, S8 (`conf_allow_op_treat_own_ticket`) |

### B. Abertura de chamados
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| B01 | Formulário web com dados pré-preenchidos | Contato, e-mail de contato, telefone e departamento vêm do perfil | parcial | MVP | Núcleo do sistema | S4, S7 |
| B02 | Abrir em nome de outro usuário | Separa "solicitante" de "registrado por" | sim (sem registrar o autor) | MVP | Já existe; falta guardar quem registrou | S4, S8 (`registration_operator`) |
| B03 | Somente-abertura abre para colega | Configuração; só para o mesmo departamento | não | Fase 2 | Caso de secretária ou gestor | S4 |
| B04 | Abertura dinâmica | Escolhe primeiro o tipo, que define área e formulário | parcial (tipo define área) | MVP | Fluxo moderno e simples | S6, S8 (`sis_opening_mode`, `prob_area_default`) |
| B05 | Tipos de solicitação N:N com áreas | Área padrão, descrição exibida na abertura, ativar/desativar | parcial (1 área) | MVP | Mudança estrutural; fazer cedo | S5, S6 |
| B06 | Tipo oculto para áreas específicas | Exceções de visibilidade do tipo | não | Não fazer | Complexidade sem ganho claro | S5 |
| B07 | Categorias de tipos + pré-filtros | Até 6 grupos de categorias; solicitante filtra em cadeia | não | Fase 2 | Com 3 grupos fixos [Decisão] | S4, S8 |
| B08 | Árvore de tipos de solicitação | Visão hierárquica para administração | não | Não fazer | Lista com filtro por categoria resolve | S4 |
| B09 | Formulários de abertura (perfis de tela) | Campos visíveis e obrigatórios por formulário; campo de upload obrigatório | não | Fase 2 | Depende de B11 | S5, S6, S8 (`configusercall`, `screen_field_required`) |
| B10 | Obrigatoriedade nas etapas de edição e encerramento | Campos exigidos por etapa | não | Fase 2 | Junto com B09 | S5 |
| B11 | Campos personalizados | Tipos texto, número, seleção, seleção múltipla, data, hora, data e hora, área de texto, caixa de marcação; máscara/regex; usados no filtro avançado | não | Fase 2 | Muito usado no OCOMON; exige UI dinâmica | S5, S6, S8 (`custom_fields`) |
| B12 | Canal da solicitação | Web, Telefone, E-mail, Automático via e-mail, API | não | MVP | Tabela mínima; prepara e-mail e API | S5, S8 (dados iniciais de `channels`) |
| B13 | Tags (rótulos) | Livres, até 30 caracteres, adicionáveis em qualquer etapa | não | MVP | Barato e alimenta filtros e busca | S5, S8 (`input_tags`) |
| B14 | Filtro de tags E/OU/NÃO | Operadores combinados no filtro avançado | não | Fase 2 | O MVP filtra só "contém todas" | S5 |
| B15 | Nuvem de tags | Card no painel e relatório por período | não | Fase 3 | Cosmético | S5 |
| B16 | Anexos | Tipos permitidos, tamanho máximo (até 20 MB), quantidade máxima, também em comentários | parcial (5 MB, base64, BLOB no banco) | MVP | Mover para disco/storage com limites configuráveis | S4, S6, S8 |
| B17 | Reincidência / histórico do ativo na abertura | Ao informar a etiqueta, mostra os chamados anteriores do equipamento | não | MVP | Barato e muito útil para o operador | S1 ("Detecção de reincidências"), S7 (3.3), S8 (`conf_scr_chkhist`); comportamento exato [K] |
| B18 | Abertura por e-mail | IMAP com filtros de assunto/corpo, anexos, resposta vira comentário, identifica remetente, só endereços cadastrados, OAuth do Office365 | não | Fase 3 | Complexo (parsing de respostas, OAuth); depende de E03 e H01 | S3, S4, S5, S8 (chaves `MAIL_GET_*`, `API_TICKET_BY_MAIL_*`) |
| B19 | Formulário sem autenticação | Formulário público com captcha, status, canal e tags automáticos | não | Fase 3 | Superfície de ataque; baixa prioridade | S5, S6, S8 (chaves `ANON_OPEN_*`) |
| B20 | Sugestão da base de conhecimento ao digitar | Recurso exclusivo do Vinimon | sim | MVP | Manter (não é do OCOMON) | V |

### C. Filas e ciclo de vida do chamado
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| C01 | Status configuráveis | Fila aberta/direta/oculta, parada de relógio, cor de fundo e de texto | parcial (cor e tipo) | MVP | O SLA filtrado depende disso | S4, S5, S7, S8 (`stat_painel`, `stat_time_freeze`) |
| C02 | Status "ignorado" | Funciona como arquivamento: some de listas e relatórios | não | MVP | Uma flag; cabe junto com C01 | S6, S8 (`stat_ignored`) |
| C03 | Prioridades de atendimento | Cor de fundo e de texto, prioridade padrão | parcial | MVP | Adicionar a prioridade padrão e a cor de texto | S5, S8 (`prior_atend`) |
| C04 | Filas e guias | Fila aberta, fila direta, "Minha área", "Agendados para mim", "Pendentes de aprovação" | parcial (lista com filtros) | MVP | Organização central do atendimento | S5, S6 |
| C05 | Indicadores na fila | Selo "Novo" (até 10 min), última interação (autor e data), descrição ao passar o mouse | não | MVP | Barato; ganho direto de UX | S5 |
| C06 | Assumir ("Atender") | Coloca na fila direta, com comentário opcional | sim | MVP | Já existe | S5, V |
| C07 | Encaminhar para área e/ou operador | Inclui operadores de área secundária | sim (só área primária) | MVP | Ajuste ligado a A02 | S5, V |
| C08 | Vários operadores no chamado | Principal + auxiliares, flags "pode encaminhar" e "pode receber" | não | Fase 2 | Tabela de operadores por chamado | S6, S8 (`ticket_x_workers`, `can_route`, `can_get_routed`) |
| C09 | Agendamento com retorno automático | Sai das filas e volta na data marcada | parcial (só muda o status) | MVP | Falta o job de retorno | S6, S8 (mensagem `agendamento-para-*`) |
| C10 | Calendário de chamados | Abertos, concluídos e agendados; cor por operador | não | Fase 2 | Visual, depende de C08 | S6, S8 (`user_bgcolor`) |
| C11 | Regras de primeira resposta | Marcação opcional ao encaminhar/agendar | parcial | MVP | Mede o SLA de resposta | S6, S7 (3.1.1), S8 (`set_response_at_routing`) |
| C12 | Comentários públicos e privados | Busca e ordenação na lista; operador responsável comenta sem editar | sim | MVP | Já existe | S4, S6, V |
| C13 | Conclusão pelo operador | Solução + descrição técnica; status "concluído" diferente de "encerrado" | parcial (encerra direto) | MVP | Muda a máquina de estados; fazer cedo | S6, S8 (`conf_status_done`) |
| C14 | Validação e avaliação pelo solicitante | Aprovar com avaliação Ótimo/Bom/Regular/Ruim, ou rejeitar (volta à fila) | não | MVP | Recurso central da 5.0; afeta o modelo de dados | S6, S8 (`tickets_rated`) |
| C15 | Auto-aprovação e auto-avaliação | Após N dias (opção de dias úteis) | não | MVP | Sem isso, chamados ficam presos em "concluído" | S6, S9 |
| C16 | Reabertura | Justificativa obrigatória, prazo em dias, só solicitante ou responsável | parcial (qualquer operador ou o dono, sem prazo) | MVP | Ajuste de regra | S5, S8 (`conf_allow_reopen`, `conf_reopen_deadline`) |
| C17 | Cancelamento | Status "Cancelado" (final) | não | MVP | Substitui o "encerrar o próprio chamado" do Vinimon | S8 (status 12 "Cancelado"); comportamento [K] |
| C18 | Solicitar retorno ao solicitante | Botão que muda o status e notifica | não | Fase 2 | Ligado a C19 | S4, S8 (evento `request-feedback`) |
| C19 | Auto-encerramento por inatividade | Status monitorados, N dias sem retorno do solicitante | não | Fase 2 | Job em background; regras bem definidas | S4, S9 |
| C20 | Subchamados | Pai e filho; o pai não encerra com filhos abertos | não | Fase 2 | Tabela simples de relacionamento | S7, S9 |
| C21 | Projetos | Agrupa a família de subchamados com nome e descrição | não | Fase 3 | Depende de C20 | S4, S8 (`projects`) |
| C22 | Histórico de alterações | Registro campo a campo (antes e depois) | parcial (comentários de sistema em texto) | MVP | Alimenta o feed de Atividade e a auditoria | S7, S8 (`ocorrencias_log`) |
| C23 | Impressão do chamado | Na 5.0 permite escolher os campos | não (só imprime relatórios) | MVP | O MVP usa layout fixo de impressão (CSS) | S6, S7 |
| C24 | Lembretes por chamado | Data e texto pessoais; e-mail + notificação | não | Fase 2 | Pequeno, no espírito do Teams | S9 (`ticket_reminders`, `check_reminders.php`) |
| C25 | Co-autoria (delegação) | Solicitante dá acesso a colega do mesmo departamento e área | não | Fase 2 | Pequeno; afeta o escopo de visibilidade | S9 (`ticket_delegations`) |
| C26 | Autorização de custos + painel de custos | Campo de custo, limite por gerente, status de autorização, bloqueia a conclusão | não | Fase 3 | Nicho; depende de B11 e A04 | S4, S8 |
| C27 | Recursos alocáveis no chamado | Itens de inventário com quantidade | não | Fase 3 | Depende do inventário completo | S4, S8 (`tickets_x_resources`) |
| C28 | Replicar chamado / editar descrição e datas | Removidos no próprio OCOMON 3.0 | — | Não fazer | O próprio OCOMON abandonou | S7 |

### D. SLA e tempo
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| D01 | SLA de resposta e de solução | Metas e indicadores por chamado | parcial (24x7, em horas, por tipo) | MVP | Núcleo do help desk | S7, S9 |
| D02 | Perfis de jornada de trabalho | Horários seg–sex, sábado, domingo e feriado; opção 24x7; perfil por área | não | MVP | Sem jornada o SLA fica irreal | S1, S7, S8 (`worktime_profiles`) |
| D03 | Feriados | Data, descrição, fixo (repete todo ano) | não | MVP | Faz parte do tempo útil | S8 (`feriados`) |
| D04 | Parada de relógio por status + estágios | Intervalos de tempo por status | não | MVP | Base do cálculo de tempo útil | S1, S7, S8 (`tickets_stages`) |
| D05 | Tolerância de SLA | Faixa amarela: percentual após o vencimento (padrão 20%) | não (só "estourado sim/não") | MVP | Barato | S7, S8 (`conf_sla_tolerance`), S9 (`HELPER_SLA_TOLERANCE`) |
| D06 | Tempo de atendimento útil e absoluto | Contado da 1ª resposta até a conclusão | não | MVP | Mesmo motor de D04 | S6 |
| D07 | Registro de horas | Operadores e períodos no encerramento, vários por operador, sem sobreposição | não | Fase 2 | Pedido como registro de horas; UI própria | S4, S8 (`tickets_treaters_stages`) |
| D08 | Tempo em fila direta por operador | Cálculo automático, útil e absoluto | não | Fase 2 | Relatório derivado de D04 | S4, S9 |
| D09 | SLA de resposta por departamento | No OCOMON o SLA de resposta vem do departamento e o de solução vem do tipo | não | Não fazer | [Decisão] manter os dois SLAs no tipo de solicitação, como o Vinimon já faz | S8, S9 (consulta `localizacao.loc_prior → prioridades.prior_sla → sla_solucao`) |
| D10 | Tempo de documentação | Removido no OCOMON 3.0 | — | Não fazer | Abandonado pelo próprio OCOMON | S7 |

### E. Comunicação
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| E01 | Central de notificações | Notificações que só somem quando a pendência é resolvida; histórico das lidas | sim (simples, por polling) | MVP | Base do feed de Atividade (Teams) | S4, V |
| E02 | Mural de avisos | Título, texto, áreas destino, validade, recorrência diária, exibe uma vez por usuário | não | Fase 2 | Pequeno | S5, S7, S8 (`avisos`, `user_notices`) |
| E03 | Notificações por e-mail | SMTP, fila, teste de envio, liga/desliga | não | Fase 2 | Primeiro item da Fase 2; usa o job em background | S5, S7 (3.3), S8 (`mailconfig`, `mail_queue`) |
| E04 | Modelos de e-mail por evento | Assunto e corpo HTML/texto com variáveis | não | Fase 2 | Junto com E03 | S6, S8 (`msgconfig`) |
| E05 | Listas de distribuição de e-mail | Grupos de destinatários | não | Fase 3 | Baixo valor inicial | S8 (`mail_list`) |
| E06 | URL global do chamado | Leitura sem login | não | Não fazer | Vaza dados; o MVP usa links que exigem login | S5 |
| E07 | Avaliação por link sem login | Para chamados vindos de e-mail ou formulário anônimo (`%rating_url%`) | não | Fase 3 | Junto com B18 e B19; usar token assinado | S6, S8 (`gt_rating_id`) |

### F. Conhecimento
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| F01 | Roteiros de atendimento | Ligados a N tipos, com flag "visível ao usuário final" | parcial (FAQ ligada a 1 tipo) | MVP | Evolução natural da FAQ atual | S4, S5, S7, S8 (`scripts`, `prob_x_script`) |
| F02 | Busca em soluções | Texto completo em chamados concluídos, opção de incluir comentários e não concluídos, termos de exclusão, paginação | não | Fase 2 | Reaproveita o índice de texto completo da busca Ctrl+K | S4, S6 |
| F03 | Soluções padrão | Textos prontos escolhidos na conclusão | não | Fase 2 | Pequeno | S8 (`script_solution`), S9 (`ADM_SCRIPT_SOLUTION`) |

### G. Consultas, painel e relatórios
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| G01 | Filtro avançado | Seleção múltipla, colunas configuráveis, exportação CSV | parcial (filtros simples + CSV) | MVP | Núcleo da operação | S5, S6, S7 |
| G02 | Recursos extras do filtro | Memoriza colunas e posições; exporta Excel e PDF | não | Fase 2 | Conforto | S6, S7 |
| G03 | Painel de controle | Cards clicáveis que abrem a lista, gráficos, filtro de áreas por origem ou destino | parcial | MVP | Modernizar o atual | S5, S6, S7 |
| G04 | Relatórios básicos | Por área, tipo, operador, solicitante e status, mais SLA útil e avaliações | parcial | MVP | Já existe; acrescentar SLA útil e avaliações | S6, V |
| G05 | Relatórios avançados | Mudanças de status, tempos de atendimento, participações por operador, campos personalizados, categorias | não | Fase 2 | Dependem de D07, D08, B07 e B11 | S4, S6 |
| G06 | Relatórios de nicho | Nuvem de tags, recursos, custos, top 10 tipos | não | Fase 3 | Dependem de itens da Fase 3 | S4, S5, S9 |
| G07 | Árvore de chamados | Até 5 níveis de agrupamento encadeados | não | Não fazer | Painel + filtros + relatórios cobrem | S6 |

### H. Integração
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| H01 | API REST com aplicações registradas e tokens | Criar e ler chamado, adicionar comentário com anexos, solicitante diferente do autor do registro, limite de requisições | não | Fase 2 | A API já é Fastify; expor uma versão pública com tokens é incremental | S4, S5, S9 |

### I. Inventário
| ID | Funcionalidade OCOMON | Descrição curta | Vinimon | Prioridade | Justificativa | Fonte |
|---|---|---|---|---|---|---|
| I01 | Cadastro básico de ativos | Etiqueta, tipo, modelo, série, departamento, responsável, situação | parcial | MVP | Portar o atual com chaves estrangeiras | S7, V |
| I02 | Ativo ligado ao chamado + histórico | Chamados do ativo visíveis no ativo | parcial (só o vínculo) | MVP | Pré-requisito de B17 | S5, S7 |
| I03 | Cadastro completo | Tipos, categorias, fabricantes, modelos, part-number, valor, NF, fornecedor, data de compra | não | Fase 2 | Inventário real | S6, S8 |
| I04 | Situação operacional com destaque | Situação marcada como destacável | parcial | Fase 2 | Pequeno | S7 |
| I05 | Histórico de localização | Com autor, mais busca por localização anterior | não | Fase 2 | Rastreabilidade | S6, S8 (`historico`) |
| I06 | Composição de ativos | Componentes pai e filho; filhos acompanham a localização do pai | não | Fase 2 | Muito usado (notebook com SSD) | S6, S7 |
| I07 | Garantias | Tempo e tipo, vencimentos, calendário, aviso por e-mail | não | Fase 2 | Depende de E03 | S4, S7, S8 (`tempo_garantia`, `conf_days_bf`, `mail-about-warranty`) |
| I08 | Documentos de ativos e modelos | Arquivos anexos | não | Fase 2 | Reaproveita o storage de anexos | S6 |
| I09 | Relatórios de inventário | Por tipo, departamento, situação, garantia | não | Fase 2 | Básicos | S9 (`report_assets_*`) |
| I10 | Características mensuráveis | Unidades com fator de conversão; filtro por características agregadas | não | Não fazer | Complexo demais; campos personalizados resolvem | S6 |
| I11 | Campos personalizados no inventário | Formulários de cadastro por tipo de ativo | não | Fase 3 | Depois de B11 | S6 |
| I12 | Softwares e licenças | Como ativos "digitais" | não | Fase 3 | Escopo próprio | S4, S6 |
| I13 | Alocação de ativo a usuário | Histórico + termo de compromisso com assinatura desenhada | parcial (responsável em texto) | Fase 3 | Fluxo jurídico; no MVP o responsável vira chave estrangeira opcional | S4 |
| I14 | Formulário de trânsito de ativos | Documento de saída | não | Não fazer | Nicho | S4 |
| I15 | Cadastro em lote | Etiquetas e séries por TXT/CSV, numeração automática | não | Fase 3 | Fica como importação CSV | S4 |
| I16 | Remoção em lote | Exclusão de vários ativos | não | Não fazer | Risco; usar desativação | S4 |
| I17 | Empréstimos | Material, responsável, datas | não | Fase 3 | Baixo uso | S8 (`emprestimos`), S9 |
| I18 | Árvore de ativos, modelos de configuração, componentes avulsos | Recursos legados | não | Não fazer | Marcados como descontinuados no próprio OCOMON 5 | S6 |

---

## 2. Regras de negócio dos itens MVP e Fase 2

O papel "operador" inclui o administrador, salvo quando o texto diz o contrário. "Áreas do usuário" significa área primária mais secundárias.

### 2.1 MVP

**A01 Níveis.** São três: `ADMIN`, `OPERADOR`, `SOMENTE_ABERTURA`. "Desabilitado" vira `ativo=false` [Decisão]. Desativar um usuário revoga as sessões, tira o usuário dos seletores e preserva o histórico e a área primária (S4). O usuário não pode desativar nem rebaixar a si mesmo (V).

**A02 Áreas.** A área tem nome único, `atende` (presta atendimento), `ativo`, `email` (para a Fase 2), `perfilJornadaId` e `prazoValidacao…`. O usuário tem `areaPrimariaId` obrigatória e `areasSecundarias` (N:N). A área primária de operador ou admin precisa ter `atende=true` [Decisão].

**A03 Visibilidade.** A configuração é `isolar_visibilidade_areas` (o OCOMON usa padrão `0`, S8; o Vinimon usa padrão `true` para manter o comportamento atual [Decisão]).
- Operador **vê** um chamado se a área de atendimento está entre as suas, se ele é o responsável, se ele é o solicitante, ou (Fase 2) se é auxiliar.
- Com isolamento desligado, o operador vê todas as áreas, mas só **altera, conclui ou encaminha** chamados das suas áreas (S6).
- Somente-abertura vê os próprios chamados, mais (Fase 2) aqueles em que é co-autor e os das áreas que gerencia.
- A mesma função de escopo vale para a lista, o detalhe, o painel, os relatórios, a busca Ctrl+K, as notificações e as salas de tempo real.

**A06 Unidade e departamento.**
- `Unidade {nome único, endereco?, ativo}` → `Departamento {nome, unidadeId, ativo}`, com nome único por unidade.
- Usuário, ativo e chamado têm `departamentoId` opcional. O chamado é pré-preenchido com o departamento do solicitante.
- Migração: cada `locais` vira um departamento na unidade "Principal".

**A10 Login.**
- Bloqueio persistido no banco: 5 falhas em 15 min por login, mais limite por IP [Decisão]. Não depender de memória.
- Gravar `ultimoLoginEm` (S7). Aceitar login com formato de e-mail (S5).
- "Lembrar usuário" só lembra o login, nunca a senha (S5).
- Senhas já existentes no formato scrypt `salt:hash` continuam aceitas e são re-hasheadas no próximo login [Decisão].

**A16 Auditoria.** Tabela `LogAuditoria {usuarioId, acao, entidade, entidadeId, antes(json), depois(json), ip, criadoEm}`. Grava todo create/update/delete de cadastros, configurações, usuários e exclusões, além de login e logout. Somente leitura para o admin.

**B01, B04, B05 Abertura.**
- Passo 1: escolher o **tipo de solicitação**, com busca, exibindo a descrição do tipo e os roteiros visíveis (F01).
- A área de atendimento é a `areaPadrao` do tipo. O operador pode trocar por outra área ligada ao tipo.
- O tipo tem nome único, descrição, `ativo`, áreas (N:N, no mínimo 1), `areaPadraoId` (precisa estar entre as áreas), `slaRespostaMin` e `slaSolucaoMin` (opcionais; o Vinimon atual guarda em horas, converter multiplicando por 60). Tipo em uso não é excluído, só desativado.
- Campos obrigatórios: assunto (vem do Vinimon) e descrição. A descrição aceita rich text sanitizado no servidor (o OCOMON usa HTMLPurifier, S3).
- Campos opcionais: departamento, ativo (por etiqueta), prioridade (usa a padrão se vazio), anexos, tags (só operador), canal (só operador).
- Contato, e-mail de contato e telefone vêm pré-preenchidos do solicitante (S4).

**B02 Em nome de outro.** Só operador. Grava `solicitanteId` e `registradoPorId`. O solicitante recebe acesso e notificações como se tivesse aberto o chamado (S4). Comentário de sistema: "Aberto por X em nome de Y".

**B12 Canais.** `Canal {nome único, ativo, sistema(bool)}`. Canais com `sistema=true` não podem ser excluídos. Dados iniciais (S8 + [Decisão]): "Sistema Web", "Telefone", "E-mail", "Automático: via e-mail", "API".
- Abertura feita por somente-abertura fica com "Sistema Web" fixo.
- O operador escolhe o canal; o padrão é "Telefone" quando abre em nome de outro [Decisão].

**B13 Tags.** `Tag {nome ≤30 caracteres, único sem distinção de maiúsculas}` (S8: `varchar(30)`, `UNIQUE`). O vínculo `ChamadoTag` é N:N. Só operador cria, adiciona ou remove tags [Decisão]; o solicitante não vê as tags. No MVP o filtro é "contém todas as selecionadas". Cada mudança gera evento em C22.

**B16 Anexos.**
- Configurações: `anexos_habilitados`, `anexo_tamanho_max_mb` (padrão 10, máximo 20 conforme S4), `anexo_max_por_envio` (padrão 5), `anexo_tipos_permitidos`.
- Validar extensão e conteúdo real do arquivo (detecção pelos primeiros bytes) [Decisão].
- Upload em multipart, guardado no storage em disco. Download só com permissão sobre o chamado; tipos não seguros vão com `attachment` (V).
- O solicitante pode anexar enquanto o chamado não estiver CONCLUÍDO ou ENCERRADO (S6, S7).

**B17 e I02 Reincidência.** Ao selecionar ou digitar uma etiqueta na abertura, mostrar os últimos 10 chamados do ativo, com os não encerrados em destaque. Mostrar também os chamados do mesmo solicitante e tipo abertos nos últimos 30 dias [K/Decisão]. O detalhe do ativo lista todos os chamados dele. O vínculo é por `ativoId`, nunca pela etiqueta: mudar a etiqueta não pode quebrar o vínculo (bug corrigido no OCOMON 4.0, S5).

**C01 e C02 Status.**
- `Status {nome único, tipo, corFundo, corTexto, paradaRelogio, ignorado, ordem, ativo}`.
- `tipo` [Decisão]: `ABERTO` (fila aberta, sem responsável), `EM_ATENDIMENTO` (fila direta), `PENDENTE` (fila direta, aguardando terceiro ou usuário), `AGENDADO` (fora das filas até a data), `CONCLUIDO` (aguardando validação), `ENCERRADO` (final).
- Status de "painel oculto" (CONCLUÍDO e ENCERRADO) têm `paradaRelogio=true` obrigatório (S5).
- `ignorado=true`: o chamado não aparece em listas, painel, relatórios nem busca, salvo filtro explícito pelo status ou busca pelo número (S6).
- Status em uso não é excluído.
- Papéis em `Config` (cada um aponta para um status ativo do tipo indicado):

| Papel | Tipo permitido |
|---|---|
| `status_abertura` | ABERTO |
| `status_ao_assumir` | EM_ATENDIMENTO |
| `status_encaminhado_operador` | EM_ATENDIMENTO |
| `status_agendado` | AGENDADO |
| `status_retorno_agendamento` | ABERTO |
| `status_retorno_agendamento_operador` | EM_ATENDIMENTO |
| `status_concluido` | CONCLUIDO |
| `status_rejeitado` | ABERTO ou EM_ATENDIMENTO |
| `status_reaberto` | ABERTO ou EM_ATENDIMENTO |
| `status_encerrado` | ENCERRADO |
| `status_cancelado` | ENCERRADO |

- Troca manual de status: o operador escolhe status de tipo EM_ATENDIMENTO ou PENDENTE. Escolher um status ABERTO devolve o chamado à fila aberta e limpa o responsável. AGENDADO, CONCLUÍDO e ENCERRADO só mudam pelas ações próprias (V já faz isso para "encerrado").
- Status iniciais (S8 adaptado): Aguardando atendimento (ABERTO); Em atendimento (EM_ATENDIMENTO); Encaminhado para operador (EM_ATENDIMENTO); Aguardando retorno do solicitante (PENDENTE, parada=true); Aguardando fornecedor (PENDENTE, parada=false); Agendado (AGENDADO, parada=true); Concluído – aguardando validação (CONCLUIDO); Encerrado (ENCERRADO); Cancelado (ENCERRADO).

**C03 Prioridades.** `{nome, corFundo, corTexto, ordem, padrao}`, com exatamente uma padrão (S5). O solicitante só escolhe na abertura; depois, só o operador altera (V).

**C04 e C05 Filas.** Guias:
- "Fila aberta": status ABERTO nas áreas do operador, ordenada por prioridade (desc) e depois abertura (asc).
- "Minha fila": responsável = eu, status EM_ATENDIMENTO ou PENDENTE.
- "Agendados para mim": status AGENDADO e responsável = eu.
- "Minha área": todos os não encerrados das minhas áreas.
- "Abertos por mim".
- "Aguardando minha validação": sou o solicitante e o status é CONCLUÍDO.

Selo "Novo" quando `agora − abertura < 10 min` (S5). Indicador de última interação com autor e data do último comentário público, destacando quando foi do solicitante (S5).

**C06 Assumir.** Permitido a operador de área do chamado, com status ABERTO, EM_ATENDIMENTO ou PENDENTE. Define responsável = eu. Se o tipo atual for ABERTO, o status vai para `status_ao_assumir`. Marca a primeira resposta (C11). Comentário opcional. Se já houver outro responsável, pede confirmação e notifica o anterior. Comentar **não** transfere a responsabilidade (S5).

**C07 Encaminhar.**
- Destino: área (ativa, `atende`) e/ou operador (ativo, nível ≤ operador, com a área destino entre suas áreas, S5).
- Com operador: responsável = operador e status = `status_encaminhado_operador`.
- Só área: responsável = nulo e status = `status_abertura`.
- Se o perfil de jornada vem da área de atendimento (D02), atualizar o perfil do chamado.
- Comentário opcional. Notifica o operador destino, ou os operadores da área.

**C09 Agendar.**
- Data e hora no futuro: no mínimo agora + 1 min; hoje é permitido (S5, S7). Operador destino opcional.
- O status vai para `status_agendado` e grava `dataAgendamento`. Reagendar é permitido.
- Job **a cada 1 min**: chamados AGENDADO com data ≤ agora voltam para `status_retorno_agendamento_operador` (se tiverem responsável) ou `status_retorno_agendamento` (se não). Gera comentário de sistema e notificação. O job é idempotente: atualiza com `WHERE status atual = agendado`.

**C11 Primeira resposta.** `dataPrimeiraResposta` é gravada uma única vez, por um operador que **não** seja o solicitante, em qualquer destas ações: assumir, comentário **público**, troca de status, conclusão. Comentário privado não conta [K/Decisão]. Ao encaminhar ou agendar vale a configuração `primeira_resposta_ao_encaminhar` ∈ {SEMPRE, NUNCA, ESCOLHA}, com padrão ESCOLHA (S8). Em ESCOLHA aparece a caixa "Marcar como primeira resposta", marcada por padrão.

**C12 Comentários.**
- Tipos: PÚBLICO, PRIVADO (só operadores veem) e SISTEMA.
- O solicitante comenta enquanto o chamado não estiver CONCLUÍDO ou ENCERRADO (S6).
- Comentário do solicitante com o chamado em PENDENTE de parada "aguardando solicitante" leva o status para `status_ao_assumir` (comportamento atual do Vinimon).
- Comentários não podem ser editados nem excluídos [Decisão, coerente com S7].
- Lista com busca e ordenação (S4). Anexos em comentários são permitidos.

**C13 Concluir.**
- Permitido ao responsável ou a operador da área.
- `solucao` é obrigatória; `descricaoTecnica` é opcional (S6).
- Bloqueado se houver subchamados não encerrados (Fase 2, S9).
- Efeito: status = `status_concluido`, `dataConclusao` = agora (o SLA de solução para aqui), estágio fechado.
- Vai **direto para ENCERRADO**, sem avaliação, se `prazo_validacao_dias = 0` (S6), ou se o solicitante é quem concluiu, ou se o solicitante é o responsável (S9: a auto-aprovação exige `operador <> aberto_por`).
- Nos demais casos: notificação "Avalie o atendimento", que **persiste até ser resolvida** (S4).
- O botão "Encerrar" do dono no Vinimon atual é substituído por C17.

**C14 Validar.**
- Só o solicitante, com o chamado em CONCLUÍDO.
- **Aprovar** exige avaliação ∈ {OTIMO, BOM, REGULAR, RUIM} (S6) e aceita comentário opcional. Efeito: `status_encerrado`, `dataEncerramento`, `Avaliacao {nota, automatica=false, data}`.
- **Rejeitar** exige motivo [Decisão]. Efeito: `status_rejeitado`, `dataConclusao = null`, `rejeicoes += 1` (S8: `rejected_count`). Se o status de rejeição for EM_ATENDIMENTO, o responsável é mantido; se for ABERTO, é limpo (S6). Notifica o responsável e a área (S8: `rejeitado-para-area` e `rejeitado-para-operador`). O tempo de solução volta a contar.

**C15 Auto-aprovação.**
- Job **a cada 5 min** [Decisão; o OCOMON roda a cada 1 min, S9].
- Seleciona chamados em `status_concluido`, sem avaliação, com solicitante ≠ responsável, em que `dataConclusao + prazo_validacao_dias` < agora.
- Contagem em dias corridos, ou em dias úteis se `prazo_validacao_dias_uteis = true`. Dias úteis excluem sábado, domingo e feriados cadastrados [Decisão; o OCOMON só fala em fins de semana, S6].
- Efeito: `status_encerrado`, avaliação = `avaliacao_automatica` (padrão OTIMO, S8: `great`) com `automatica=true`, comentário de sistema "Atendimento validado automaticamente por decurso de prazo" (S9) e notificação ao solicitante.
- O update condicionado ao status garante a idempotência.

**C16 Reabrir.**
- Configurações: `permitir_reabertura` (padrão true) e `prazo_reabertura_dias` (padrão 0 = sem limite; o padrão 0 vem de S8, o significado "sem limite" é [K]).
- Permitido ao solicitante ou ao último responsável (S5), só em ENCERRADO (não em Cancelado), dentro do prazo, com justificativa obrigatória (S5).
- Efeito: `status_reaberto`, limpa `dataEncerramento` e a avaliação atual. A avaliação anterior fica no histórico (C22).

**C17 Cancelar** [Decisão; S8 só confirma que existe o status "Cancelado"].
- O solicitante cancela enquanto o tipo do status for ABERTO e não houver responsável. O operador cancela qualquer chamado não encerrado.
- Motivo obrigatório. Sem avaliação.
- Cancelados ficam fora dos indicadores de SLA e de avaliação.

**C22 Histórico.**
- `ChamadoEvento {chamadoId, autorId|null(sistema), tipo, campo, valorAnterior, valorNovo, criadoEm}` para status, prioridade, área, responsável, tipo, tags, agendamento, departamento, ativo, solicitante, avaliação, reabertura e cancelamento (S8: `ocorrencias_log`).
- Alimenta a aba "Histórico", o feed de Atividade e o relatório de mudanças de status.
- O texto amigável é gerado na leitura.

**C23 Impressão.** Rota `/chamados/:id/imprimir` com CSS de impressão: dados, descrição, comentários **públicos**, solução e avaliação [Decisão]. A escolha de campos fica para a Fase 2 (S6).

**D01 a D06 SLA e tempo.**
1. **Metas.** Na abertura e a cada troca de tipo, gravar no chamado `slaRespostaMin` e `slaSolucaoMin` copiados do tipo, além de `perfilJornadaId` [Decisão]. Meta nula significa "sem SLA" (indicador cinza).
2. **Perfil de jornada** (S8).
   - Campos: `PerfilJornada {nome, padrao(bool, exatamente 1), 24x7(bool)}` e, para cada grupo `SEG_SEX`, `SABADO`, `DOMINGO`, `FERIADO`: `inicio HH:MM` e `fim HH:MM`, ou vazio para "sem expediente".
   - Regras: `fim > inicio`; sem turnos que atravessam a meia-noite [Decisão].
   - A área tem um perfil. Configuração `jornada_base` ∈ {AREA_ATENDIMENTO (padrão), AREA_SOLICITANTE} (S8: `conf_wt_areas`, padrão "2" = destino).
3. **Feriados.** `{data, descricao, fixo}`. Feriado `fixo` vale todo ano no mesmo dia e mês (S8: `fixo_feriado`).
4. **Estágios** (S7, S8). Toda mudança de status fecha o estágio aberto (`fim = agora`) e abre outro: `ChamadoEstagio {chamadoId, statusId, inicio, fim|null}`. A abertura do chamado abre o primeiro estágio.
5. **Tempo útil.** É a soma, sobre os estágios cujo status tem `paradaRelogio=false`, da interseção de cada intervalo com a jornada do perfil.
   - O cálculo é dia a dia no fuso `America/Sao_Paulo` (configuração `fuso_horario`).
   - Data que coincide com feriado usa o grupo FERIADO.
   - Perfil `24x7`: intervalo inteiro.
   - **Tempo absoluto** = horário real, sem filtros.
   - Função pura em `packages/shared`, com testes de tabela [Decisão].
6. **SLA de resposta.** Tempo útil da abertura até `dataPrimeiraResposta` (ou até agora). **SLA de solução**: da abertura até `dataConclusao` (ou até agora). Os dois respeitam as paradas de relógio [K/Decisão].
7. **Indicador.** `pct = útil / meta`. Verde se `pct ≤ 100%`; amarelo se `100% < pct ≤ 100% + tolerância`; vermelho acima disso. `sla_tolerancia_pct` tem padrão 20 (S8, S9: "percentual de tempo que o chamado ficará com o indicador amarelo após estourar o SLA").
8. **Na conclusão**, gravar `tempoUtilRespostaMin`, `tempoUtilSolucaoMin`, `tempoAbsolutoSolucaoMin` e `tempoAtendimentoUtilMin` / `tempoAtendimentoAbsMin` (da 1ª resposta até a conclusão, S6). Na rejeição ou reabertura, recalcular na próxima conclusão. Chamados abertos são calculados na leitura.
9. A janela "Informações de SLA" do detalhe mostra metas, tempo útil e absoluto, percentual e o tempo de atendimento (S6).

**E01 Central de notificações.**
- Eventos (S4, mapeados): interação no chamado (para solicitante e responsável), encaminhamento, agendamento, retorno de agendamento, conclusão (pedido de avaliação), avaliação recebida, rejeição, auto-avaliação, @menção (Teams), reabertura, cancelamento.
- A notificação "avaliação pendente" não pode ser marcada como lida manualmente; some quando o chamado é validado (S4).
- Seção de histórico com as lidas.
- Respeita o escopo de visibilidade (A03): comentário privado nunca notifica somente-abertura (V).

**F01 Roteiros / base de conhecimento.**
- `Roteiro {titulo, conteudo(rich text sanitizado), visivelSolicitante(bool), ativo}` com N:N para tipos (S8: `scpt_enduser`, `prob_x_script`).
- Somente-abertura vê só os visíveis e publicados, inclusive no detalhe dos próprios chamados (S5).
- Exibido na abertura (ao escolher o tipo) e no detalhe. A sugestão enquanto digita (B20) também busca nos roteiros.
- Migração: cada FAQ vira roteiro com `visivelSolicitante=true`.

**G01 Filtro avançado.**
- Seleção múltipla de área, status, prioridade, tipo, responsável, solicitante, canal, tags e departamento; períodos de abertura e conclusão; SLA (verde/amarelo/vermelho); avaliação; "teve rejeição" (S6).
- Exige período: o padrão são os últimos 90 dias [Decisão; o OCOMON proíbe consulta sem critério, S5].
- Colunas configuráveis.
- CSV com proteção contra injeção de fórmulas (o Vinimon já tem `csvCel`).
- Paginação no servidor, máximo 200 por página (V).

**G03 Painel.**
- Cards clicáveis que abrem a lista filtrada (S5): abertos, fila aberta sem responsável, minha fila, abertos hoje, concluídos hoje, SLA vermelho, SLA amarelo, aguardando avaliação (S6).
- Gráficos: por status, prioridade e área; abertos × encerrados nos últimos 4 meses; avaliações do mês (S6).
- Filtro de áreas com modo origem (área do solicitante) ou destino (S5). Sempre respeita A03.

**G04 Relatórios básicos.** Mantém os atuais (área, tipo, operador, solicitante, status, CSV e impressão) e acrescenta:
- SLA calculado com tempo útil: % dentro do prazo de resposta e de solução, por área e por tipo;
- avaliações: distribuição, % de automáticas e média por operador.

**I01 Ativos.**
- `Ativo {etiqueta (alfanumérica, sem espaços, única) [S5, S7], tipo(texto no MVP), modelo, serie, departamentoId, responsavelUsuarioId?, responsavelTexto? (legado), situacao ∈ {EM_USO, EM_ESTOQUE, EM_MANUTENCAO, BAIXADO}, observacao, ativo}`.
- Exclusão só por admin e só sem chamados ligados; nos outros casos, situação BAIXADO (S7).

### 2.2 Fase 2

**A04 Gerente de área** (S5, S6).
- N:N usuário↔área gerida.
- Somente-abertura só gerencia áreas que não atendem. Operador ou admin só gerencia áreas de que faz parte.
- O gerente vê a guia "Áreas geridas": chamados abertos pelos usuários das áreas geridas, com os mesmos filtros.
- Lista os usuários da área e altera apenas telefone, departamento e ativo [Decisão].

**A05 Áreas destino por área solicitante** (S6). N:N `areaSolicitante → areaAtendimento`, com exatamente uma padrão. Na abertura dinâmica, só aparecem tipos com alguma área permitida. Se nenhuma estiver configurada, todas são permitidas.

**A11 Recuperação de senha.**
- Só para usuários com autenticação LOCAL (S5).
- Token aleatório de uso único, guardado como hash, válido por 60 min [Decisão].
- Resposta sempre genérica, sem revelar se o e-mail existe. Evento de e-mail "recuperar senha".

**A12 LDAP** (S3, S5, S9).
- Configuração: host, porta, base DN, domínio, atributos de e-mail, nome completo e telefone, área padrão para novos usuários.
- Campo `origemAutenticacao` ∈ {LOCAL, LDAP} por usuário [Decisão].
- Fluxo de login:
  1. se existe usuário LOCAL com o login, autentica localmente;
  2. senão, faz bind LDAP;
  3. se o bind funcionar e o usuário não existir, cria como SOMENTE_ABERTURA na área padrão, com nome, e-mail e telefone vindos do LDAP;
  4. se o bind falhar, retorna erro genérico.
- Usuários LDAP não trocam nem recuperam senha no sistema (S5).
- Botão "Testar conexão" (S9: `test_ldap_settings`). A senha de bind fica cifrada em repouso [Decisão].

**A17 Módulos por área.** Flag `moduloInventario` na área. Operadores de áreas sem a flag não acessam o inventário. O admin sempre acessa (S6).

**A19 Operador não trata o próprio chamado.** Configuração `operador_trata_proprio_chamado` (padrão true, S8). Com false, no chamado em que é solicitante, o operador tem só as ações de somente-abertura (S5).

**B03.** Configuração `somente_abertura_abre_para_outros` (padrão false). Quando true, o seletor de solicitante lista só usuários ativos do **mesmo departamento** (S4).

**B07 Categorias** [Decisão: 3 grupos].
- Configuração com o rótulo de cada grupo (padrão "Categoria 1..3", S8).
- `Categoria {grupo 1..3, nome}`. O tipo tem até 1 categoria por grupo.
- Pré-filtros: configuração global (e opcionalmente por área, S4) que define quais grupos o solicitante escolhe, em cadeia, antes do tipo.
- Com pré-filtros ativos, só aparecem tipos que tenham categoria em **todos** os grupos exigidos (S4).

**B09 e B10 Formulários.**
- `FormularioAbertura {nome, padrao}`, com campos padrão configuráveis (visível/obrigatório): departamento, ativo, contato, telefone, e-mail de contato, prioridade, upload (anexo obrigatório, S6), tags, agendar, encaminhar.
- Inclui campos personalizados com três opções: na abertura; só em edição e detalhe; nunca visível ao solicitante (S6).
- O tipo aponta para um formulário; sem formulário, usa o padrão (S6).
- Obrigatoriedade por etapa (edição e conclusão) configurada à parte (S5).

**B11 Campos personalizados.**
- `CampoPersonalizado {nome, titulo, tipo ∈ {TEXTO, NUMERO, SELECAO, SELECAO_MULTIPLA, DATA, HORA, DATA_HORA, AREA_TEXTO, CHECKBOX}, valorPadrao, obrigatorio, mascara?, regex?, ativo, alvo=CHAMADO}`, com opções para os tipos de seleção (tipos conforme S8).
- Se houver regex, ela valida no servidor (S5).
- Valores guardados em `ChamadoCampoValor` (tabela própria com coluna tipada, ou JSON validado por Zod) [Decisão: tabela `chamado_campo_valor` com `valorTexto`, `valorNumero`, `valorData`, `valorOpcoes[]`].
- No filtro avançado: todos os tipos exceto área de texto e checkbox; faixas para número, data e data/hora (S5).
- **Toda alteração gera evento** em C22. Isso corrige uma limitação conhecida do OCOMON (S5, S6).

**B14 Tags E/OU/NÃO.** O filtro aceita: "todas de" (E), "alguma de" (OU) e "nenhuma de" (NÃO), combináveis (S5).

**C08 Vários operadores.**
- `ChamadoOperador {chamadoId, usuarioId, principal(bool), atribuidoEm}`, com exatamente um principal enquanto houver responsável (S8).
- Flags do usuário: `podeEncaminhar` (só operadores; permite encaminhar para a fila direta de outro operador) e `podeReceber` (pode receber encaminhamentos e agendamentos) (S6).
- Auxiliares veem e comentam o chamado e recebem notificações (S4). Só o principal conclui [Decisão].

**C10 Calendário.** Eventos: abertura (data de abertura), conclusão e agendamento. Filtros por área e operador. Cor de fundo e de texto por operador (`corCalendario`, S6, S8). Ao agendar, o calendário do operador aparece para evitar conflito (S6).

**C18 Solicitar retorno** (S4, S8).
- Botão do responsável. O status vai para `status_aguardando_retorno`, que precisa estar em `status_monitorados_inatividade`.
- Comentário público obrigatório com o pedido [Decisão].
- Notificação e e-mail "Solicitação de retorno" ao solicitante, avisando que o chamado será encerrado se não houver resposta.

**C19 Auto-encerramento por inatividade** (S4, S9).
- Configurações:
  - `status_monitorados_inatividade` (lista; vazia desliga o recurso);
  - `dias_inatividade` (padrão 7, S8);
  - `inatividade_dias_uteis` (padrão false);
  - `status_retorno_pos_inatividade` (padrão "Aguardando atendimento", S8: `stat_out_inactivity` = 1);
  - `avaliacao_auto_inatividade`.
- Job **a cada 15 min** [Decisão]. Seleciona chamados com status monitorado, solicitante ≠ responsável e último comentário que **não** é do solicitante.
- Data de referência: a **última mudança de status** (S9: `referenceDateConfig = 2`).
- Encerra quando `referência + dias` < agora. Efeito: `status_encerrado`, avaliação automática, comentário de sistema, notificação e e-mail "Encerramento automático".
- Excluir chamados cujo solicitante é o usuário técnico de e-mail ou de formulário anônimo (S9).
- Gatilho síncrono: comentário do solicitante com status monitorado leva o status para `status_retorno_pos_inatividade`.

**C20 Subchamados** (S7, S9).
- `ChamadoRelacao {paiId, filhoId}`, com único `filhoId`: cada filho tem um só pai. Proibir ciclos.
- "Abrir subchamado" no detalhe abre o formulário de abertura já preenchido com o vínculo e gera comentário de sistema no pai.
- Vincular ou desvincular gera comentário de sistema em ambos.
- O pai **não pode ser concluído** enquanto houver filho que não esteja ENCERRADO (S9: "não pode ser encerrada pois possui dependências em subchamados").
- O detalhe mostra o pai e os filhos com status.

**C24 Lembretes** (S9).
- `Lembrete {chamadoId, usuarioId, dataHora, texto, processado}`.
- Visível e editável só pelo dono, por chamado. Exige permissão de leitura no chamado.
- Job **a cada 1 min**: processa `processado=false AND dataHora ≤ agora`; envia notificação interna (e e-mail se E03 estiver ativo) e marca `processado=true`.

**C25 Co-autoria** (S9).
- O solicitante concede acesso a usuários **do mesmo departamento e da mesma área**, nível SOMENTE_ABERTURA, que não sejam o próprio solicitante nem já co-autores. O solicitante pode revogar.
- O co-autor vê, comenta e anexa; **não** valida nem cancela [Decisão; a extensão das permissões é K].
- O co-autor recebe as notificações do chamado. Guia "Compartilhados comigo".

**D07 Registro de horas** (S4).
- Na conclusão (e também durante o atendimento [Decisão]), o operador adiciona `PeriodoAtendimento {chamadoId, operadorId, inicio, fim, autorId}`.
- Vários períodos e vários operadores são permitidos; para o **mesmo operador** os períodos **não podem se sobrepor**.
- `fim > inicio` e `fim ≤ agora`.
- Operadores informados nos períodos recebem notificação "citado como participante" (S4).

**D08 Tempo em fila direta.** Para cada estágio cujo status tem tipo EM_ATENDIMENTO ou PENDENTE e que tem responsável, somar o tempo útil e o absoluto por operador. Para isso, o estágio passa a guardar também `responsavelId` [Decisão]. O resultado alimenta o relatório "Tempos de atendimento por operador" (S4).

**E02 Mural de avisos** (S5, S7, S8).
- `Aviso {titulo ≤60, texto, areasDestino (vazio = todas, inclusive áreas solicitantes), validade?, recorrente(bool), ativo, autorId, criadoEm}`.
- Exibido como pop-up ao entrar nas filas e na página inicial. Mostra a data de publicação.
- Não recorrente: aparece uma vez por usuário. Recorrente: volta a aparecer uma vez por dia. Controle por `AvisoVisto {avisoId, usuarioId, ultimaExibicao}`.
- Expirado ou inativo não aparece.
- Só admin cria [Decisão].

**E03 e E04 E-mail.**
- Configuração SMTP: host, porta, segurança (NENHUMA, STARTTLS, TLS), autenticação, usuário, senha cifrada, remetente, nome do remetente.
- `email_habilitado` (S7 3.3). Botão "Enviar e-mail de teste" (S5).
- Todo envio passa por fila: job `email.enviar` com 5 tentativas e backoff (S5: fila de e-mails).
- Modelos: `ModeloEmail {evento, assunto, corpoHtml, corpoTexto, ativo}`. Variáveis `{{numero}}`, `{{assunto}}`, `{{descricao}}`, `{{solicitante}}`, `{{contato}}`, `{{contatoEmail}}`, `{{telefone}}`, `{{departamento}}`, `{{area}}`, `{{operador}}`, `{{autor}}`, `{{tipo}}`, `{{status}}`, `{{dataAgendamento}}`, `{{link}}`, `{{sistema}}`, com escape HTML e lista fechada de variáveis [Decisão; o OCOMON usa `%var%`, S8].
- Eventos da Fase 2 (subconjunto de S8):

| Evento | Destinatário |
|---|---|
| abertura | solicitante, área, operador encaminhado |
| comentário público | solicitante e responsável |
| encaminhamento | operador ou área |
| agendamento | solicitante e operador |
| conclusão / pedido de avaliação | solicitante |
| rejeição | área e operador |
| reabertura | — |
| solicitação de retorno | solicitante |
| encerramento automático | solicitante |
| lembrete | dono do lembrete |
| recuperação de senha | usuário |
| aviso de garantia | — |

- Destinatário de área = `area.email`; se vazio, os operadores da área.
- O usuário pode desligar e-mails não críticos nas preferências [Decisão].

**F02 Busca em soluções** (S4, S6). Busca de texto completo no Postgres (`tsvector` em português) sobre assunto + descrição + solução dos chamados concluídos e encerrados. Opções: "incluir comentários públicos", "incluir não concluídos", "excluir termos" (prefixo `-`). Paginada. Respeita A03.

**F03 Soluções padrão.** `SolucaoPadrao {titulo, texto, ativo}`. Na conclusão, escolher uma copia o texto para o campo de solução, que continua editável.

**G02 e G05 Relatórios.**
- Colunas e ordem salvas por usuário; exportação XLSX e PDF.
- Novos relatórios:
  - mudanças de status (a partir de C22);
  - tempos por chamado e por operador (D07 informado × D08 em fila direta);
  - participações por operador (direto, via encaminhamento principal ou auxiliar, por períodos informados; total sem contagem dupla, S4);
  - por campo personalizado;
  - por categorias;
  - quadro geral por área, com avaliações (S6).

**H01 API pública** (S4, S5, S9).
- `AplicacaoApi {nome, escopos[], ativa}` e `TokenApi {aplicacaoId, usuarioId (identidade usada nas ações), hash, prefixo, criadoEm, ultimoUsoEm, revogadoEm}`.
- O token é mostrado uma única vez. Autenticação por `Authorization: Bearer` [Decisão; o OCOMON usa os cabeçalhos `login`/`app`/`token`, S9].
- Endpoints `/api/v1`:
  - `POST /chamados` (campo `solicitante` opcional; quem registra é o usuário do token, S4);
  - `GET /chamados/:id`;
  - `POST /chamados/:id/comentarios`.
  - Os três aceitam anexos em multipart (S4).
- Escopos: `chamados:ler`, `chamados:criar`, `comentarios:criar`.
- Limite de requisições por token (o OCOMON usa 60 req/s, S9; [Decisão]: 60 req/min). Canal "API". Respeita A03 para o usuário do token. Documentação OpenAPI gerada.

**I03 a I09 Inventário.**
- Cadastros: `TipoAtivo {nome, podeSerComponente, podeTerComponentes}`, `Fabricante`, `Modelo {tipoId, fabricanteId, nome}`.
- Novos campos do ativo: `modeloId`, `partNumber`, `valor`, `notaFiscal`, `fornecedor`, `dataCompra`, `garantiaMeses`, `tipoGarantia`, `situacaoDestacada` (I04).
- Histórico de localização: `AtivoMovimento {ativoId, deDepartamentoId, paraDepartamentoId, autorId, data}` a cada troca de departamento, com busca "por localização anterior" (S6).
- Composição: `ativo.paiId`. Só se o tipo do pai `podeTerComponentes` e o tipo do filho `podeSerComponente`. Mover o pai move os filhos (S7). Proibir ciclos.
- Garantia: vencimento = `dataCompra + garantiaMeses`. Calendário de vencimentos. Job diário às 07:00 avisa os operadores com `inventario` sobre vencimentos dentro de `garantia_aviso_dias` (padrão 30) [Decisão] (S7, S8: `conf_days_bf`).
- Documentos: anexos do ativo e do modelo no mesmo storage (I08).
- Relatórios: por tipo, departamento, situação, garantias a vencer, top modelos (I09).

---

## 3. Configurações e jobs derivados

**Configurações** (nome sugerido = padrão):

| Grupo | Chaves |
|---|---|
| Visibilidade | `isolar_visibilidade_areas=true` |
| SLA | `jornada_base=AREA_ATENDIMENTO`, `sla_tolerancia_pct=20`, `fuso_horario=America/Sao_Paulo` |
| Primeira resposta | `primeira_resposta_ao_encaminhar=ESCOLHA` |
| Validação | `prazo_validacao_dias=3` [Decisão], `prazo_validacao_dias_uteis=true`, `avaliacao_automatica=OTIMO` |
| Reabertura | `permitir_reabertura=true`, `prazo_reabertura_dias=0` |
| Anexos | `anexos_habilitados`, `anexo_tamanho_max_mb=10`, `anexo_max_por_envio=5`, `anexo_tipos_permitidos` |
| Papéis de status | os 11 `status_*` de C01 |
| Fase 2 | `operador_trata_proprio_chamado=true`, `somente_abertura_abre_para_outros=false`, `status_monitorados_inatividade=[]`, `dias_inatividade=7`, `inatividade_dias_uteis=false`, `status_retorno_pos_inatividade`, `avaliacao_auto_inatividade=OTIMO`, `email_habilitado=false`, `garantia_aviso_dias=30` |

**Jobs pg-boss:**

| Job | Frequência | Fase |
|---|---|---|
| `chamados.retornoAgendados` | 1 min | MVP |
| `chamados.autoAprovacao` | 5 min | MVP |
| `chamados.autoEncerramentoInatividade` | 15 min | Fase 2 |
| `lembretes.disparar` | 1 min | Fase 2 |
| `email.enviar` | sob demanda, com retry | Fase 2 |
| `garantias.aviso` | diário às 07:00 | Fase 2 |

Todos são idempotentes: o update é condicionado ao estado atual do chamado. Correspondem aos crons do OCOMON `update_auto_approval.php`, `update_auto_close_due_inactivity.php`, `check_reminders.php` e `sendEmail.php` (S3, S9).

---

## 4. Pontos em comum com os recursos estilo Teams

- **Feed de Atividade (Teams):** usa E01 (central de notificações do OCOMON 6, S4) e C22 (histórico campo a campo).
- **@menções (Teams):** generalizam a notificação "citação como operador partícipe" do OCOMON (S4). A menção deve respeitar A03: não se pode mencionar quem não enxerga o chamado, e em comentário privado só operadores podem ser mencionados.
- **Chat ao vivo na linha do tempo:** fica na mesma tabela de comentários (C12, tipos público/privado). Nada do OCOMON conflita.
- **Busca Ctrl+K:** o índice de texto completo do MVP já serve para F02 (Fase 2).
- **Notificações na área de trabalho:** consomem os mesmos eventos de E01. "Avaliação pendente" (C13/C14) é um bom candidato a notificação persistente.

---

## 5. Lacunas de verificação

- O significado de `conf_reopen_deadline=0` como "sem limite" não foi verificado (C16).
- O comportamento exato da "detecção de reincidências" (B17) não foi verificado.
- As permissões finas do co-autor (C25) não foram verificadas.
- O cancelamento pelo solicitante (C17) não foi verificado.
- Não verifiquei se a parada de relógio vale também para o SLA de resposta (D01, item 6).
- Os endpoints exatos e os payloads da API do OCOMON não foram lidos: a documentação está em ocomon.com.br/site/integracao/, inacessível daqui. Li só as rotas em `api/ocomon_api/index.php` (S9): `GET /tickets/{id}`, `POST /tickets`, `POST /tickets/entry`.
- As notas das versões 6.1 a 6.8 não foram lidas. Lembretes e co-autoria foram confirmados no código e no esquema 6.8.1 (S8, S9), sem a versão em que entraram.
