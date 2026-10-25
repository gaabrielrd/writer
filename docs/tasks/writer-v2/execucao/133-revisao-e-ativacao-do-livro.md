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
