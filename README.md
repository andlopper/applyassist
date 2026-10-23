# ApplyAssist — pacote inicial (especificação + instruções para o Copilot)

Extensão de Chrome que ajuda a preencher formulários de candidatura. **Você revisa e envia; a extensão nunca envia nada.**
Este pacote contém tudo o que o GitHub Copilot precisa para construir o projeto por etapas, com segurança e testes.

## O que tem aqui
| Caminho | Para quê |
|---|---|
| `.github/copilot-instructions.md` | Regras sempre ativas (segurança, escopo, Definition of Done) |
| `.github/instructions/*.instructions.md` | Regras por tipo de arquivo (`applyTo`) |
| `.github/prompts/00-bootstrap.prompt.md` | **Prompt mestre**: cria o esqueleto do repositório (T-00, T-01) |
| `.github/prompts/01-implement-task.prompt.md` | Prompt padrão para cada tarefa seguinte (informe `T-02`, `T-03`…) |
| `.github/prompts/02-security-review.prompt.md` | Revisão de segurança somente leitura |
| `.github/prompts/03-fix-gates.prompt.md` | Corrige falhas dos portões de qualidade |
| `docs/PRD.md` · `FDD.md` · `ADR.md` | O quê, como e por quê (decisões) |
| `docs/PLAN.md` | 28 tarefas pequenas, com dependências e critérios de aceite |
| `docs/TRACKER.md` | Rastreabilidade: cada requisito aponta sua origem |
| `docs/COMPLIANCE.md` | Termos de cada site e política (LinkedIn bloqueado) |
| `docs/SETUP-WINDOWS.md` | Passo a passo do ambiente |
| `docs/OPEN_QUESTIONS.md` | O que ainda não sabemos (a IA anota aqui em vez de inventar) |

## Como usar (resumo)
1. Siga `docs/SETUP-WINDOWS.md` (Git, Node LTS, VS Code, Copilot, repositório).
2. Copie este pacote para a raiz do repositório e faça o primeiro commit.
3. No Copilot Chat (modo **Agent**), rode `/00-bootstrap`. Confira o relatório final, rode você mesmo `npm run gates` e faça o commit.
4. Repita com `/01-implement-task` para `T-02`, `T-03`… na ordem do `docs/PLAN.md`.
5. Antes de publicar, rode `/02-security-review`.

## Princípios
Local-first · sem envio automático · sem scraping · sem telemetria · dados sensíveis só com seu consentimento e nunca para a IA · tudo rastreável a uma decisão.
