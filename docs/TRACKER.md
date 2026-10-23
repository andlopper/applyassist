# TRACKER — rastreabilidade

Toda linha aponta a origem do requisito. Se não houver origem, o item foi inventado e deve ser removido ou justificado.
Origens: **C** = decisão do usuário na conversa de planejamento; **P** = pesquisa/fonte externa; **PM** = decisão de produto do PM (com ADR).

| Req | Resumo | Origem | ADR | Tarefas |
|---|---|---|---|---|
| R-01 | Desligada por padrão; ativa ao clicar (estilo AdBlock) | C: "botão que ativa, desativado a cada site" | 002 | T-09 |
| R-02 | Permissões mínimas | C: preocupação com segurança + PM | 002 | T-01, T-25 |
| R-03 | Ler campos e classificar em estados | C: "ler os campos e analisar o que já tem pronto" | 003 | T-10, T-11 |
| R-04 | Rótulos diferentes (pretensão salarial / desired salary…) | C: exemplo explícito do usuário | 003 | T-02–T-04, T-11 |
| R-05 | Sugestão ao clicar + painel; aceitar um/todos; desfazer; não enviar | C: combinação sugerida e aprovada | — | T-12, T-13 |
| R-06 | Lista de campos proibidos | C: "lista de proibidos também" | 009 | T-05 |
| R-07 | Sensíveis com interruptor; usuário permite preencher | C: "pode preencher automaticamente, não vejo problema" | 009 | T-05, T-14 |
| R-08 | Aprendizado automático + revisão | C: "salvamento automático… tela para revisar" | 005 | T-15, T-16 |
| R-09 | "Já me candidatei?" | C: "identificar se já me candidatei" | — | T-17 |
| R-10 | Dados locais, exportar/importar/apagar; sem sync | C: GitHub público + confidencialidade; P: extensão não criptografada por padrão | 004 | T-07, T-16 |
| R-11 | Onboarding por texto/arquivo | C: "campo de texto ou enviar arquivo no primeiro uso" | — | T-08, T-14 |
| R-12 | Funciona sem IA | PM: "plug and play" pedido pelo usuário | 006 | T-14 |
| R-13 | IA opcional via OpenRouter (login/chave) | C: "vamos tentar com o OpenRouter"; P: login PKCE documentado pelo OpenRouter | 006 | T-18–T-22 |
| R-14 | Nada sensível à IA; `data_collection: deny` | P: análise de terceiros sobre modelos gratuitos que podem treinar com prompts; PM | 006 | T-08, T-19, T-20 |
| R-15 | Descrição da vaga só por seleção/colagem | PM: conformidade e privacidade | 007 | T-21 |
| R-16 | Modo colar no painel lateral | C: modo colar para LinkedIn; PM | 008 | T-22 |
| R-17 | LinkedIn bloqueado | P: termos do LinkedIn e reportagens sobre detecção de extensões (ver COMPLIANCE) | 008 | T-06, T-09, T-22 |
| R-18 | Cadastro de sites com status | C: "verifique os termos"; P: termos lidos | 008 | T-06 |
| R-19 | Prompt injection | P/PM: risco de agentes lendo páginas | 006, 009 | T-20 |
| R-20 | Campos-isca | PM: risco de preenchimento automático | 009 | T-10 |
| R-21 | Compatível com React/Vue | PM | — | T-12, T-23 |
| R-22 | Portões e CI | P: padrões dos repositórios mba-ia (DoD, gates, testes) | 010 | T-00 |
| R-23 | Sem telemetria/segredos/código remoto | C: GitHub público; PM | 009, 011 | T-00, T-25 |
| R-24 | UI/doc pt-BR; código em inglês | P: convenção do repositório mba-ia-dev-workflow | — | todas |
| R-25 | Ollama opcional | C: pergunta sobre modelos locais; hardware limita | 006 | T-27 |
| R-26 | Acessibilidade | PM | — | T-13 |
