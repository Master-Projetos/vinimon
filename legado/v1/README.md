# OCOMON – Gestão de Demandas e Chamados

Sistema web de help desk inspirado no OCOMON. Sem dependências externas: Node.js ≥ 22.13 + SQLite embutido.

## Executar
```
node server.js        # ou: npm start / iniciar.bat
```
Acesse http://localhost:3000 (porta via variável `PORT`; banco em `data/ocomon.db`, via `OCOMON_DB`).
O banco e os dados iniciais são criados automaticamente na primeira execução.

## Acessos iniciais (TROQUE AS SENHAS)
| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin | admin123 |
| Operador | operador | operador123 |
| Usuário | usuario | usuario123 |

## Funcionalidades
- **Login** com sessão por cookie HttpOnly, senhas com scrypt, bloqueio temporário após 5 falhas.
- **Perfis**: Administrador, Operador (vê chamados da sua área, os que assumiu e os próprios), Usuário (só os próprios).
- **Chamados**: abertura (com anexos, local, equipamento, prioridade, sugestão de FAQ), listagem com filtros/busca/paginação,
  detalhe com histórico, comentários públicos e privados, assumir, alterar status/prioridade, encaminhar para área/operador,
  agendar, encerrar com solução, reabrir, anexos.
- **SLA** por tipo de problema (resposta e solução) com alertas de vencimento.
- **Painel** com indicadores e gráficos; **Relatórios** por status, área, problema, operador, solicitante, SLA, com exportação CSV e impressão.
- **Cadastros (admin)**: usuários, áreas, prioridades, status, tipos de problema, locais; **Equipamentos** e **Base de conhecimento (FAQ)** (operadores também).
- **Configurações**: nome do sistema, organização, duração da sessão, anexos. **Perfil**: dados e troca de senha.

## Não incluído
Notificações por e-mail, integração LDAP/AD, inventário automático, importação do banco MySQL do OCOMON original e HTTPS
(use um proxy reverso como nginx/Caddy em produção; o cookie de sessão deve então ganhar o atributo `Secure`).

## Estrutura
`server.js` (API + estáticos), `db.js` (esquema e seed), `public/` (SPA: `index.html`, `app.js`, `style.css`).
