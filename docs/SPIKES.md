# SPIKE T-18 — login PKCE do OpenRouter na extensão

## Objetivo
Provar que o fluxo de autenticação do OpenRouter pode ser iniciado a partir de uma extensão Chrome MV3, com `PKCE` e redirecionamento seguro, sem expor a chave em páginas ou em `content scripts`.

Escopo estrito: documentação de prova de conceito, não funcionalidade de produção. Nenhuma chamada real de geração ou modelo foi adicionada ao código.

## Resumo executivo
O fluxo recomendado pelo OpenRouter é compatível com a API `chrome.identity.launchWebAuthFlow`, desde que:
- a extensão tenha a permissão `identity`;
- o `redirect_uri` seja gerado por `chrome.identity.getRedirectURL()`;
- o `code_verifier` seja gerado aleatoriamente e convertido em `code_challenge` com `S256` (base64url);
- a URL de autenticação do provedor seja aberta em uma janela interativa do browser;
- após o retorno com `code`, o código seja trocado por uma chave via `POST https://openrouter.ai/api/v1/auth/keys`.

## O que funcionou
### 1) `chrome.identity.launchWebAuthFlow` é a opção correta
Em uma extensão MV3, o fluxo de autenticação do usuário deve ser iniciado por `chrome.identity.launchWebAuthFlow({ url, interactive: true })`.

A URL do provedor deve incluir:
- `callback_url=<redirect_url>`
- `code_challenge=<code_challenge>`
- `code_challenge_method=S256`

O valor `redirect_url` vem de `chrome.identity.getRedirectURL()`, que normalmente resolve para algo como:

`https://<extension-id>.chromiumapp.org/`

Esse é o ponto de retorno seguro para o Chrome e é o modo em que o navegador entrega o código após o login interativo do usuário.

### 2) O fluxo PKCE é compatível com o protocolo do OpenRouter
A implementação esperada segue o padrão:

```ts
const codeVerifier = crypto.getRandomValues(new Uint8Array(64))
  .reduce((acc, byte) => acc + String.fromCharCode(byte), '')
  .replace(/[^A-Za-z0-9\-._~]/g, '')
  .slice(0, 128);

const encoder = new TextEncoder();
const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const redirect = chrome.identity.getRedirectURL();
const authUrl = new URL('https://openrouter.ai/auth');
authUrl.searchParams.set('callback_url', redirect);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
```

Em seguida, a extensão abre:

```ts
const result = await chrome.identity.launchWebAuthFlow({
  url: authUrl.toString(),
  interactive: true,
});
```

O callback traz um código de autorização que pode ser extraído da URL de retorno e trocado por uma chave de API.

### 3) Troca do `code` por chave funciona no modelo do provedor
O passo final do fluxo, em teoria, é:

```ts
const params = new URLSearchParams({
  code,
  code_verifier: codeVerifier,
  code_challenge_method: 'S256',
});

const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: 'S256' }),
});
```

Se a autenticação for aceita, a API retorna uma chave de uso do usuário. Essa chave deve ser guardada em `chrome.storage.local` sob a chave `secrets:v1`, nunca em `content scripts` ou logs.

## O que falhou / o que precisa ser validado no browser real
### 1) Não é possível provar o login real em um ambiente headless ou sem interação do usuário
O login do OpenRouter exige uma interação real do usuário com a página de autenticação do provedor. Em CI, testes headless e ambientes sandboxed não têm uma sessão autenticada do OpenRouter nem uma instância de navegador com identidade do usuário.

Portanto, esta spike documenta o desenho do fluxo e a integração correta com a extensão, mas não conclui um login real em automação.

### 2) O campo exato de privacidade ainda precisa ser confirmado na documentação oficial
A política `provider.data_collection = "deny"` é a recomendação prevista pela arquitetura do projeto, mas o nome exato do campo e a forma de envio na API precisa ser confirmada na documentação do OpenRouter antes de implementar produção.

Até esse ponto, o código de produção não será adicionado; a implementação definitiva fica para a tarefa T-19.

## Permissões e acesso necessários
Para a esteira de prova do fluxo, os requisitos mínimos são:

- `"identity"` — para `chrome.identity.launchWebAuthFlow` e `chrome.identity.getRedirectURL()`;
- `"storage"` — para guardar a chave em `chrome.storage.local`;
- `"activeTab"` e `"scripting"` — para o clique da extensão e injeção de script quando o usuário ativa o fluxo;
- host permission opcional para `https://openrouter.ai/*` — solicitada ao usuário por `chrome.permissions.request(...)` em gesto do usuário, se a API for chamada em background.

Esses requisitos seguem a decisão de menor privilégio e o contrato do ADR-002.

## URL de retorno e retorno da autenticação
A URL de retorno deve ser o redirect gerado pela própria extensão:

`chrome.identity.getRedirectURL()`

Normalmente:

`https://<extension-id>.chromiumapp.org/`

Esse é o valor que o OpenRouter usa como `callback_url` no login PKCE. O resultado retornado por `launchWebAuthFlow` é uma URL completa contendo o `code` e outras informações na query string. A extensão então parseia o `code` e prossegue com a troca por token/chave.

## Fallback de chave manual
Se `launchWebAuthFlow` falhar por qualquer motivo (usuário cancelou, browser não suportou, login indisponível, CORS/problema de redirect, etc.), o fluxo de segurança do produto usa o fallback seguro:

1. mostrar um campo para colar a chave manualmente;
2. validar o formato básico da chave antes de salvar;
3. armazenar em `chrome.storage.local` em `secrets:v1`;
4. nunca repassar a chave para o `content script`;
5. manter a extensão funcionando sem IA quando o login falhar.

## Conclusão
O fluxo PKCE do OpenRouter é viável na extensão Chrome MV3 usando a API de identidade do navegador. O desenho da solução é consistente com os requisitos de segurança, privacidade e arquitetura da extensão.

A implementação real da comunicação com a API OpenRouter fica para T-19 e deve ser feita somente após a confirmação oficial do campo de privacidade (`provider.data_collection`) e do retorno do login em um browser do usuário.

## Marcação de escopo
Esta spike foi concluída como documento de prova de conceito. Nenhuma funcionalidade de produção foi adicionada; apenas a documentação necessária para validar a direção do design e evitar implementação prematura.
