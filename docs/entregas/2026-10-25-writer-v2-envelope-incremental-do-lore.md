# Writer V2 — envelope incremental e orçamento semântico do lore

- Data: 2026-10-25.
- Marco: P1 / M38c12 C1.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md), aberto.
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

O índice do objeto data agora oferece entrada de prefixo com consumed em bytes
e até 64 referências por passo. Ao atingir o orçamento, a próxima chamada
continua no byte seguinte; não perde nem repete referências e não acumula a lista.
A entrada anterior conserva consumo integral, erro em bytes excedentes e ABI.

BookPortableLoreItemIndex valida o envelope fechado de uma ficha lore inteira:
schemaVersion/kind/parentId/id/data. Aceita as 120 ordens canônicas dos campos
já admitidas pelo schema; ID é limitado e data usa o índice compartilhado.
Preserva texto/aliases/relações/datas/privacidade sem defaults ou normalização.
Produz offset/contagem de data, ranges e metadata; checkpoint JSON tem limite
de 32768 bytes e mantém somente sintaxe/IDs/metadata.

A motivação do orçamento é concreta: ValidationStore permite até 96 escritas
por operação, mas um frame de 64 KiB pode conter muitas relações curtas.
C2 poderá consumir até 64 referências, salvar cursor sintático/posição e retomar
o mesmo frame. Não aumentar esse orçamento nem materializar toda a ficha.

As referências emitidas são provisórias até domínio completo/EOF/hash/framing.
Nenhum parser concede acesso, verifica SHA da origem ou autoriza ativação.
Sem endpoint, Rule, namespace, dependência, novo recurso persistido ou interface.
O arquivo final, validadores e restaurador ainda não usam esse caminho.

## Critérios verificados

- [x] Envelope e domínio mantidos para todas as ordens de campos.
- [x] UTF-8/escapes/BOM e retomada dentro de ID, valor e relação.
- [x] Consumo exato com orçamento de 1, 17 e 64 referências.
- [x] Texto e descrição acima de 16 MiB/128 partes sem prosa no checkpoint.
- [x] Duplicados/ausência/vazio, nomes e aliases literais.
- [x] Truncamento, injeção, bytes excedentes, UTF-8 e estado inválido rejeitados.
- [x] Entradas nativas e API anterior preservadas; estados portáteis separados.
- [x] Produtor C1 real percorre o parser inteiro no bridge e no Chromium.
- [ ] ContentMachine/validação local/servidor e ponteiros limitados: C2.
- [ ] Captura/selo do arquivo: C3; leitor/remap/materialização/roundtrip: D.
- [ ] Demais P1/V2, inventários, rollout, validate e gates humanos/comerciais.

## Arquivos e revisão

BookLoreFieldValidation recebe orçamento opcional somente na entrada portátil.
BookPortableLoreIndex compartilha o mesmo núcleo para a entrada anterior e o
prefixo novo. BookPortableLoreItemIndex e sua declaração são novos. Testes novos
Node e bridge Vitest existente cobrem retomada/compatibilidade/composição.

A revisão conferiu limites do ID, posição do objeto data durante a leitura,
entrada imutável e separação entre prova sintática e integridade/autorização.
A primeira rodada teve 41/43 positivos: o ID inválido era rejeitado com o código
do validador de campo. O envelope passou a converter esse erro para invalid-record,
preservando o contrato do backup. Depois, 43/43 positivos, inclusive UTF-8 inválido.
Nenhuma validação relaxada ou cobertura reduzida.

## Evidência real

**43/43 Node novos** em bookPortableLoreItemIndex.test.mjs. Incluem todas as
120 ordens do envelope, checkpoint byte a byte, texto e descrição >16 MiB,
1000 relações com três budgets, IDs máximos/qualificados, corrupção e cada
prefixo truncado de um item de referência. Reexecutados após revisão do offset.

**217/217 Node de regressão** em bookLoreFieldValidation, bookLoreBaseIndex,
bookPortableLoreIndex e bookLoreFieldUpload. Consumo antigo/nativo, páginas,
upload/selo, erros, corpo grande e cleanup continuam positivos.
Total distinto do marco: **260 Node**, em execuções dirigidas.

**26/26 Vitest** do bridge bookLorePortableClient. As capturas positivas
inline/v1/v2/criação, fontes grandes e relações passam também pelo índice do
envelope com orçamento 17, checkpoint serializado e comparação independente de
offsets/ranges/referências com a prova do produtor C1.

**Três jornadas Chromium reais**, somente loopback, sem Buffer:

1. Serviço C1 real em memória → produtor → índice de item: 10005932 bytes,
   153 partes e 161 unidades nativas distintas; 130 referências, sete pausas
   semânticas, checkpoint máximo 1047 bytes e metadata igual à prova de captura.
2. Recarga com checkpoint serializado no meio do UTF-8 do ID; resto aceito e
   metadata/contagem exatas. Não comprova persistência durável ou UX de retomada.
3. Frame com 1000 relações, até 64 referências por passo e rejeição de injeção
   após o item concluído. Sem perda/replay de referências.

Bundle Vite dirigido do parser: **11 módulos, 26742 bytes, zero imports externos**.
Declarações compartilhadas verificadas com tsc isolado sem skipLibCheck.
Sintaxe/lint/formato/arquitetura/docs/diff e hooks conferidos no fechamento.
Sem SDK novo ou build geral neste passo puro; nenhuma fronteira de I/O alterada.
A suíte global fica para o fechamento de P1. Sem CI/push/PR/merge/deploy.

Script externo de Chromium: writer-v2-portability-qa/m38c12c1-browser.mjs.
Testes permanentes não dependem dele.

## Continuidade obrigatória

C1 prepara a integração, sem concluir C ou habilitar backup grande. C2 deve usar
consumed/offset/orçamento no ContentMachine e nos validadores local/servidor,
ligar referências ao item/arquivo/provas e manter ponteiros limitados no estado.
C3 conecta a captura e a revalidação ao selo; D precisa remapear/materializar
texto e relações grandes, inclusive crescimento após remap, com origem verificada,
inventário, rollback, retomada e raiz ausente até a ativação.

Plano 131, P1/F2-09/V2 e fases 3–5 continuam abertos. Sem operação de produção;
master e dev server preservados. Somente commit local.
