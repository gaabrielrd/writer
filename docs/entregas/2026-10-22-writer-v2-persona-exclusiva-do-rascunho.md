# Writer V2 — Persona exclusiva do rascunho (P1 M34a)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 67](../tasks/writer-v2/execucao/67-persona-exclusiva-do-rascunho.md)
- Decisão: [ADR 0078](../decisions/0078-draft-only-persona-reconciliation.md)

## Objetivo e funcionalidades

Corrigir um impedimento encontrado ao iniciar a recuperação de rascunhos:
um pacote válido com perfil exclusivo do rascunho falhava ao fechar M31.
Agora a preparação reconhece sua contribuição exata e avança até draft,
preservando a biblioteca e a ausência de raiz.

## Critérios atendidos

- [x] book-draft lido pela posição estrutural validada, com tipo/ID e prova
      conferidos na transação; sem varredura de histórico ou consulta por nome.
- [x] Perfil compartilhado exige definição preparada comprovada e igualdade
      integral/hash. Perfil exclusivo registra somente seu ID remapeado.
- [x] Contagem exata entre definições dos vínculos salvos e contribuição
      exclusiva; sem tolerância numérica genérica.
- [x] Campo opcional de progresso v5–v7 e recibos compatíveis. Identidade
      de contribuição declarada não pode mudar em replay de recibo novo.
- [x] Sem biblioteca atual copiada, perfil exclusivo criado prematuramente,
      novo recurso/inventário/API pública/Rule/dependência/crédito.
- [x] Origem/cancelamento conferidos antes do manifesto; cleanup continua
      removendo somente definições preparadas próprias.

## Arquivos

BookRestorePersonas acrescenta leitura/prova do rascunho e reconciliação.
Upload/UploadContracts preservam o descriptor e a compatibilidade.
Fixture e testes de personas Node/SDK incluem perfis exclusivo/compartilhado,
cancelamento e replay. AGENTS, README, arquitetura/testes, execução/plano e
ADR documentam o contrato e a continuação obrigatória.

## Testes e validações reais

**93 testes Node distintos positivos**: regressão em cinco arquivos, 92/92 em
6.783,1458 ms, mais um cenário novo de compatibilidade, 1/1 em 377,5579 ms.

```text
tests 92
pass 92
fail 0
skipped 0
duration_ms 6783.1458
```

Arquivos: bookRestorePersonas, bookRestoreUniverse, bookRestoreHistory,
bookRestoreUpload e bookRestoreContentRead. Cinco cenários novos verificam
perfil exclusivo até draft/cleanup, perfil compartilhado sem duplicação,
cancelamento durante leitura do descriptor e confirmação histórica antes/depois
de adulterar a identidade. O teste negativo exige identity-conflict e confirma
primeiro o recibo válido, para não passar por entrada inválida. O caso adicional
remove o campo opcional para reproduzir jobs/recibos anteriores, conferindo
leitura, replay e cleanup até cancelled; passou isoladamente, 1/1 sem skips.

**Um cenário SDK novo positivo**, executado isoladamente, Firestore 1.22.0
verificado e porta loopback dedicada: 71.282,8182 ms; total 72.040,3607 ms.
O pacote possui três perfis distintos: dois dos vínculos salvos e um do rascunho.
Só os dois primeiros são preparados neste estágio; o terceiro fica identificado.
A preparação chega a draft, cleanup termina e a biblioteca atual permanece.

```text
tests 1
pass 1
fail 0
skipped 0
duration_ms 72040.3607
```

Sintaxe de Functions, arquitetura e lint dirigido passaram. Formatação/docs/diff
e revisão final conferidos antes do commit. Nenhum código cliente modificado:
Vitest/typecheck/build não repetidos; validate integral no fechamento P1.
Os dois cenários SDK antigos de personas não foram repetidos neste ajuste.

## Limitações e próximos passos

O texto do rascunho e a definição exclusiva continuam pendentes de preparação.
A continuação M34 deve preservar ambos os textos, criando versão separada para
a contribuição diferente, inclusive vazia/removida, sem autosave no manuscrito.
draftProfileId representa contribuição exclusiva e deve permanecer estável
depois de preparar o perfil, para a reconciliação/certificação final.

Faltam rascunho/capa, integração de personas, campos grandes/consumidores,
certificação/ativação e host/UI/roundtrip/validate. P1/F2-09 e Writer V2 seguem
abertos. Nenhuma jornada de restauração final no navegador foi demonstrada.
Somente commit local; CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
