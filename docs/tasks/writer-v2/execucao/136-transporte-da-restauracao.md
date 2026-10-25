# P1 — transporte explícito da restauração

## Objetivo e descoberta

Ligar preparação, revisão, ativação, mídia e limpeza à composição Functions,
sem expor leitores internos ou introduzir implantação. Complementa o passo 5 do
[plano 133](133-revisao-e-ativacao-do-livro.md).

Grafo writer-v2 não retornou símbolos atuais; inventário de projetos não
respondeu e foi interrompido. Inspeção atual do código: index.mjs exporta somente
upload, integridade e validação. Demais comandos existem no serviço composto,
mas não têm exports; a seleção atual procura propriedades arbitrárias do serviço.
Recuperação da chave já usa HTTP separado com Auth/App Check e no-store.

## Requisitos e suposições

Manter comandos existentes e acrescentar somente os comandos públicos necessários
ao pipeline. Cada comando permanece responsável por entrada fechada, autorização,
fase, revisão, prova e recibo. Não aceitar nome de método dentro do payload como
comando alternativo. Lista imutável única orienta seleção e headers; exports
Functions continuam literais e verificáveis. Leitores openVerified/openPrepared,
chaves, cleanupPersonaLibrary e cleanupCoverStorage não são callables públicos.

Preservar HTTP separado de recuperação. Não mover bytes privados para logs ou
mensagens de falha. Manter App Check obrigatório, região/memória/limites existentes,
private no-store e Vary Authorization para todos os comandos de restauração.
Mesma conta só confirma por autorização atual; sem bypass de App Check em runtime.

## Sequência e arquivos previstos

1. Evoluir lista fechada em bookRestoreUploadContracts, fronteira pura em
   bookRestoreCallable e headers em bookRestoreUpload.
2. Compor cedo essa fronteira em index.mjs; remover seleção arbitrária anterior
   de bookRestore e declarar exports literais de preparação/revisão/ativação/
   mídia/limpeza, sem expor os ports internos.
3. Testar lista/fronteira, parâmetros literais e erros, comandos reais do serviço,
   exports/configuração, negação Auth e HTTP App Check. Usar testes dirigidos.
4. Revisar, atualizar AGENTS/arquitetura/testes/execução, ADR/evidência e commit local.

## Riscos e não escopo

Expor um serviço inteiro por enumeração pode vazar leitor interno; prevenir com
allowlist literal fechada. Testes por run não exercitam middleware de App Check;
HTTP real deve provar recusa antes do serviço. Configuração declarada não prova
credenciais, deploy ou disponibilidade de produção.

Esta etapa não implementa ainda driver/revisão/journal cifrado/tela do cliente
ou roundtrip integral. Não habilita modo indexado padrão e não fecha inventários,
writers/exclusão/legados/rollout/validate de P1, fases 3–5 ou gates humanos/comerciais.

## Aceites

- [x] Somente comandos públicos explícitos, com lista imutável e exports literais.
- [x] Port interno/chave não expostos; recuperação HTTP preservada.
- [x] Auth/App Check/headers privados mantidos; erros sem conteúdo sensível.
- [x] Testes reais dirigidos e checks verdes; documentação/commit local.
      [Evidência](../../../entregas/2026-10-25-writer-v2-transporte-da-restauracao.md).
- [ ] Driver/UI/roundtrip e demais P1/V2/fases/gates permanecem no objetivo.

Sem CI, push, PR, merge, deploy ou subagentes; validate global no fechamento de P1.
