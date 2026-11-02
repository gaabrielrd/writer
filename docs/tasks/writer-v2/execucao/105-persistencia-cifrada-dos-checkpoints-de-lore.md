# P1 / M38c5g — Persistência cifrada dos checkpoints de lore

## Objetivo e fronteira

Conectar checkpoints de M38c5f ao journal protegido de M38c5e: gravar root e
páginas como uma geração cifrada coerente, preservar a última geração válida
durante falha e reconstruir operação após recarga sem RPC automático.

Não habilitar host visual por esta infraestrutura. Composição de write-ahead/
acks antes/depois de cada chamada e mapa completo de controles metadata para
cleanup sem chave continuam necessários antes da edição visual recuperável.

## Requisitos e sequência

1. Capturar root/controles em memória, sem intercalar mutações, validar formato
   fechado/identidade/digest e pedidos manuais. Root com wire é privado.
   Bundle versionado contém páginas até 50 e confirmações locais explícitas;
   não aceitar credenciais, funções ou snapshot legado.
2. Reutilizar JSON em partes de 64 KiB, AES-GCM e manifesto SHA cifrado,
   com AAD da nova seção checkpoint. Sem teto total 8 MiB/128 partes.
   Não persistir chave, prosa ou checkpoint em headers.
3. Header opcional compatível com journals antigos fixa active/pending/garbage.
   Escrever geração independente; cada frame+contador confirma em oncomplete.
   Trocar active somente em commit final e preservar geração anterior durante
   interrupção. CAS/Web Locks e guard de conta continuam obrigatórios.
4. Retry parcial só aceita o mesmo bundle. Partes completas com último commit
   abortado podem ser validadas e promovidas após reautorização. Ler active
   anterior continua explícito; corrupção preserva todas as gerações.
5. Confirmações locais opcionais de unidades aceitas ficam dentro do bundle
   cifrado e são aplicadas atomicamente com a troca de checkpoint, por hash/
   canal fechado. Não inferir recibo nativo ou sucesso de um cancel recusado.
6. Limpar somente geração antiga substituída, em lotes até 50 frames e CAS
   com cursor. Não apagar draft, pedido incerto, active/pending ou chave.
   Cleanup dessa cópia antiga não depende da chave, mas mantém guard.
7. Leitura pede chave fresca antes e ao fim de decrypt/validação. Restore
   recompõe o coordenador do draft e bundle, reautoriza após awaits e aplica
   cancelamento monotônico já registrado no journal. Nenhum envio ao abrir.
8. Testes dirigidos de formato/literalidade, geração/abort/CAS/acks/cleanup/
   revogação/legado e Chromium com reload e falha final reais; revisão,
   ADR/docs/evidência e commit local. Validate integral no fechamento de P1.

## Arquivos, riscos e aceite

Novo contrato/bundle e adaptador de checkpoint, journal/header/crypto-section/
barrel e testes. Sem dependências, backend, Rules, nova versão IndexedDB ou UI.

Captura e digest percorrem metadata; leitura reconstrói JSON em memória.
Geração parcial divergente é preservada e deve ser retomada com sua captura
original, não descartada automaticamente. Uma nova escrita aguarda coleta da
geração já substituída. Caller só confirma unidades depois de validar resposta.

Aceite: reload reconstrói cursores/pedidos de uma geração cifrada íntegra,
sem RPC inicial, preservando cópia anterior e cancelamento; troca e acks são
atômicos e coleta tem progresso limitado. Não declarar autosave/write-ahead
integrado, cleanup de todos os jobs sem chave, host, ciclo de vida da chave,
rollout ou conclusão de P1/F2-09/V2. Fases 3–5 e condições humanas/comerciais
continuam abertas; somente commits locais, sem CI/push/deploy.

## Resultado do incremento

Bundle/captura e adaptador cifrado integrados ao journal; gerações independentes,
acks/swap atômicos, retomada de falha final e coleta limitada implementados.
Restore recompõe somente do storage protegido, reautoriza e confere contexto/
cancel monotônico, sem RPC. 50 Vitest distintos e dois cenários Chromium
positivos em rodadas; lint/tipos/build/smoke/arquitetura e docs dirigidos.

Veja [ADR 0120](../../../decisions/0120-encrypted-persistence-of-lore-checkpoints.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-persistencia-cifrada-dos-checkpoints-de-lore.md).
Write-ahead/acks automáticos, mapa completo metadata de jobs sem chave,
reserva/host e ciclo de vida integrado continuam próximos. Sem retomada
visual ou conclusão de P1/F2-09/V2; validate no fim de P1. Só commit local.
