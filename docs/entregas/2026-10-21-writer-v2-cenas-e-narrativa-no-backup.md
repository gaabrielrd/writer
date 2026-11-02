# Writer V2 — Cenas e narrativa no backup (P1 M5)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2, commit local.
- **Plano:** [contrato 38](../tasks/writer-v2/execucao/38-cenas-e-narrativa-no-backup.md).
- **Decisão:** [ADR 0049](../decisions/0049-book-resources-read-proof.md).
- **Estado:** marco interno com validação dirigida; P1/F2-09 abertos.

## Comportamento entregue

- [x] Capturar cenas ativas, arquivadas e com agrupador ausente.
- [x] Incluir corpos, planos, referências e originais de conversão.
- [x] Incluir arcos, marcos, eventos, vínculos e controles de ordem A/B.
- [x] Conferir corpo obrigatório, hashes e identidades nativas de item/pai.
- [x] Projetar referências por IDs sem nomes/dados globais resolvidos.
- [x] Paginar, aguardar o sink e conferir prova final antes do selo M2.
- [ ] Schema integral, arquivo persistente, revisão e restauração completos.

Duas callables de leitura reautorizam livro/pai próprios; listas sem prosa e
transporte de 64 KiB, JSON limitado a 8 MiB por item. Origem/API M3b preservadas;
contexto e validação por item compartilhados. Nenhuma dependência/Rules nova.

## Resultados reais

Functions: regressão inicial 9/9 e família nova 8/8. Após reforçar validação de
tipo narrativo e projeção neutra, lote final combinado **18/18**, 258 ms,
sem falhas/skips/cancelamentos.

Cliente: regressão inicial **29/29**; família nova primeiro **11/11**.
Lote book-portability **52/52**, cinco arquivos, 2,84 s. Revisão reforçou
contagens fechadas e singleton/prova inválidos; repetição afetada **12/12**,
1,62 s. São **53 casos distintos com evidência positiva composta**, não uma
única execução de 53 casos.

SDK real: seis novos casos primeiro **6/6**, 7,90 s; lote final com M3b
**15/15**, 12,63 s, sem skips/falhas/cancelamentos. Confere máscaras vazias e
timestamps nativos, todos os tipos, isolamento, paginação, pai, mudanças de
corpo/plano, controles ocupados, exclusão e recriação da raiz.

Chromium com Firestore real no emulador: primeiro sete cenários positivos;
probe final **oito cenários**, 17,09 s do harness, 58 versões e 146 registros M2.
Arquivo de fixture: 560.205 bytes; histórico: 216.003 bytes em 61 partes;
maior parte 65.536 bytes. Recursos: controle de cena 1, fonte 1, cenas 2,
corpos 2, planos 2, referências 2, controles narrativos 3, arco 1, marco 1,
evento 1 e vínculos 2. Zero runtime errors e requisições externas bloqueadas.

Cenários: Unicode/vazio/recurso removido; composição estrutura/histórico;
hash corrompido sem selo; mutação real de catálogo; abort sem nova leitura;
todos os tipos/ordem B; mutação nativa de filho; prova antiga sem selo.
Writers reais criam/convertem/reordenam os recursos. Alterações Admin
intencionais demonstram detecção de inconsistência. Referência indisponível
mantém IDs sem nome extra; mesmo ID sob duas cenas tem endereços distintos.

## Checks e revisão

Typecheck, lint dirigido, arquitetura e sintaxe Functions passaram. Log do build
encerra bundle e smoke com sucesso. Avisos conhecidos: chunk acima de 500 kB e
imports estáticos/dinâmicos de workHistoryCallables/exportDocx.
Dependências não mudaram; auditoria M4 mantém três achados moderados
preexistentes. Sem nova auditoria neste marco e sem declarar audit verde.

Revisão conferiu projeções fechadas, compatibilidade M3b, pertencimento,
prova de filhos, cancelamento e ausência de controles privados no arquivo.
Formato/links/diff conferidos antes do commit; hooks normais preservados.
Validate completo fica para o fechamento P1, conforme operador.
Nenhuma CI consultada/disparada, push, atualização de PR, merge ou deploy.

## Limites e continuidade

Ponte HTTP do probe fixa UID de teste e não comprova Auth/App Check produtivos;
isolamento tem prova SDK separada. Fixture acumula frames/Blob pequenos para
asserções: não prova memória do sink final, disco, diálogo de salvar, UI/temas
ou restauração. Não altera os JSON v1–v6.

Faltam lore próprio, personas usadas, universo autorizado, rascunho explícito,
mídia, schema integral/leitor legado, sink persistente, revisão,
preparação/remapeamento/ativação/limpeza e recuperação. Nenhuma tarefa ampla
da V2 adicional concluída por este marco.
