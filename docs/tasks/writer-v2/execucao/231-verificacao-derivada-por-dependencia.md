# P3 — Verificação derivada retomável por dependência

- Data: 2026-10-29.
- Base: 14ae5ef; índice do plano 230 validado.
- Estado: núcleo interno implementado e validado por testes dirigidos/SDK, sem ativação.

## Objetivo e requisitos

Conferir a semântica derivada com pausa/reinício inclusive entre partes de um
mesmo item. Não limitar chunkCount ou repetir prefixo para retomar. Preservar
contagens, regras e digest canônico do revisor atual, sem acumular deps do
tamanho do texto. Reutilizar uma máquina de passos no revisor completo e no
coordenador persistente.

Cada passo verifica no máximo uma dependência ou uma relação (até dois lookups),
ou executa uma transição local limitada. Uma chamada aceita 1–25 passos; buscas
de ausência permanecem limitadas pela árvore de posições. Hash é emitido em
fragmentos exatamente equivalentes ao JSON antigo. Estado guarda fase/cursores
de campo, parte e relação, parent/proof necessários e SHA incremental cifrado;
sem array de dependências ou corpo de texto.

## Solução e arquivos

campaignBackupDerivedRowWalk será o contrato puro de passos, contadores e
fragmentos canônicos, com readers autenticados injetados. O revisor completo
usará a mesma máquina sobre seu índice MAC, conservando callbacks e resultado.
Antes da alteração, guardar referência local do algoritmo anterior para comparar
digests em arquivos reais, sem redefinir a compatibilidade pelo código novo.

campaignRestoreDerivedSemantics coordenará passos contra portas persistidas.
O índice expõe contexto interno validado da base/testemunha; isso não é grant.
derivedCheck opcional no job conserva checkpoint cifrado e binding ao índice/
arquivo/encarnação, com recibos/CAS. Não cria nova coleção. Preparar limpeza
desse campo com os outros estados antes do produtor; chave é revogada ao cancelar.

## Sequência e aceite

1. Guardar oracle anterior; implementar máquina pura e preservar resultados do
   revisor completo em regressões reais/compatibilidade.
2. Contrato fechado do checkpoint e cancelamento antes da persistência.
3. Avanço limitado, prova interna e composição com índice nativo, CAS/recibos/
   barreira C4/chave emissora.
4. Provar pausa no meio de item com muitas partes sem reler prefixo, digest
   anterior idêntico, relações opacas, ausência/borrowed bodies, falhas tardias,
   concorrência/rollback/cancelamento/recriação e SDK dirigido.
5. Checks dirigidos, revisão, ADR/AGENTS/inventário/evidência, commit local.

## Suposições, riscos e não escopo

Índice selado é imutável por encarnação; cada porta revalida seu estado/chave e
autentica registros. Cursor é exclusivo do servidor, nunca entrada de cliente.
Hash-wasm 4.12.0 preserva o codec existente. Não converter proof em JSON do
tamanho do projeto; emitir prefixo, cada dep e fechamento na ordem antiga.
Metadata por registro/contexto continua limitada; estados anteriores permanecem.

Ainda faltam origens persistidas, remapeamento/materialização/mídia, integração
C4 dos temporários antes de ativação e Estúdio/ciclos. Verificação semântica não
concede origem ou ativa campanha. Macro 8/35 e P3/D/F2-09 abertos. Sem agentes/
CI/push/PR/merge/deploy. Full validate no fechamento do bloco persistente;
preservar master e servidor manual.

## Resultado local

Núcleo implementado: 379 testes dirigidos (15 novos) e uma jornada SDK/Rules
positivos; cinco perfis assinados produziram provas/digests anteriores, novos
completos e retomados idênticos. Mil dependências pausaram na parte 350 e
retomaram sem repetir prefixo nem crescer estado. ESLint dirigido e sintaxe
de 469 módulos positivos. A
[evidência](../../../entregas/2026-10-29-writer-v2-verificacao-derivada-por-dependencia.md)
registra resultados reais e limites.

Próximo: revisão de autorização das origens persistida; depois materialização/
remapeamento/mídia, C4 dos temporários e UI/ciclos. Verificação derivada não é
grant de origem. Macro 8/35 e P3/D/F2-09 abertos; somente commit local.
