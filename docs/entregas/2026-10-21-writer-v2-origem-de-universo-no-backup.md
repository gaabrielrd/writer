# Writer V2 — Origem de universo no backup (P1 M7)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2; desenvolvimento local.
- **Plano:** [contrato 40](../tasks/writer-v2/execucao/40-origem-de-universo-no-backup.md).
- **Decisão:** [ADR 0051](../decisions/0051-book-universe-origin.md).
- **Estado:** marco interno validado com checks dirigidos; P1/F2-09 abertos.

## Comportamento entregue

- [x] Capturar vínculo de universo com criação nativa precisa e acesso atual.
- [x] Distinguir sem vínculo, referência autorizada e origem indisponível.
- [x] Preservar referência neutra se origem estiver ausente, deleting ou alheia.
- [x] Não copiar nome, descrição, lore, contadores ou permissões globais.
- [x] Detectar edição, revogação ou recriação mesmo com raiz de livro imóvel.
- [x] Evitar token observável de alterações de um universo alheio.
- [x] Exigir nova captura se origem mudar antes do selo M2.
- [ ] Religação/ativação na restauração e pacote P1 completos.

Arquivos: bookBackupUniverse puro/tipos, bookBackupUniverseRead servidor,
dispatcher/check Functions, bookUniverseCapture/Callables, interface pública e
testes Functions/cliente/SDK. Nenhuma dependência/Rules/coleção nova.
Somente a encarnação nativa autorizada e o ID entram no descriptor; arquivo não
concede acesso. A restauração futura reautorizará a origem sem exigir o livro
original existente e ativará vínculo/contador atomicamente.

## Resultados reais

Functions primeiro **6/8**: duas expectativas de teste estavam incorretas.
workFail devolve details.reason, não details string; a leitura de source de livro
deleting precisava ficar dentro de assert.rejects. Corrigidos somente testes.
Execução seguinte **8/8**, 90 ms, sem skips/falhas/cancelamentos.
Cobre precisão, máscaras, dados privados, causas opacas, ausência/null,
vínculos inválidos, edição/recriação e transições de disponibilidade.

Cliente primeiro **8/8**, 1,29 s. Com transporte padrão/regressão de callables,
**14/14** em dois arquivos, 1,39 s. Cobre descriptors fechados, prova imutável,
timestamp/escopo inválidos, origem/token alterados, origem de livro divergente,
pressão do sink, abort e falha sem retry. Não há inicialização de Firebase ao
importar o adaptador; a chamada usa região/método e token esperados.

SDK real **5/5**, 4,75 s. Usa createUniverse, prepareUniverseProjectLink estrito,
updateUniverse e saveUniverseLore reais; confere contador do vínculo e timestamps
nativos com máscara. Exclusão SDK é negada e exclusão normal de universo vinculado
é bloqueada; troca Admin deliberada com corpo igual invalida encarnação.
Também cobre namespace próprio, raiz deleting/recriada, remoção de vínculo e
indisponibilidade opaca sem sinal de alterações alheias. Sem skips/retries.

Chromium com Firestore real no emulador: **14 cenários em um probe**, 20,27 s.
Compõe M3b/M4/M5/M6/M7 em 156 registros e 874.353 bytes de fixture, com 58 versões,
216.003 bytes históricos/61 partes (máximo 65.536), lore próprio, três perfis,
cenas/narrativa e descriptor nativo do universo. Zero runtime errors e zero
requisições externas bloqueadas.

A prova final inclui identidade de origem sem metadata global, edição real de
universo sem mudança no livro, arquivo sem selo após prova antiga e recriação
de corpo igual. Preserva todos os cenários anteriores de hash, catálogo, Unicode/
BOM, ordem B, referências neutras, abort e perfis externos.

## Checks e revisão

Build/typecheck/bundle/smoke, lint dirigido, arquitetura e sintaxe Functions
passaram. Formato, links e diff conferidos antes do commit, hooks preservados.
Avisos existentes de chunk grande e imports estáticos/dinâmicos de
workHistoryCallables/exportDocx permanecem. Sem alteração de dependências;
auditoria M4 com três moderados preexistentes continua registrada, sem nova
auditoria nem alegação de audit verde neste marco.

Revisão conferiu ausência de leitura global por corpo/subcoleção, descriptor
fechado sem grant, privacidade do estado indisponível, identidade precisa,
prova e cancelamento. Validate completo permanece para fechar P1, conforme
operador. Nenhuma CI consultada/disparada, push, PR, merge ou deploy.

## Limites e continuidade

Ponte HTTP nativa fixa UID de teste; autorização tem prova SDK distinta.
Não prova Auth/App Check produtivos. Fixture acumula frames/Blob pequenos para
asserções, sem comprovar orçamento de memória do sink, disco ou UI.
Nenhuma restauração, revisão de legado ou religação de universo é anunciada.

Faltam rascunho explícito, mídia autorizada, schema/leitor legado, arquivo
persistente, revisão e preparação/remapeamento/ativação/cleanup/recuperação.
Não fecha P1/F2-09 nem acrescenta tarefa ampla concluída à V2.
