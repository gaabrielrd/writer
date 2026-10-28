# P2 — auditoria da aventura restaurada

Base: dd89774. Continuação da restauração aprovada, antes da ativação.

## Objetivo e limites

Auditar a preparação privada congelada: journals, documentos físicos e gerações
Storage. O selo não é autorização para publicar nem substitui reautorização do
universo/ativação atômica. Novas instalações de biblioteca/usos mudam inventário,
layout e contexto: devem invalidar e refazer o selo antes da ativação. Nenhum
teto artificial de imagens ou nova decisão de produto.

## Sequência e arquivos

1. Extrair a lista pura de coleções da raiz, preservando o reexport de Store.
   Compartilhar com layout de auditoria; incluir todas as coleções, descendentes
   conhecidos de cenas/blocos/arcos, preparedRoot e personas próprias da origem.
   Coleções sem endereço de staging válido devem permanecer vazias.
2. Estado privado limitado e fechado: família/pai/cursor, anchor com endereço e
   tokens nativos, contexto hash do job/validação/layout/inventário, selo e cursor
   de mídia. Contadores públicos somente journals/físicos/mídia. Fases
   audit-journals/audit-physical/audit-media/audit-ready.
3. Journals por páginas de oito: conferir journal, recibos e metadata dos alvos,
   sem reter corpos/imagens. Total igual a artifactCount. Não aceitar contador de
   cliente, valor alterado/recriado ou journal órfão. Conferir anchor a cada avanço.
4. Inventário físico limitado, oito documentos ou um pai por unidade. Conferir
   endereço/journal/nascimento de cada documento, incluindo filhos conhecidos
   e perfis com a origem tipada da aventura. Total físico igual ao de journals.
   Freeze dos writers internos e Rules privadas preservam as páginas já auditadas;
   SDK/Admin arbitrário não é um escritor autorizado da preparação.
5. Mídia por intenção nativa: verificar a geração Storage privada fora da
   transação e revalidar job/anchor/intenção/provas no ACK transacional. Replay
   precede I/O; ACK perdido/rollback não troca geração nem repete contadores.
   Falha externa mantém checkpoint e provas para retomar/cancelar.
6. Controles conferem total/processed/phase/cursor/countReady false, índice de
   referências completo e lote de personas preparing. Selo somente após todas
   as famílias e imagens, sem expor raiz, biblioteca, perfis ou URL.
7. Ampliar metadados/recibos e predicados anteriores; cancelamento mantém
   revogação/fences antes de fonte/artefatos. Auditoria não cria alvos adicionais.
8. Testes dirigidos Node/corpus/SDK: inventário completo/vazio, limites, no extra
   corpo em RAM, estrangeiros/órfãos/recriados em famílias e filhos, anchor/CAS/
   replay/rollback, Storage ausente/alterado/resposta perdida e cancelamento.
   Revisão/ADR/docs/evidência/commit local; validate no fechamento do grande bloco.

Arquivos novos Audit/Layout/Meta e constantes puras; Artifacts somente se necessário,
Contracts/Store/Transfer/StagingMeta e predicados de fases anteriores. Testes e
documentação próximos, sem novas dependências, índices ou endpoints.

## Riscos e critérios de aceite

Não importar orquestração na definição pura de metadados, evitando ciclos.
A identidade nativa e o recibo provam a versão já conferida pelo escritor; não
inventar outro hash do conteúdo. A auditoria física cobre famílias e filhos
conhecidos do contrato, sem consulta global a conteúdo de outros usuários.
Contexto do selo inclui inventário/layout e precisa ser exigido pela ativação
futura; uma auditoria anterior à instalação de biblioteca não autoriza sua versão
posterior. Reautorização do universo continua na transação final.

- [x] Todos os journals e documentos físicos se correspondem sem corpos em RAM.
- [x] Gerações Storage comprovadas antes do selo privado retomável.
- [x] Freeze, identidades, replay/CAS/rollback e cancelamento cobertos.
- [x] Testes dirigidos/SDK, revisão, documentação e commit local.

P2 ainda exige biblioteca/usos, ativação, aceitação/URL, recuperação/UI/roundtrip;
P3/D/F2-09, fases 3–5 e gates humanos/comerciais permanecem. Macro 8/35 inalterada.
