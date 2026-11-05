# Análise paralela da importação de lore de universos

## Resultado local

A análise fazia uma chamada de IA por trecho, aguardando a anterior, e
regravava todas as sugestões acumuladas a cada etapa. Agora a callable analisa
até três trechos simultaneamente e consolida na ordem original do documento.
Somente sugestões alteradas são gravadas. A interface usa o cursor retornado
pelo servidor e informa quantos trechos foram concluídos.

O limite é de três análises por chamada, sem disparar o documento inteiro.
Se uma análise falhar, o lote aguarda as demais e não grava sugestões parciais
nem avança o cursor. O retry retoma o mesmo cursor. Cancelamento, expiração,
propriedade e versão do universo continuam conferidos antes do commit.
Revisão explícita, confirmação, débito e recibos continuam no protocolo existente.

## Validação

- Backend: 12 testes aprovados, incluindo três análises em voo, conclusão fora
  de ordem, lote final menor, consolidação, falha sem progresso parcial, retry,
  cancelamento tardio, revogação durante IA e ausência de regravação de sugestões
  intactas.
- Frontend: oito testes aprovados no diálogo e upload, incluindo progressão
  0 → 3 → 5 sem aplicação automática.
- ESLint dos arquivos alterados aprovado.
- Typecheck, arquitetura, documentação, formatação e `git diff --check` aprovados.

## Limites e publicação

Alteração local, sem commit, push ou deploy. Para o ganho estar disponível em
produção, é necessário publicar a Function do setor de importação; a mensagem
de progresso depende do frontend. Nenhum provedor pago foi acionado e não há
medição do tempo real em produção. Extração e upload continuam ordenados.
`npm run validate` não foi executado: não houve commit/merge. Mudanças
concorrentes e anteriores no checkout foram preservadas.
