# P2 — chave privada da restauração de aventuras

Base: 2942b47. Usar plan-feature/implement-feature; sem subagentes, CI, push ou deploy.

## Descoberta e objetivo

Os 29 callables já compõem o pipeline. A retomada cifrada ainda não tem chave.
O contrato de livros cria chave sob demanda e muda o job; aventuras precisam
preservar o job congelado após ativação e a prova nativa de nascimento.
Implementar chave de 32 bytes criada atomicamente no início, em coleção privada
por UID/restoreId, provada por efeito do recibo inicial e createTime imutável.
Nenhum segredo entra em job, progresso, recibo público, logs ou callable.

## Requisitos e compatibilidade

- Chave AES-GCM com identificador aleatório próprio, revisão, origem e aventura
  vinculadas ao início; retry devolve a mesma chave, nunca gera outra.
- Operações legadas sem efeito de chave continuam no pipeline; não criar chave
  tardia. Documento estranho, ausente após nascimento, alterado/recriado ou de
  outra origem impede recuperação e remoção. Nunca substituir chave perdida.
- Consulta HTTP POST text/plain;charset=utf-8 com JSON fechado: restoreId,
  jobToken, reviewHash e expectedKeyId opcional. Validar UID/App Check antes
  do corpo; limite 8192 bytes e UTF-8 estrito. Auth/App Check sem bypass.
- Resposta private, no-store; Vary Authorization; erros sanitizados. Export
  HTTPS próprio, fora da lista de 29 callables, mesmos recursos e cors false.
- Cancelamento remove chave na transação que inicia cancelling; replay histórico
  não a recria. Coleta após mídia concluída remove chave na primeira unidade,
  junto do controle da coleta. Recuperação recusa estados cancelling/cancelled
  e coleta iniciada. Nenhuma alteração do job ativado ou recurso autoral.
- Limpeza final de cancelamento e coleta exigem ausência da chave canônica.
  Não ler chave como prova de consumo de texto nem apagar cópia cifrada local.

## Sequência e verificação

1. Módulo próprio de nascimento/leitura/remoção e composição no Transfer,
   start/cancel e primeira unidade Archive, com efeitos fechados no Store.
2. Handler HTTP e export explícito; atualizar inventário Host sem abrir dispatch.
3. Testes dirigidos: estabilidade/retry, identidade/revisão/chave esperada,
   adulteração/ABA/legado, ausência de vazamento, cancelamento/coleta e replay.
   HTTP real para Auth/App Check/corpo/headers e SDK demo pertinente.
4. Revisar; ADR/docs/AGENTS/evidência; commit local com hooks normais.
   Validate integral no fim do próximo grande bloco; não atribuir a este código
   o validate anterior (186–188).

## Aceites

- [x] Nascimento atômico e prova nativa; sem criação tardia ou exposição comum.
- [x] HTTP autenticado/privado com corpo fechado e falhas sem segredos.
- [x] Cancelamento e coleta encerram chave sem alterar manuscrito/job ativado.
- [x] Testes dirigidos, revisão, documentação/evidência e commit local.

Não escopo: journal/controlador/UI, backup local cifrado e roundtrip do cliente,
campanhas P3, comércio, publicação, dependência/Rules/índice novo, deploy.
P2/P3/D/F2-09 e macro 8/35 permanecem abertos.

## Ajustes da revisão

O efeito inicial fixa metadados e fingerprint SHA-256 dos bytes. Recuperação
confere também o segredo; cancelamento/coleta leem apenas metadados mascarados,
cuja imutabilidade/nascimento impedem adoção de documento alterado/recriado.
Port sem getAll falha sem leitura integral. Cancelamento já em curso conserva
o contrato anterior: outro pedido no checkpoint atual confirma ausência da
chave e não a recria. A primeira prova de SDK foi positiva; repetir após esta
mudança de contrato, registrando resultados separadamente.

## Resultado

Seleção final 271 Node e SDK final 1/1 positivos, sintaxe de 391 módulos,
arquitetura/lint e checks documentais dirigidos; evidência registra os números
e a correção da expectativa do Host. O SDK foi repetido após a mudança de
provas mascaradas; não confundir a primeira rodada com a versão final.
Veja a [evidência](../../../entregas/2026-10-28-writer-v2-chave-privada-da-restauracao-de-aventuras.md).
Somente commit local; validate integral no próximo grande bloco.
