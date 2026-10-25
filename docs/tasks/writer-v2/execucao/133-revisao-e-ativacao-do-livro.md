# P1 — revisão e ativação atômica do livro restaurado

## Objetivo

Após [132](132-inventario-final-da-restauracao.md), tornar a preparação uma nova
cópia privada utilizável, com revisão explícita e recuperação da confirmação.
Não confundir inventário pronto com livro ativado ou fechamento de P1.

## Descoberta e decisões existentes

Grafo writer-v2 consultado antes da descoberta; funções MJS atuais não retornam
resultados. Conferidos Upload/jobShape, Universe/prepareUniverseProjectLink,
lote de personas, DraftFinalize, Storage e imageLibrary no checkout atual.

A origem de universo deve ser a mesma atualmente autorizada, sem cópia global.
Se mudar após revisão, invalidar a confirmação anterior. Texto salvo continua
no manuscrito; rascunho diferente vira versão. Capa staged tem accepted false
e prova generation/metageneration; auditoria metadata não verifica Storage atual.
Load atual proíbe raiz presente, e jobShape ainda não admite activated.

## Sequência antes da implementação

1. Revisão interna somente leitura, após schema13/activation-ready/audit done.
   Conferir selo/recibo original, controles, lote preparando, definições nativas,
   itens autenticados de metadata/universo/capa e observação atual do universo.
   Verificar Storage fora da transação, depois reler/reautorizar a mesma
   preparação. Retornar resumo limitado e reviewToken, sem prosa, URLs globais,
   caminhos, chaves ou efeitos. Token fixa origem/checkpoint/provas/decisões e
   não é grant; não aceitar no input opções arbitrárias de raiz ou vínculo.
2. Ativação interna por CAS/operationId/reviewToken. Revalidar a mesma revisão,
   Storage e universo. Criar raiz privada e seus clocks/capacidades, tornar
   countReady true, ativar lote de personas, gravar vínculo/contador de universo
   e registro/uso da imagem na mesma transação. Não copiar status público,
   direitos, compras, permissões ou referências indisponíveis como lore local.
3. Novo estado terminal activated e recibo original; consulta/replay após
   ativação ou exclusão normal do livro não concedem acesso. Cancel/cleanup
   nunca apagam livro ativo. Revalidar destino original/nascimento na confirmação.
   Encerrar arquivos privados de upload por protocolo próprio, preservando
   provas necessárias aos perfis, reservas e fences permanentes.
4. Finalização recuperável da mídia com precondições nativas e regras atuais:
   nenhuma janela de exposição antes da autorização. Não tratar uma operação
   Storage e uma transação Firestore como atomicidade distribuída.
5. Host/transportes explícitos, revisão/retomada protegidas, UI final e roundtrip
   integral (estrutura/textos/lore/histórico/personas/capa/rascunho). Inventários
   gerais/writers/exclusão/legados, rollout coordenado e validate de P1 continuam.

## Aceites da revisão (passo 1)

- [x] Somente preparação final original pode ser revisada, sem writes.
- [x] Resumo limitado sem conteúdo global/chaves/caminhos ou efeitos.
- [x] Token incorpora identidade nativa e decisões atuais; mudanças invalidam.
- [x] Storage atual conferido e preparação revalidada após await externo.
- [x] Conta/fase/token/checkpoint, perda/recriação de dependências e cancelamento
      concorrente falham sem fallback ou ativação.
- [x] Node/SDK/checks dirigidos e documentação/commit local.
- [ ] Passos 2–5 implementados e validados, sem chamar o passo 1 de ativação.

Não usar CI, push, PR, merge, deploy ou subagentes. Testes dirigidos após ajustes;
validate global no fechamento do grande bloco P1.

## Estado do passo 1

Vinte Node distintos e três regressões positivos em seleções dirigidas, um SDK
real positivo; formato/lint/arquitetura/docs/diff verificados. Consulte a
[evidência](../../../entregas/2026-10-25-writer-v2-revisao-da-ativacao-de-livros.md)
para falhas corrigidas, durações e limites. A revisão não altera a preparação,
não publica imagem ou ativa a raiz. Passos 2–5 continuam obrigatórios.

## Contrato do núcleo de ativação antes da implementação

activateBookRestore é interno. Entrada fechada: restoreId/jobToken/operationId/
expectedCheckpoint/reviewToken. Resolver recibo antes de repetir efeitos.
Reabrir itens autenticados, comparar revisão, verificar Storage fora da transação
e reconferir o mesmo token na transação final. Vínculo usa contrato estrito atual.

Criar raiz privada com identidade nova, título e dados próprios literais, clocks
iniciais e barreiras nativas de cenas/narrativa/progresso/lore. Preservar persona
declarada remapeada; vínculo existente exige perfil preparado original. Não
inventar perfil ausente. countReady passa a true sem recontar/alterar textos.
Ativar lote de personas no mesmo commit, com recibo de ativação como última prova.
Remover deletedBooks somente nessa transação; reserva permanente continua.

Job activated guarda descritor fechado da operação/revisão/checkpoint/origem.
Confirmação exige recibo imutável e updateTime original do job no mesmo commit,
reserva imutável do nascimento original e fingerprint recomputado. Job terminal
não é regravado pelos próximos protocolos. Consulta/replay histórico não lê raiz
nem retorna conteúdo; continua possível após edição/exclusão normal do livro.
Cancelamento, preparação e limpeza anteriores recusam novos efeitos em activated.
Chave de recuperação do upload é removida no commit, sem apagar provas/arquivos
necessários antes da limpeza pós-ativação própria.

Capa library: criar registro preparando, url null, caminho/prova nativos e uso
bookId com useCount 1 no commit. Recusar registro/uso estrangeiro, inclusive uso
órfão. Enquanto preparando não é selecionável nem aceita no Storage; accepted
continua false e sem download token. A conclusão de mídia do passo 4 deve
publicar com precondições e, após reautorização, preencher registro/URL do livro.
O núcleo não declara mídia pronta ou restauração integral antes desse passo.
Sem capa/legacy-unavailable cria livro sem URL; procedência continua no job.

Rules preservam restoreOrigin e recusam sua forja pelo cliente. Testar transação/
retry/rollback/replay/resposta perdida, CAS/revisão/origens/Storage mudados,
contadores/lote/capa/uso, livro privado, consumidores normais reais, histórico
após exclusão e impossibilidade de cancel/cleanup apagar destino ativo.
SDK dirigido deve provar a mesma transação nativa e a barreira de acesso.

## Estado do núcleo de ativação

- [x] Criação atômica da raiz/controle/lote/universo/capa e uso com revisão/CAS.
- [x] Descritor/recibo/job/reserva originais e consulta histórica após exclusão.
- [x] Cancelamento/limpeza anteriores recusados após ativação; origem protegida.
- [x] 55 Node distintos, dois SDK e checks dirigidos; evidência e commit locais.
- [ ] Finalização da mídia: capa permanece preparando e accepted false.
- [ ] Limpeza pós-ativação com progresso próprio, sem apagar provas necessárias.
- [ ] Host/UI/roundtrip integral e demais inventários/legados/rollout/validate.

[Evidência do núcleo](../../../entregas/2026-10-25-writer-v2-ativacao-atomica-de-livros.md).
Passos 2–3 têm núcleo implementado; cleanup próprio do passo 3 e passos 4–5
continuam obrigatórios. Isso não fecha P1/D3/F2-09/V2 ou fases/gates posteriores.
