# P1 / M32 — Universo original e plano transacional de vínculo

## Objetivo e contrato

Preparar a origem de universo e o plano de religação sem duplicar universo/lore.
A ativação integral do livro ainda não existe; este incremento fornece seu
contrato de vínculo e avança a preparação para histórico.

- Consumir book-universe pelo leitor M21, com verify(tx), sem caminhos do cliente.
- Preservar descriptor fechado none/unavailable/reference. Para reference,
  conferir nascimento nativo exato, authorId próprio e não deleting. A regra
  vigente de vínculo não inclui universos públicos de outro autor nem novos papéis.
- Leitura de disponibilidade somente com máscara authorId/deleting. Não copiar
  nome, descrição, lore, grants, hashes privados ou metadados de origem alheia.
- None não lê universo. Unavailable não consulta/promove o ID, mesmo se reaparecer
  sob o mesmo dono. Ausente/estrangeiro/deleting/recriado resultam igualmente
  indisponíveis para uma referência, sem revelar o estado da origem.
- Preparação v6 registra índice do item, origem e observação, sem gravar no
  universo nem criar raiz/vínculo/contador. Observação não é autorização.
- Preservar inventário v9: nenhum novo recurso/coleção. Admitir progresso v5/v6
  com o mesmo inventário e receipts antigos. Encerrar em history sem consumir item.
- Helper interno para a futura ativação exige item verificado da mesma cópia e
  descriptor igual ao preparado; reautoriza agora a mesma encarnação. Se acessível,
  compõe prepareUniverseProjectLink estrito com commit separado. Se indisponível,
  devolve universeId null, sem inventar universo nem alterar contador.
- Plano final de vínculo e raiz devem ser confirmados na mesma transação futura.
  Contador/uso inconsistente falha inteiro; não tratar inconsistência como simples
  ausência. Nenhuma autorização é derivada do arquivo ou da observação antiga.
- Raiz ausente/countReady false e nenhum vínculo durante preparação/cancelamento.

## Tarefas e aceites

1. [x] Probe de identidade/acesso e plano de vínculo estrito reutilizável.
2. [x] Escritor interno, progresso v6 e compatibilidade do inventário v9.
3. [x] Testes Node/SDK de disponibilidade, ABA, revogação e composição atômica.
4. [x] Revisão, documentação/evidência e commit local.

## Limites e riscos

A autorização pode mudar após preparar: o helper final sempre relê a origem.
Reference conserva apenas a identidade esperada do arquivo. Unavailable não vira
referência por consulta atual. Perfis privados e contagens anteriores permanecem.

Harnesse de ativação sintética prova somente composição transacional do vínculo,
não a restauração final. Faltam integração das personas, histórico/rascunho/capa,
campos grandes, autorização/certificação final, ativação, host/UI e roundtrip/validate.
Sem API pública/Rule/coleção/dependência/crédito, CI/push/PR/deploy ou subagentes.

## Resultado local

20 cenários novos de universo integram os 233 testes Node dirigidos positivos.
Dois SDK reais confirmam privacidade, rollback/commit nativo de vínculo estrito,
ABA e cleanup sem alterar a origem. A raiz sintética não é ativação P1.
[Evidência M32](../../../entregas/2026-10-22-writer-v2-universo-na-restauracao.md)
e [ADR 0076](../../../decisions/0076-restored-universe-link.md) registram resultados
reais, regra e limites. P1/F2-09 continuam abertos; CI ignorada e somente commit local.
