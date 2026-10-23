# PRD — ApplyAssist

> Extensão de navegador que acelera o preenchimento de formulários de candidatura, sem enviar nada por você.
> Status: v1 (escopo fechado em 22/10/2026). Origem de cada requisito: ver `docs/TRACKER.md`.

## 1. Resumo e contexto
Quem busca emprego gasta a maior parte do tempo repetindo os mesmos campos (nome, contato, pretensão salarial, disponibilidade, perguntas abertas). O ApplyAssist reconhece esses campos, sugere as respostas guardadas pelo próprio usuário e, opcionalmente, gera rascunhos para perguntas abertas com IA. O usuário revisa e envia — sempre manualmente.

## 2. Problema e motivação
- Preencher formulários é repetitivo e consome o tempo que poderia ir para personalizar candidaturas.
- Automação total (robôs que enviam sozinhos) gera respostas erradas em nome do usuário, risco de bloqueio de conta e viola termos de uso de várias plataformas.
- Extensões comerciais exigem enviar dados pessoais a servidores de terceiros.

## 3. Público-alvo
- **Usuário final:** pessoa em busca de emprego, sem conhecimento técnico, em Windows/Chrome.
- **Desenvolvedor (portfólio):** projeto público no GitHub que demonstra engenharia com IA: especificação, segurança, testes e conformidade.

## 4. Objetivos e métricas de sucesso
| Objetivo | Métrica | Meta (v1) |
|---|---|---|
| Reconhecer campos comuns | % de campos comuns reconhecidos nas fixtures PT/EN/ES | ≥ 90% (ver T-11) |
| Nunca tocar em campos proibidos | campos proibidos preenchidos nos testes | 0 |
| Nunca enviar formulários | cliques/submits disparados pela extensão | 0 (teste e2e) |
| Privacidade | requisições de rede sem ação do usuário / com dados sensíveis | 0 / 0 |
| Qualidade | cobertura `src/core` / geral | ≥ 90% / ≥ 80% |
| Economia de tempo | tempo para preencher formulário de fixture com 10 campos | ≤ 15 s (manual medido) |

## 5. Escopo
**Dentro (v1):** ativação por clique; leitura de campos visíveis; classificação multilíngue (PT/EN/ES); sugestão ao clicar no campo e painel de status; aprendizado automático com revisão; registro de candidaturas e aviso de duplicata; perfil local com onboarding por texto/arquivo; lista de proibidos e toggles de categorias sensíveis; modo colar (painel lateral); IA opcional via OpenRouter; testes e CI.

**Fora de escopo (v1) — decisões explícitas:**
- Enviar formulário, clicar em botões da página, qualquer candidatura automática ou em massa.
- Busca ou coleta (scraping) de vagas; leitura automática da descrição da vaga.
- **Qualquer injeção ou leitura de página no linkedin.com** (apenas modo colar).
- Anexar currículo (upload de arquivo); marcar checkboxes de consentimento/termos.
- Radio buttons e checkboxes em geral (planejado para versão futura).
- Sincronização em nuvem, contas de usuário, telemetria.
- Firefox e navegadores móveis.
- Embeddings/modelos de similaridade semântica (avaliar só se a taxa de acerto ficar baixa).

