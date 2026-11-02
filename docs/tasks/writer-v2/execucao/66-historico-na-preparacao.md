# P1 / M33 — Histórico na preparação privada

## Objetivo e contrato

Materializar todas as versões manuais e anteriores a restaurações, inclusive de
recursos removidos, sem criar raiz utilizável ou alterar o manuscrito salvo.
Preservar prosa UTF-8/BOM, datas, razão e rótulo; remapear IDs/recurso pelo M21.

- Consumir work-version/work-history pelo leitor autenticado; nova capacidade
  interna lê uma parte raw com cursor encadeado. Conferir item e bytes na mesma
  transação de avanço. Cursor nunca vem do cliente.
- Preparar uma parte de origem por unidade, sem carregar todas as versões nem
  limitar sua quantidade. Preservar o limite de 64 KiB do pacote e usar
  splitHistoryContent para corpos UTF-8 compatíveis com os leitores atuais.
- SHA incremental privado por versão, com comprimento/hash conferidos antes do
  manifesto nativo. Não gravar corpo bruto no cursor/recibo.
- Preparação v7 fixa começo do histórico e totais cumulativos. Enquanto pendente,
  cursor principal permanece no item; último passo confirma manifesto e avanço.
  work-history fecha com relatório validado e termina em draft.
- Manifestos workVersions schema1 e corpos workVersionBodies compatíveis com os
  leitores atuais; resourceKey novo, deleting false. Datas/razão/rótulo preservados;
  wordCount histórico é metadado do snapshot, não ledger do manuscrito.
- Inventário v10 antes dos primeiros recursos. Certificar namespaces vazios,
  journal/corpo/cursor/recibo atômicos; cleanup mascarado e limitado certifica
  ambas as coleções vazias. Proteger nascimentos/versões nativos e manter v1–v9.
- Replays, CAS, rollback/retry/cancelamento e retomada não duplicam versões.
  Não recriar capítulo/cena removido nem importar recibos/grants da origem.

## Tarefas e aceites

1. [x] Capacidade raw limitada e retomável com prova de origem.
2. [x] Inventário v10/progresso v7 e compatibilidade dos jobs/recibos anteriores.
3. [x] Escritor de histórico, hash incremental, manifesto e fechamento da seção.
4. [x] Testes Node/SDK, revisão, ADR/documentação/evidência e commit local.

## Limites e pendências

Raiz ausente/countReady false, sem API pública/Rule/coleção global ou crédito novo.
Label/campos grandes que excedam documento nativo devem falhar intactos;
representação integral desses campos continua obrigatória antes da ativação,
sem redefinir suporte P1 para somente o que cabe nativamente.
A política do rascunho será aplicada na próxima etapa: manuscrito salvo preservado
e rascunho diferente como versão separada, inclusive vazio/recurso removido.
Faltam rascunho/capa, integração de personas, campos grandes/consumidores,
certificação/ativação final e host/UI/roundtrip/validate.
P1/F2-09 e Writer V2 seguem abertos. Validate integral no fechamento P1.
Sem subagentes, CI/push/PR/deploy.

## Resultado local

18 cenários de histórico integram 284 testes Node dirigidos positivos.
Dois SDK reais confirmam privacidade, rollback/retomada, leitor com raiz sintética
e cleanup v10 protegido por nascimento nativo. A certificação integral e a
ativação P1 não estão concluídas.
[Evidência M33](../../../entregas/2026-10-22-writer-v2-historico-na-preparacao.md)
e [ADR 0077](../../../decisions/0077-restored-history-stream.md) registram resultados,
regra e limites. Somente commit local, CI ignorada e P1/F2-09 abertos.
