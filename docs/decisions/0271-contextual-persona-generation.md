# ADR 0271 — Personas por contexto de universo

- Data: 2026-11-02
- Estado: aceita no plano e nas escolhas registradas na conversa

## Contexto

A biblioteca de personas já oferece perfis privados, atributos, composição e
vínculos. O autor precisa gerar uma voz coerente com seu universo e lore sem
criar outro modelo de persona ou alterar automaticamente projetos existentes.

## Decisão

Manter criação e revisão na feature ai-assistant. A ação personaGeneration de generationApi
captura somente universo próprio e até 25 fichas globais escolhidas, com teto de
64 KiB. A prévia e os pedidos usam um hash do conteúdo, relógios e identidades
nativas; o servidor relê a origem na geração, conclusão e primeiro aceite.

Usar geração da plataforma, snapshot público de modelo/raciocínio e o transporte
existente, sem BYOK neste incremento. Não debitar créditos do Writer, conforme
escolha explícita do operador; limitar a dez gerações por hora por conta. Lore é
dado não confiável, enviado separado das instruções do sistema.

Validar JSON fechado e reconstruir os oito atributos padrão pelo compilador puro.
Os atributos próprios são limitados a oito. A IA sugere estilo; o autor revisa
conteúdo e campos antes de salvar. Preservar o formato atual da biblioteca.

Pedido, limite e aceite são controlados no servidor. Aceite cria uma nova persona
com ID determinístico e recibo na mesma transação, sem sobrescrever perfis ou
alterar restoreOrigin. Retry exige a mesma revisão editada e não grava de novo.
A fonte é contexto de criação, sem vínculo permanente: perfis salvos permanecem
independentes, privados e selecionáveis pelos mecanismos existentes.

Pedidos armazenam apenas seleção, hash, parâmetros públicos e proposta, nunca
corpo do lore, intenção ou credenciais. Após aceite, removem a proposta. Expiração
em uma hora e coleta limitada por scheduler cobrem pedidos abandonados.
Revisão e recuperação do cliente são transitórias em memória.

## Consequências

A criação manual, presets, perfis restaurados e vínculos existentes permanecem
compatíveis. Não há migração de personas ou alteração nos formatos de backup.
São necessários implantação coordenada de Functions/frontend/regras/índice e
acesso ao modelo configurado. A qualidade literária e a ausência de fatos privados
na proposta dependem da revisão do autor; testes verificam contratos e fluxo.

## Integração com a principal atualizada

A principal recebeu a ADR 0270 durante a validação da feature. O transporte usa
shared/api/domainCallable e registra a ação personaGeneration em generationApi.
O serviço do setor delega ao mesmo contrato privado de captura/geração/aceite.
A coleta é composta no scheduler cleanupBookAssets existente, preservando 30
recursos implantáveis e sem reintroduzir endpoints individuais.
