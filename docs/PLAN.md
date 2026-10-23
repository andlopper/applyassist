# PLAN — tarefas do ApplyAssist

Regras: uma tarefa por vez, na ordem das dependências. Marque `[x]` ao concluir. Cada tarefa termina com `npm run gates` verde e relatório no formato do prompt `01-implement-task`.
Legenda: **Ler** = seções que a IA deve ler (e só elas). **Aceite** = critérios verificáveis.

## Fase 0 — Fundação
### [x] T-00 — Scaffold do repositório
Depende de: — | Ler: FDD §1, §2, §9, §15 · ADR-001, 002, 010, 011 | Reqs: R-22, R-23, R-24
Entregáveis: `package.json` (scripts), `tsconfig.json` estrito, `scripts/build.mjs` (3 builds), `manifest.config.ts`, ESLint + Prettier, Vitest (happy-dom), esqueleto `src/` (entradas mínimas e sem efeitos), `.gitattributes`, `.editorconfig`, CI no GitHub Actions.
Aceite: `npm ci && npm run gates` verde em clone limpo; `dist/` contém manifest, background.js (ES), content.js (IIFE), options.html, sidepanel.html; carregar `dist/` no Chrome sem erros; clicar no ícone não faz nada.

### [x] T-01 — Verificador de manifesto
Depende de: T-00 | Ler: FDD §2, §13 (SEC-01, SEC-11) · ADR-002
Aceite: `scripts/check-manifest.mjs` falha se houver `content_scripts`, `host_permissions`, `<all_urls>`, `web_accessible_resources`, `externally_connectable`, CSP enfraquecida ou permissão fora da lista; ≥ 7 testes cobrindo cada falha e o caso válido.

### [x] T-02 — Normalização de texto
Depende de: T-00 | Ler: FDD §4.1 | Reqs: R-04
Aceite: `normalizeLabel()` conforme §4.1; testes table-driven PT/EN/ES (acentos, `*`, "(obrigatório)", espaços duplicados, string vazia, entrada muito longa).

### [x] T-03 — Dicionário de sinônimos e correspondência exata
Depende de: T-02 | Ler: FDD §3, §4.2 | Reqs: R-04
Aceite: ≥ 25 tipos de campo em PT/EN/ES; teste explícito de "pretensão salarial", "pretensão", "desired salary", "salário pretendido" → `salaryExpectation`; rótulo desconhecido retorna `unknown`.

### [x] T-04 — Correspondência aproximada
Depende de: T-03 | Ler: FDD §4.3 (passo 5) · ADR-003 | Reqs: R-04
Aceite: Dice por tokens + Levenshtein para token único; "salario preterido" → `salaryExpectation` com `score ≥ 0,70`; limiares 0,90/0,70; sem falso positivo em 20 rótulos não relacionados.

### [x] T-05 — Política de campos proibidos e categorias sensíveis
Depende de: T-02 | Ler: FDD §3, §4.4 | Reqs: R-06, R-07
Aceite: tabela de testes PT/EN/ES para todas as regras do §4.4; categoria sensível desligada → `blocked_by_setting`; consentimento/termos nunca preenchidos.

### [x] T-06 — Cadastro de sites (site policy)
Depende de: T-00 | Ler: FDD §9 · ADR-008 · COMPLIANCE | Reqs: R-17, R-18
Aceite: `getSitePolicy(url)` retorna `blocked | unverified | verified` por domínio (inclui subdomínios); `linkedin.com` e `*.linkedin.com` = `blocked`; Gupy e Vagas.com = `verified`; InHire, Sólides e demais = `unverified` (com aviso); `siteOverrides` do usuário respeitado, mas nunca libera LinkedIn.

### [x] T-07 — Armazenamento atrás de portas
Depende de: T-00 | Ler: FDD §3 · ADR-004 | Reqs: R-10
Aceite: porta `Repository<T>`, adaptador `chrome.storage.local`, `FakeStorage`, validação na leitura (dado inválido → padrão), versão de esquema + 1 migração de exemplo; nenhum uso de `storage.sync` (teste/lint).

