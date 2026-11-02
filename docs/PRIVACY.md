# Política de privacidade do ApplyAssist

**Última atualização: 02/11/2026**

O ApplyAssist é uma extensão local para auxiliar no preenchimento de formulários de candidatura. Não enviamos dados a um servidor do ApplyAssist, não criamos contas e não usamos telemetria.

## Dados armazenados

O perfil, as configurações, os dados de aprendizado, o histórico de candidaturas e as credenciais de IA configuradas são guardados em `chrome.storage.local`, no perfil local do navegador. As opções permitem exportar os dados da extensão ou apagá-los. A exportação não inclui credenciais de IA.

## Provedores de IA

A IA é opcional e só é usada após uma ação explícita do usuário. Uma geração pode transmitir ao provedor conectado a pergunta e o texto da vaga selecionado ou colado, além do contexto de perfil preparado para a geração. O perfil é submetido a redação automática de dados sensíveis e de contato; mesmo assim, revise o texto antes de solicitar uma geração. O OpenRouter recebe a opção `data_collection: deny`; as práticas de tratamento do provedor também se aplicam. Credenciais configuradas são mantidas no armazenamento local e não fazem parte da exportação.

## Controle e limites

A extensão não envia formulários, não coleta vagas, não lê automaticamente descrições de vagas, não sincroniza dados e não transmite dados para fins de análise. O LinkedIn é bloqueado para injeção; o modo colar não acessa a página. A exclusão dos dados pode ser feita nas opções do ApplyAssist. Os dados também estão sujeitos à segurança do perfil do navegador e do dispositivo.
