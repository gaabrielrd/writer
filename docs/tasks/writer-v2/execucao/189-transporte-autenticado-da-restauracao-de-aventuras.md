# P2 — transporte autenticado da restauração de aventuras

Base: e3c3c05. Bloco 186–188 validado integralmente e commitado localmente.
Usar plan-feature/implement-feature; sem subagentes, CI, push ou deploy.

## Objetivo e descoberta

Ligar o pipeline já implementado ao transporte Functions para o futuro cliente,
por comandos explícitos. index.mjs ainda não compõe AdventureRestore; seus
29 comandos existem no Transfer. Livros têm lista fechada, fronteira de dispatch
e headers próprios. Reutilizar esse padrão, mantendo DTOs de aventura.

## Requisitos e proposta

- adventureRestoreCallable.mjs com lista imutável própria de 29 métodos,
  invokeAdventureRestoreCallable e setAdventureRestoreHeaders. Não derivar
  permissão de nomes arbitrários do payload ou enumerar métodos do serviço.
- Autorizar UID antes de seleção/executar serviço; recusar método desconhecido,
  herdado, não função ou port interno. Preservar erros de contrato/reason.
- Compor cedo no callable comum, antes da seleção genérica; usar
  createAdventureRestoreTransferService com db e createRestoredImageStorage(bucket).
  Somente a lista explícita escolhe esse serviço. Nenhuma seleção por campo
  method/action do cliente, nem exposição de leitores, hash states ou chaves.
- Exports literais correspondentes no index; App Check obrigatório, região
  us-central1, memória 512MiB, maxInstances 5, sem segredo de IA ou débito.
  advanceAdventureRestoreValidation usa timeout 540 s, demais 120 s.
- Comandos executados recebem Cache-Control private, no-store e Vary
  Authorization, inclusive erros da aplicação. Middleware real Auth/App Check
  mantém sua recusa anterior ao serviço e não ecoa conteúdo/credenciais.
  Não adicionar bypass de App Check em runtime.
- Erro de contrato segue HttpsError público; falha inesperada é sanitizada
  pela fronteira comum, sem stack/prosa/chave em resposta.
- Sem implantação. Este incremento altera o contrato de código interno para
  comandos explicitamente transportáveis; recuperação HTTP/chaves e cliente/UI
  permanecem etapas próprias. Não anunciar disponibilidade em produção.

## Métodos públicos previstos

Start/resolveStart/get/list/append/resolveOperation/cancel/cleanup; integridade,
validação, estrutura, recursos, perfis, histórico, finalizeDraft, universo,
personaLibrary, imagens, imageStorage, contagens, auditoria, imageLibrary;
revisão/ativação/encerramento; estado/avanço da mídia; estado/avanço da coleta.
Não incluir getAdventureRestoreRecoveryKey nem leitores openVerified/observe.

## Sequência e arquivos

1. Criar fronteira/lista/headers próprios; compor/importar e exportar literalmente
   no index, mantendo configuração e sem afetar os comandos de livro existentes.
2. Testes Node de dispatch/entrada/headers/prototypes/reasons, inventário de
   exports/configuração/segredos e serviços reais até ativação/mídia/coleta.
3. Exercitar wrappers exportados via run com Auth inválida e erros fechados;
   HTTP real para App Check ausente/inválido e ausência de vazamento. Não confundir
   run com prova de middleware nem configuração local com credenciais/deploy.
4. SDK demo pertinente se necessário para comando bem-sucedido no wrapper real;
   usar emulador isolado e fixture própria. Testes dirigidos após ajustes.
5. Revisão, ADR/docs/AGENTS/evidência e commit local. Validate integral no próximo
   grande bloco, conforme orientação do operador.

## Aceites e riscos

- [x] Somente os 29 comandos explícitos cruzam a fronteira, com exports exatos.
- [x] UID/App Check/configuração/headers privados e erros seguros comprovados.
- [x] Contratos reais continuam fechados e recuperação/ports não são expostos.
- [x] Testes dirigidos/HTTP/SDK pertinente, revisão/docs/evidência e commit local.

Risco de seleção arbitrária e de tests run ocultarem middleware: cobrir separadamente.
Não escopo: recuperação HTTP/chaves, controlador/journal cifrado, UI/roundtrip,
comércio/publicação, nova dependência/índice/Rules ou deploy. P2/P3/D/F2-09,
fases 3–5/gates e macro 8/35 continuam abertos.