### [ ] T-08 — Perfil, contexto e redação de dados sensíveis
Depende de: T-07 | Ler: FDD §3, §11.3 | Reqs: R-11, R-14
Aceite: validação/importação de perfil JSON; `redactSensitive()` remove CPF, RG, telefone, e-mail, URLs de perfil e sequências longas de dígitos (testes com variações de formatação); truncamento por sentença.

## Fase 1 — Esqueleto da extensão
### [ ] T-09 — Background: clique, política e injeção
Depende de: T-01, T-06, T-07 | Ler: FDD §9, §10 · ADR-002, 008 | Reqs: R-01, R-17
Aceite: clique injeta `content.js` via `activeTab` em site `verified/unverified`; em `blocked` abre o painel lateral; páginas não injetáveis → badge "!"; roteador de mensagens valida remetente e esquema (testes com `FakeChromeRuntime`); segunda injeção alterna o overlay.

### [ ] T-10 — Scanner e visibilidade
Depende de: T-02 | Ler: FDD §5 | Reqs: R-03, R-20
Aceite: `scanFields` com candidatos a rótulo na ordem do §5; fixtures com campo-isca (`left:-9999px`, opacidade 0, 1 px, coberto) nunca retornam como visíveis; 100 campos < 100 ms (teste de desempenho com folga).

### [ ] T-11 — Pipeline de classificação
Depende de: T-03, T-04, T-05, T-10 | Ler: FDD §4.3 · ADR-003 | Reqs: R-03, R-04
Aceite: ordem exata do §4.3; fixtures PT/EN/ES com ≥ 90% de campos comuns reconhecidos (métrica impressa no teste); aprendido não revisado → `uncertain`; perguntas abertas detectadas.

### [ ] T-12 — Preenchimento (filler)
Depende de: T-10 | Ler: FDD §6 | Reqs: R-05, R-21
Aceite: setter nativo + `input`/`change`; `select`, `date`, `maxlength`; desfazer; nunca sobrescreve campo preenchido sem aceite; nenhum `click`/`submit` disparado (teste espiando eventos); fixture React controlada mantém o valor após re-render (teste de integração; e2e em T-23).

### [ ] T-13 — Overlay (Shadow DOM)
Depende de: T-09, T-11, T-12 | Ler: FDD §12, §10 (GET_FILL_VALUES) | Reqs: R-05, R-26
Aceite: painel com contadores e lista; chip ao focar campo; "Aplicar", "Preencher prontos", "Desfazer", ESC; textos de `pt-br.ts`; sem `innerHTML` com dados externos (teste com rótulo malicioso `<img onerror>`); acessível por teclado e com `aria-live`.

### [ ] T-14 — Options: onboarding e perfil
Depende de: T-07, T-08 | Ler: FDD §12 (Options), §3 | Reqs: R-11, R-07, R-12
Aceite: primeiro uso oferece colar texto / enviar .txt .md .json / formulário simples; revisão antes de salvar; interruptores das 4 categorias sensíveis (desligados por padrão); a extensão funciona sem configurar IA.

## Fase 2 — Aprendizado e registros
### [ ] T-15 — Motor de aprendizado
Depende de: T-11, T-13 | Ler: FDD §7 · ADR-005 | Reqs: R-08
Aceite: regras 1–3 do §7 com testes; nunca aprende campo proibido; conflito não sobrescreve; `submit` capturado sem impedir o envio.

### [ ] T-16 — Tela de revisão
Depende de: T-14, T-15 | Ler: FDD §7, §12 (Options) | Reqs: R-08, R-10
Aceite: tabela com status, edição, exclusão, "não aprender este rótulo", resolução de conflito (manter/substituir/só esta vaga), ações em lote, exportar/importar JSON, apagar tudo com confirmação.

