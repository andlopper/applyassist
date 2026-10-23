# ADRs — ApplyAssist

Formato: Status · Contexto · Decisão · Alternativas · Consequências. Para mudar uma decisão, crie um novo ADR que a substitua.

## ADR-001 — Stack: Manifest V3, TypeScript, Vite, Preact
**Status:** Aceita.
**Contexto:** extensão Chrome mantida por uma pessoa, com IA de baixo custo; precisa de poucos pacotes e build previsível.
**Decisão:** MV3; TypeScript estrito; Vite com **3 builds** orquestrados por `scripts/build.mjs` (background ES module; content script IIFE clássico; páginas options/sidepanel); Preact para UI; Vitest + happy-dom; Playwright para e2e.
**Alternativas:** plugin CRXJS (mais "mágica" e dependências); JS puro (mais código de UI repetido); React (maior).
**Consequências:** + poucas dependências e controle do build; − script de build próprio para manter.

## ADR-002 — Ativação por clique (`activeTab`), sem content scripts estáticos
**Status:** Aceita.
**Contexto:** a extensão deve estar desligada por padrão em cada site e pedir o mínimo de permissões.
**Decisão:** permissões: `activeTab`, `scripting`, `storage`, `sidePanel`, `identity`; `optional_host_permissions` para `https://openrouter.ai/*` e `http://localhost:11434/*`, solicitadas em tempo de uso. Sem `content_scripts`, sem `host_permissions`, sem `web_accessible_resources`. Injeção via `chrome.scripting.executeScript` após clique.
**Alternativas:** content script permanente em `<all_urls>` (mais permissão e superfície de ataque).
**Consequências:** + privacidade e revisão simples; − acesso termina ao navegar (formulários multi-página exigem novo clique); iframes de outro domínio precisam de spike (T-24).

## ADR-003 — Classificação de campos em camadas, sem embeddings na v1
**Status:** Aceita.
**Contexto:** rótulos variam ("pretensão salarial", "desired salary"...).
**Decisão:** ordem: proibidos → mapeamentos aprendidos → atributo `autocomplete` → sinônimos exatos (PT/EN/ES, após normalização) → correspondência aproximada. Limiares: ≥ 0,90 pronto; 0,70–0,89 incerto; < 0,70 desconhecido.
**Alternativas:** embeddings multilíngues no navegador (peso de download/RAM e complexidade do MV3); LLM local (lento no hardware-alvo).
**Consequências:** + leve e previsível; − cobertura depende do dicionário e do aprendizado. Reavaliar com métrica da T-11.

## ADR-004 — Armazenamento local atrás de portas
**Status:** Aceita.
**Decisão:** `chrome.storage.local` com versionamento de esquema (`schemaVersion`) e repositórios atrás de interfaces (ports), com adaptador em memória para testes. Nunca `chrome.storage.sync`. Exportar/importar JSON e "apagar tudo".
**Alternativas:** IndexedDB (mais complexo na v1; pode entrar por trás das mesmas portas).
**Consequências:** + simples e testável; − limite de ~10 MB (suficiente para a v1).

## ADR-005 — Aprendizado automático com marcação "não revisado"
**Status:** Aceita.
**Decisão:** ao sair do campo ou enviar, salvar sem perguntar: (a) se o valor coincide com um valor do perfil → mapeia rótulo→campo; (b) senão → memória de resposta (por site ou por vaga). Itens entram como *não revisados* (sugestão amarela). Valores diferentes dos do perfil geram *conflito* (nunca sobrescrevem). Nunca aprender campos proibidos.
**Consequências:** + esforço zero para o usuário; − exige tela de revisão (T-16).

## ADR-006 — IA opcional; OpenRouter primeiro; privacidade reforçada
**Status:** Aceita.
**Contexto:** hardware-alvo (Ryzen 5 3400G, 13 GB RAM, sem GPU dedicada) torna modelos locais lentos; usuário escolheu OpenRouter.
**Decisão:** porta `AiProvider`; adaptador OpenRouter com login PKCE (fallback: chave manual), streaming, lista de modelos via API, `provider.data_collection = "deny"` (confirmar campo na documentação oficial), nunca enviar categorias sensíveis nem contato, redigir PII do contexto. Ollama como adaptador opcional (T-27) exige ID de extensão estável. A extensão funciona sem IA.
**Alternativas:** Gemini com chave própria (política de dados dos planos gratuitos); login Google com assinatura Gemini do usuário (não suportado para terceiros); servidor próprio (custo e privacidade).
**Consequências:** + rápido e simples; − limites do plano gratuito mudam; privacidade depende do provedor roteado.

## ADR-007 — Descrição da vaga só por seleção ou colagem do usuário
**Status:** Aceita.
**Decisão:** nenhum scraping automático de conteúdo da vaga. O contexto da vaga vem de `document.title` (apenas título/empresa editáveis) e do texto que o usuário seleciona ou cola.
**Consequências:** + conformidade e privacidade; − um passo manual a mais.

## ADR-008 — LinkedIn bloqueado; modo colar no painel lateral; cadastro de sites
**Status:** Aceita.
**Contexto:** os termos do LinkedIn proíbem extensões que raspem, modifiquem a aparência ou automatizem; o site declara detectar extensões (ver `docs/COMPLIANCE.md`).
**Decisão:** `src/core/policy/site-policy.ts` com status por domínio. `linkedin.com` = bloqueado: sem injeção e sem seletores específicos; clicar no ícone abre o painel lateral (modo colar, sem acesso à página). Sites não verificados exibem aviso.
**Consequências:** + reduz risco de conta; − sem preenchimento no LinkedIn.

## ADR-009 — Postura de segurança
**Status:** Aceita.
**Decisão:** ver FDD §13 (SEC-01…SEC-13): Shadow DOM, sem `innerHTML` com dados externos, validação de remetente e esquema de mensagens, só campos visíveis, mínimo de dados ao content script, segredos só no background, sem código remoto/`eval`/telemetria.

## ADR-010 — Testes e portões de qualidade
**Status:** Aceita.
**Decisão:** `npm run gates` = typecheck → lint → test → build → check:manifest → check:secrets. `npm run e2e` separado (Playwright). Fixtures com dados falsos. Cobertura: `src/core` ≥ 90%, geral ≥ 80%. CI executa os portões. Nenhum portão pode ser substituído ou enfraquecido.

## ADR-011 — Política de dependências
**Status:** Aceita.
**Decisão:** poucas dependências; versões exatas (`save-exact`), publicadas há ≥ 14 dias; lockfile versionado; `npm ci` no CI; `npm audit` a cada tarefa; nenhuma dependência sem tarefa/ADR que a permita.
