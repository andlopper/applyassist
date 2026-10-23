# Preparação do ambiente (Windows)

## 1. Ferramentas
1. **Git**: https://git-scm.com/download/win (aceite as opções padrão). Teste: `git --version`.
2. **Node.js LTS**: https://nodejs.org (instale a versão **LTS** vigente). Teste: `node -v` e `npm -v`.
3. **VS Code**: https://code.visualstudio.com. Instale as extensões **GitHub Copilot** e **GitHub Copilot Chat** e entre com sua conta GitHub (plano Free).
4. **Google Chrome** atual.

## 2. Repositório
1. No GitHub, crie um repositório **vazio** (público, se for para o portfólio), por exemplo `applyassist`.
2. Clone: `git clone https://github.com/<seu-usuario>/applyassist.git` e abra a pasta no VS Code.
3. Copie para dentro dela **todo o conteúdo deste pacote** (inclusive as pastas ocultas `.github` e os arquivos `.gitignore` e `.npmrc`).
4. **Antes do primeiro commit**, confirme que `.gitignore` existe. Nunca coloque dados pessoais reais na pasta do projeto.
5. No GitHub: *Settings → Code security* (o nome da seção pode variar) → ative **secret scanning** e **push protection**.
6. Primeiro commit: `git add .` → `git commit -m "docs: add project specification and Copilot instructions"` → `git push`.

## 3. Copilot no VS Code
- Abra o chat do Copilot e escolha o modo **Agent**.
- O arquivo `.github/copilot-instructions.md` é carregado automaticamente. Os arquivos `.github/instructions/*.instructions.md` entram quando os caminhos batem (`applyTo`).
- Para rodar um prompt do projeto, digite `/` no chat e escolha, por exemplo, `00-bootstrap`. Se não aparecer, anexe o arquivo manualmente (botão de contexto / `#file`) e envie.
- Ordem: `00-bootstrap` uma vez → depois `01-implement-task` informando `T-02`, `T-03`… na ordem do `docs/PLAN.md`.

## 4. Carregar a extensão no Chrome
1. `npm ci` e `npm run build` (o bootstrap faz isso).
2. Abra `chrome://extensions`, ligue **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta `dist/`.
3. Após cada build, clique em **recarregar** no cartão da extensão.

## 5. Economia de créditos do Copilot Free
O plano Free tem limites mensais de completions e de uso de chat/agente (os números variam por fonte e mudaram em junho de 2026; confira no seu painel do Copilot). Por isso: uma tarefa por requisição, contexto curto, testes rodando localmente (não consomem créditos) e completions inline para ajustes pequenos.

## 6. Opcional, só na T-27: Ollama
No seu PC (CPU, sem GPU dedicada) comece por modelos pequenos. O Ollama bloqueia extensões por padrão; veja FDD §11.5.