### [ ] T-17 — Candidaturas e duplicatas
Depende de: T-13 | Ler: FDD §8 | Reqs: R-09
Aceite: `normalizeUrl` e `isLikelyDuplicate` com testes; aviso no overlay; marcar "me candidatei"; lista na aba Candidaturas.

## Fase 3 — IA opcional
### [ ] T-18 — SPIKE: login PKCE do OpenRouter na extensão
Depende de: T-09 | Ler: FDD §11.2 | Reqs: R-13
Aceite: documento `docs/SPIKES.md` com o que funcionou/falhou em `launchWebAuthFlow`, URL de retorno, permissões necessárias e fallback de chave manual; nenhuma funcionalidade de produção além do necessário para provar o fluxo.

### [ ] T-19 — Provedor OpenRouter
Depende de: T-18, T-07 | Ler: FDD §11.1, §11.2 · ADR-006 | Reqs: R-13, R-14
Aceite: `listModels`, `generate` em streaming (SSE) com `AbortSignal`, `provider.data_collection = "deny"` (campo confirmado na doc), mapeamento de 401/402/429/5xx para mensagens pt-BR; testes com `fetch` simulado e SSE fragmentado; chave só no background.

### [ ] T-20 — Construtor de prompt
Depende de: T-08 | Ler: FDD §11.3, §11.4 | Reqs: R-14, R-19
Aceite: função pura; testes de prompt (papel, regras, few-shot, formato, delimitadores não confiáveis, sem `TODO`, `maxLength`, idioma); injeção de instruções no `job_context` não altera as regras (teste estrutural); limites de contexto.

### [ ] T-21 — Botão "Gerar" no overlay
Depende de: T-13, T-19, T-20 | Ler: FDD §10 (AI_GENERATE), §12 | Reqs: R-13, R-15
Aceite: streaming direto no campo, desfazer, cancelar; texto da vaga só da seleção do usuário; sem dados sensíveis na requisição (teste inspecionando o payload); mensagem amigável para limite diário.

### [ ] T-22 — Painel lateral: modo colar e conexão
Depende de: T-19, T-20 | Ler: FDD §12 (Side panel), §11 | Reqs: R-16, R-17
Aceite: gerar a partir de texto colado, copiar saída; aba Conexão IA (login/chave, modelo, aviso do que é enviado); sem acesso à página; comando `Alt+Shift+P` abre o painel.

## Fase 4 — Endurecimento e portfólio
### [ ] T-23 — E2E com Playwright
Depende de: T-13, T-21 | Ler: FDD §15 | Reqs: R-21, R-05
Aceite: fixtures (simples, React controlado, campo-isca, várias etapas) carregando a extensão em Chromium; verifica preenchimento, zero cliques/submits, campos proibidos intocados, campo-isca vazio; `npm run e2e` documentado.

### [ ] T-24 — SPIKE: iframes e `activeTab`
Depende de: T-09 | Ler: FDD §9
Aceite: `docs/SPIKES.md` registra se `allFrames` com `activeTab` alcança iframe de outro domínio nas fixtures; decisão (suportar/documentar limitação) via ADR se mudar o escopo.

### [ ] T-25 — Revisão de segurança e dependências
Depende de: T-23 | Ler: FDD §13
Aceite: prompt `02-security-review` sem FAIL; `npm audit --omit=dev` limpo ou justificado; permissões revisadas; nenhum `web_accessible_resources`.

### [ ] T-26 — README e portfólio
Depende de: T-25 | Ler: PRD, COMPLIANCE
Aceite: README em pt-BR com demonstração (GIF com dados falsos), diagrama de arquitetura, instruções de instalação, seção de conformidade (sites, LinkedIn, limites), LICENSE, ícones 16/32/48/128, política de privacidade curta.

### [ ] T-27 — (Opcional) Provedor Ollama
Depende de: T-19 | Ler: FDD §11.5 | Reqs: R-25
Aceite: adaptador com streaming; ID de extensão estável documentado; instruções de `OLLAMA_ORIGINS`; erro claro quando bloqueado (403).
