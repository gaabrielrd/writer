# Writer V2 — verificação terminal da exclusão de aventuras

## Estado e funcionalidades

Incremento interno do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 1d7a6b6. A [ADR 0227](../decisions/0227-adventure-deletion-terminal-verification.md)
registra o contrato. Não entrega ainda o fluxo público de exclusão.

- Segunda passagem limitada por metadata do chat, sem hidratação de respostas.
- Consultas finais atuais de autoria, usos, fontes/mídia/chaves, chat e atividade.
- Reabertura da fase responsável quando conteúdo próprio conhecido reaparece,
  descartando certificados posteriores.
- Remoção da raiz/reserva terminal/job/recibo no mesmo commit, com contagem única.
- Leitor terminal confere ausência da raiz e relógio nativo de reserva/job/recibo.
- Retry e reinício do serviço conservam identidade e não repetem efeitos.
- Perguntas legíveis e imagens, jobs de restauração e outros projetos preservados.
- Três índices locais adicionais, sem implantação ou mudança do layout v1.

## Testes e resultados reais

| Rodada                                   | Resultado                  |
| ---------------------------------------- | -------------------------- |
| Domínio de exclusão afetado, final       | 123/123 Node, 17201,636 ms |
| SDK/Rules de chat e verificação terminal | 6/6, 85229,3236 ms         |

Os 123 são 17 de início, 11 de inventário, 18 de fontes, 22 de limpeza,
25 de controles, dez de quiescência e 20 terminais. As rodadas anteriores
se sobrepõem; não somar como cenários adicionais. Há três cenários SDK novos e
três anteriores de chat. Serviços reais e Admin SDK executaram contra emulador
Firestore demo local, com dados sintéticos e Rules carregadas.

Os cenários novos cobrem raiz ausente, pergunta após remoção integral da raiz,
reabertura de autoria/usos/atividade, chave reaparecida, rollback nos quatro
pontos da transação final, ACK perdido e identidades recriadas. O SDK confere
pedidos concorrentes convergentes, clocks conjuntos, retomada após reinício,
13 corpos de outro livro preservados e recusa de corpo refeito após a varredura.

A primeira rodada terminal Node teve duas falhas: fixture de atividade enviava
recurso inválido e depois tentou registrar acesso após a reserva (corretamente
bloqueado pelo guard); foi movida para antes do início com recurso project.
O outro caso revelou ciclo entre verificação e limpeza quando corpo e controle
discordavam de escopo. O processador agora recusa a contradição por metadata,
sem apagar dados; recebeu teste específico também para corpo de turno.
As rodadas finais passaram, mantendo os guards e limites.

A restauração real pelos serviços sobre o double também percorreu o fechamento
com preservação do job congelado e da cópia ativa da biblioteca. Os novos SDK
terminais usam aventuras criadas no Estúdio; roundtrip amplo de restauração e
validação de interface continuam no fechamento integrado.

Logs fora do Git: m118-integration.log, m118-verify.log, m118-verify-fixed.log,
m118-verify-final.log, m118-final-node.log e m118-sdk.log.
Sintaxe dos 406 módulos Functions, ESLint dos nove arquivos de código/teste,
arquitetura, documentação e sincronização das 11 skills passaram. Formato do
conjunto alterado e diff conferidos. Revisão final sem bloqueador para o motor
interno; nenhum export de index, Rules, dependência ou interface foi alterado.
Processos de teste e emulador próprios encerrados; Vite preservado.

## Pendências e limites

O motor interno alcança complete e remove a raiz. Não existe export público novo,
transporte Auth/App Check, cliente, interface ou recuperação de exclusão no
navegador. Política final de perguntas próprias ainda pendente; nenhuma apagada.
Os SDK não provam implantação de índices, endpoints publicados ou dados reais.

Não houve novo teste frontend/build/browser nem validate integral. O validate
completo continua previsto no fechamento do bloco 198–199, conforme orientação.
Não fecha plano 199/P2/P3/D/F2-09/V2; macro 8/35 e gates humanos/comerciais
inalterados. Somente commit local; sem CI, push, PR, merge ou deploy.
