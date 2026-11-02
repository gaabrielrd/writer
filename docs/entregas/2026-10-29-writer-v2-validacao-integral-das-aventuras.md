# Writer V2 — validação integral das aventuras e exclusão

- Data: 2026-10-29.
- Branch: codex/writer-v2; código-base 38c6673, sem mudança de produção neste fechamento.
- Planos: [198](../tasks/writer-v2/execucao/198-ciclo-normal-das-aventuras-restauradas.md) e [199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md).
- Matriz: [consumidores](../tasks/writer-v2/consumidores-aventuras-restauradas.md).

## Resultado

O corpus restaurado rico agora termina com a exclusão completa da primeira cópia.
Usa o mesmo produtor TypeScript, servidor de restauração e consumidores normais
do plano 198. Original, segunda cópia, aventura irmã, campanha capturada, notas,
imagens independentes, personas e recibos permanecem. Contexto/resposta e leitura
da base derivada ficam indisponíveis; pergunta própria continua legível.

O corpus vazio usa criação normal do Estúdio e o mesmo pipeline de captura/
restauração. Injeta perda do ACK após o commit terminal e repete a operação exata,
sem recontar ou recriar raiz. O avanço passa pelas fases limitadas, com reserva/
job/recibo terminais ligados pelos mesmos relógios nativos simulados.

## Critérios técnicos conferidos

- [x] Usar a cópia depois da coleta e preservar uma segunda captura/restauração.
- [x] Preencher e remover raiz/partes/cenas/blocos/narrativa/lore/checklist/histórico.
- [x] Retirar usos próprios das duas imagens restauradas, preservando bytes,
      gerações, contadores corretos e usos da aventura irmã/campanha.
- [x] Preservar perfis não vazios de persona, job/recibos da restauração e pergunta.
- [x] Retirar atividade própria, mantendo accessedAt e retomada da irmã.
- [x] Capturar campanha real antes de excluir; negar a base depois e ler notas próprias.
- [x] Consultar/listar/recuperar recibos após raiz ausente e mascarar outra conta.
- [x] Recusar recriação/autoria/captura e impedir efeitos por ativação histórica.
- [x] Validate integral local verde, sem reduzir cobertura.
- [ ] Decisão final do operador sobre perguntas do chat; preservação atual comprovada.
- [ ] Auditoria final P2, portabilidade P3, demonstração D e gates humanos/comerciais.

## Testes e validações reais

| Verificação                                                             | Resultado                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| Dois ciclos alterados, filtro ordinary capture/genuinely empty          | 2/2 positivos; 3 não selecionados; 7,80 s                      |
| Frontend integral                                                       | 4.890/4.890 testes, 367 arquivos, 478,70 s                     |
| Scripts integrais                                                       | 94/94, 21.568,7721 ms                                          |
| Functions integrais                                                     | 3.989/3.989, 465.554,0271 ms                                   |
| Cobertura global                                                        | 89,67% instruções; 85,86% ramos; 90,88% funções; 92,84% linhas |
| Sintaxe Functions                                                       | 407 módulos                                                    |
| Tipos, bundle e smoke                                                   | Positivos; bundle em 2,52 s                                    |
| Skills, arquitetura, documentação, styleguide, formato e lint completos | Positivos no npm run validate                                  |

npm run validate encerrou com código 0. O corpus completo de cinco jornadas
faz parte dos 4.890 frontend; não somar a ele as rodadas dirigidas.
O helper adicional é suporte de teste, não novos casos contados separadamente.

Antes do validate, npm ci --prefix functions --offline --no-audit --no-fund
instalou 252 pacotes pelo cache em sete segundos. Node local 24.21.0; npm
registrou a expectativa Node 22 das Functions e avisos de dependências existentes.
Nenhum lockfile ou dependência foi atualizado. Build mantém avisos conhecidos de
chunks/imports estáticos e dinâmicos ineficazes, sem erro de bundle/smoke.

A primeira rodada dirigida teve quatro casos positivos e falha de montagem do
novo roteiro: a captura de campanha exige universeId explicitamente null.
A inspeção seguinte confirmou que a restauração cria duas cópias de imagem
independentes por recurso; o teste passou a conferir ambas, em vez de presumir
dois usos no mesmo ID. A comparação de bytes foi normalizada para Buffer em
ambos os snapshots, pois structuredClone muda esse tipo para Uint8Array.
Nenhuma dessas correções alterou o produto, reduziu uma exigência ou virou passe
retroativo. Foram mantidas as provas de ambos os arquivos e todos os usos.

## Arquivos e revisão

- adventureRestoredConsumers.test.mjs: acrescenta exclusão aos ciclos rico/vazio.
- adventureRestoredDeletionFixture.mjs: cria irmãos/conversa/campanha com serviços
  reais e confere limpeza, preservação, recibos, autorização e perda do ACK.
- adventureRoundtripFixture.mjs: expõe o pedido de ativação já executado para
  provar replay histórico sem reconstrução.
- Plano, matriz, progresso, README e documentação de testes: estado atual,
  fechamento integral e pendências separados das evidências históricas.

Revisão conferiu famílias preenchidas antes da limpeza, ausência de todos os
descendentes depois, comparações não vazias de persona/imagem/campanha, bytes e
contadores independentes, pergunta/notas por seus leitores normais e imutabilidade
dos dados preservados. Reserva terminal/recibo não são autorização atual.
Sem alteração de produção, Rules, formato de arquivo ou regra global nova.

## Limites e próximos passos

Serviços de produção são reais sobre portas/banco/Storage de teste e dados
sintéticos. Gerador de chat é local, sem IA remota ou cobrança. Relógios nativos
são simulados; não é prova de Firestore/Storage, índices, credenciais ou App Check
positivo em produção. Nenhum projeto real ou arquivo do operador foi excluído.

Não houve nova rodada de browser/Rules neste fechamento de testes. As 36 jornadas
de integração de 38c6673 e os SDK/Rules anteriores ficam nas respectivas evidências;
o validate inclui testes SDK existentes, sem certificação de produção.
Documentação final recebe check dirigido após sua atualização, sem repetir a
suíte integral por mudanças somente documentais.

Artefatos fora do Git em writer-v2-portability-qa: m122-final-cycle.log,
m122-rich-cycle.log e retestes/inspeção, m122-functions-ci.log, m122-validate.log
e m122-state.md. O Vite manual 5173 é preservado.

Plano 199 aguarda confirmação da política de perguntas. Auditar os requisitos
integrais de P2 no plano 147 antes de iniciar P3; P3/D/F2-09 e macro 8/35
permanecem abertos. Gates humanos/comerciais não foram aprovados.
Somente commit local, sem CI, push/PR, merge ou deploy.
