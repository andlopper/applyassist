# Conformidade por site

> Leitura prática dos termos em **22/10/2026**; não é parecer jurídico. Termos mudam: reavalie antes de liberar qualquer site. A extensão é acionada pelo usuário, uma página por vez, e nunca envia o formulário.

| Site | Status no código | O que foi verificado |
|---|---|---|
| **LinkedIn** | `blocked` | A política do LinkedIn proíbe software e extensões de terceiros que raspem dados, modifiquem a aparência ou automatizem atividade. Reportagens de abril de 2026 (BleepingComputer e outras) descrevem um script que sonda extensões instaladas; o LinkedIn diz usar isso contra ferramentas que violam seus termos. Sem injeção, sem seletores. Clicar no ícone abre o **modo colar** (painel lateral, sem acesso à página). |
| **Gupy** (`gupy.io` e subdomínios) | `verified` | Texto completo lido (versão de 01/07/2026): não menciona extensões nem preenchimento; proíbe copiar/agregar partes da plataforma e sobrecarregar/interferir nos serviços; o candidato responde pelo que envia. |
| **Vagas.com** (`vagas.com.br` e subdomínios) | `verified` (com cautela) | Texto completo lido (atualizado em 01/07/2026): proíbe software que interfira nas operações e a reprodução de conteúdo sem autorização; não menciona preenchimento; candidato responde pelo conteúdo, inclusive gerado por IA. |
| **Indeed** | `unverified` | Texto oficial não lido; fontes secundárias citam proibição de meios automatizados de acesso. |
| **InHire** | `unverified` | Termos de candidato não localizados (busca em 22/10/2026). Site que o usuário utiliza. |
| **Sólides** | `unverified` | Termos de candidato não localizados (busca em 22/10/2026). Site que o usuário utiliza. |
| **Catho, InfoJobs** | `unverified` | Termos de candidato não localizados. |
| **Sites de empresas (Greenhouse, Lever, etc.)** | `unverified` | Não verificados; cada empresa tem seus termos. |

## Regras para liberar um site (`verified`)
1. Ler os termos atuais e registrar aqui a data e o trecho relevante (parafraseado).
2. Confirmar que o uso (acionado por clique, uma página, sem coleta de conteúdo, sem envio) não é proibido.
3. Testar manualmente **sem enviar** candidatura.
4. Atualizar `site-policy.ts` e este documento no mesmo commit.

## Princípios que se aplicam a todos
Mínima coleta (só rótulos e campos visíveis); nenhum scraping de vagas; nenhuma automação de envio; dados do usuário só locais; IA somente com ação explícita e sem dados sensíveis.

Um override `allow` do usuário remove o aviso de site não verificado, mas não altera esta avaliação de conformidade nem significa que os termos foram revisados. `linkedin.com` e qualquer subdomínio permanecem bloqueados, mesmo com override.

## Observação sobre fixtures
Nunca versionar HTML copiado de sites reais. As fixtures do repositório são sintéticas (escritas à mão, com dados falsos). Formulários reais servem apenas para teste manual local, sem enviar candidatura.
