# Incremento 16 — Prova nativa de publicação na passagem

## Estado

Em implementação; testes escritos e não executados. Este incremento não fecha a
política obrigatória de publicação predecessora, E1/E4 ou o objetivo integral.
A rodada anterior foi progresso: incorporou a principal, verificou o incremento 15
e documentou a reprovação conhecida da cobertura global.

## Protocolo acrescentado

Uma passagem explicitamente selecionada pode incluir publicationId. O servidor
confere a edição confirmada que contém a versão atual do capítulo anterior, além
das provas já exigidas de revisão preservada e integração de ato. A origem é lida
pelo servidor; campos client entered, permissões ou certificados não são admitidos.

A prova exige job publicado do nascimento atual do livro, confirmação canônica,
hashes de manifesto/guia/remoções, cabeçalho da edição e identidade/revisão atuais
do capítulo incluído. Fixa os nascimentos do registro de manifesto e da projeção pública,
impedindo reaproveitar uma recriação com os mesmos bytes. Confere também o hash da projeção física do capítulo. A prova
salva contém apenas IDs, identidades e hashes; não contém prosa.

Na entrada, exige ponteiro público atual, privacidade e origens autorizadas de lore/
universo e revisão de cenas. Preparação, verificação e status published isolados não
comprovam publicação. Não escreve, gera ou debita.

Após passageEntered, a passagem usa o certificado já conferido: alterações na próxima
unidade podem modificar a disponibilidade global da edição sem revogar a entrada
anterior. Continua reconferindo edição, confirmação e versão nativa do capítulo.
Recriações alteram os nascimentos e invalidam a comparação com a prova salva.

Não há novas coleções, callable, Rules ou dependências. O certificado fica no registro
privado de passagem existente e segue sua exclusão. O campo ausente conserva a forma
anterior; a interface ainda não oferece seleção de edição.

## Próximos passos obrigatórios

- Conferir predecessora imediata por inventário nativo paginado, incluindo atos vazios,
  capítulos sem ato, alterações de ordem e a prova de primeira unidade.
- Vincular política obrigatória e ingresso na unidade à inspeção completa, sem depender
  da seleção de um ciclo anterior pelo cliente nem de book.status/recibo histórico.
- Conferir o ato inteiro por unidades antes de permitir sua fronteira; a prova de um
  capítulo não certifica todos os capítulos do ato.
- Disponibilizar seleção/explicação na interface e cobertura de recuperação/latch.
- Executar testes e gates no fechamento antes da integração. Não há nova evidência
  executada que valide estes arquivos. Os resultados do incremento 15 são anteriores.

## Testes preparados

Acrescentados casos ao teste de publicação existente: edição apenas preparada é
recusada; edição confirmada produz prova sem escrita; retirada impede novo ingresso,
mas conserva ingresso já passado; projeção pública ou manuscrito alterado impedem
reutilização mesmo depois da entrada; recriação da projeção com bytes idênticos altera
a prova nativa. Usam as factories reais de compilação, guia e
confirmação com o double transacional existente; não substituem Rules ou produção.