## 6. Requisitos funcionais
| ID | Requisito | Prioridade |
|---|---|---|
| R-01 | Desligada por padrão em todo site; só atua após clique no ícone da extensão (`activeTab`) | Must |
| R-02 | Permissões mínimas; sem acesso a "todos os sites" | Must |
| R-03 | Ler campos visíveis e classificar: pronto / incerto / pergunta aberta / proibido | Must |
| R-04 | Reconhecer rótulos diferentes para o mesmo campo (PT/EN/ES): atributos HTML, dicionário de sinônimos, correspondência aproximada, mapeamentos aprendidos | Must |
| R-05 | Mostrar sugestão ao focar o campo; aceitar um campo ou todos os prontos; desfazer; nunca enviar o formulário | Must |
| R-06 | Nunca ler/preencher/aprender: senha, cartão, CVV, dados bancários, 2FA/OTP, CAPTCHA, upload, checkbox de consentimento | Must |
| R-07 | Categorias sensíveis (CPF, RG, nascimento, endereço, diversidade) com interruptor por categoria; o usuário decidiu permitir o preenchimento automático dessas categorias | Must |
| R-08 | Aprendizado automático sem perguntar; itens "novos (não revisados)"; tela de revisão com conflitos, edição, exclusão | Must |
| R-09 | Registro local de candidaturas e aviso de duplicata (URL normalizada + empresa/título) | Should |
| R-10 | Dados somente locais; exportar/importar JSON; apagar tudo; nunca `chrome.storage.sync` | Must |
| R-11 | Onboarding: colar texto, enviar .txt/.md/.json ou preencher formulário simples; o texto vira "contexto geral" | Must |
| R-12 | Funciona sem IA desde o primeiro dia | Must |
| R-13 | IA opcional: conectar OpenRouter (login PKCE ou chave manual), escolher modelo, geração em streaming direto no campo, desfazer | Should |
| R-14 | Nada sensível nem dados de contato vai para a IA; `data_collection: deny`; limite de contexto | Must (se R-13) |
| R-15 | Descrição da vaga só por seleção ou colagem do usuário; nunca leitura automática | Must |
| R-16 | Modo colar no painel lateral: funciona em qualquer site, sem acessar a página | Should |
| R-17 | linkedin.com bloqueado para injeção; clicar no ícone abre o modo colar | Must |
| R-18 | Cadastro de sites com status (verificado / não verificado / bloqueado) e aviso em site não verificado | Must |
| R-19 | Defesa contra prompt injection (texto da página = dado não confiável; IA sem ferramentas) | Must |
| R-20 | Defesa contra campos-isca ocultos (honeypot) | Must |
| R-21 | Preenchimento compatível com React/Vue (setter nativo + eventos) | Must |
| R-22 | Portões de qualidade (typecheck, lint, testes, build, checagem de manifesto, segredos) e CI | Must |
| R-23 | Sem telemetria, sem código remoto, sem segredos ou dados reais no repositório | Must |
| R-24 | Interface e documentação em pt-BR; código em inglês | Must |
| R-25 | Provedor Ollama opcional, com ID de extensão estável | Could |
| R-26 | Acessibilidade: teclado, ARIA, contraste | Should |

## 7. Requisitos não funcionais
- **Desempenho:** varredura de 100 campos em < 100 ms; sem travar a página; bundle do content script < 150 KB (minificado).
- **Privacidade:** local-first; transparência sobre qualquer dado que sai do computador (tela de conexão IA).
- **Confiabilidade:** falha de IA/rede nunca impede o preenchimento básico.
- **Manutenibilidade:** camadas (FDD §1), ADRs, testes, tarefas pequenas.
- **Compatibilidade:** Chrome atual (Manifest V3) em Windows; Chromium (Edge/Brave) tende a funcionar, mas não é garantido.

## 8. Decisões e trade-offs principais
Ver `docs/ADR.md`. Resumo: ativação por clique em vez de scripts permanentes (menos permissão, menos risco); sem robô de envio (conformidade e segurança); IA opcional e na nuvem gratuita com privacidade reforçada, pois o computador-alvo é lento para modelos locais.

## 9. Dependências
Chrome MV3; OpenRouter (opcional); Node.js LTS, npm, Vite, Preact, Vitest, Playwright (dev). Termos de uso de cada site (ver `docs/COMPLIANCE.md`).

## 10. Riscos e mitigação
| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Site restringir conta do usuário por uso de extensão | Média | Alto | LinkedIn bloqueado; ativação manual; status por site; aviso em sites não verificados |
| Formulários em iframes de outro domínio não funcionarem com `activeTab` | Média | Médio | Spike T-24; documentar limitação |
| Campo-isca capturar dados | Baixa | Alto | R-20; só campos visíveis e focados |
| IA inventar dados | Média | Médio | Regras do prompt, marcador `[PREENCHER: …]`, revisão obrigatória, nada enviado automaticamente |
| Mudança de limites/privacidade dos modelos gratuitos | Alta | Médio | Modelo configurável, `data_collection: deny`, fallback sem IA |
| Dados locais expostos por malware no PC | Baixa | Alto | Armazenamento local; documentar limites; criptografia opcional futura |
| Login OpenRouter não funcionar na extensão | Média | Baixo | Spike T-18; fallback com chave manual |

## 11. Critérios de aceitação (v1)
Todas as tarefas T-00 … T-26 do `docs/PLAN.md` concluídas; `npm run gates` e `npm run e2e` verdes; revisão de segurança (prompt 02) sem FAIL; README com aviso de conformidade; nenhum dado real no repositório.

## 12. Estratégia de testes e validação
Pirâmide: unitários em `src/core`; integração com happy-dom para scanner/filler/overlay; e2e com Playwright em fixtures locais (formulário simples, React controlado, campo-isca, várias etapas). Teste manual com sites reais apenas nos verificados e **sem enviar** candidaturas de teste.
