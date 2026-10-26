# Writer V2 — finalização durável da restauração no cliente

## Resultado parcial

Sessão de cliente apresenta revisão privada e só ativa por confirmação explícita.
Ativação, mídia, limpeza e cancelamento salvam intenção metadata antes do RPC.
Recarga reenvia o pedido original; perda de resposta após chave revogada não
duplica livro nem reconstrói raiz excluída. Histórico não é acesso atual.

[ADR 0161](../decisions/0161-durable-book-restore-terminal-operations.md)
e [plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md).

## Testes dirigidos

44 Vitest distintos positivos em seleções: oito contratos operacionais, cinco
projeções finais contra fixtures reais, 13 cenários de sessão, 11 adaptadores
callable e sete regressões de bootstrap após extrair kernel metadata.
Não houve rodada única global de 44.

Primeira seleção de sessão: 11/12, 5.86 s. Falha revelou duas incompatibilidades:
recibo moderno de cancelamento rejeitado no servidor e limit obrigatório ausente
no cliente. Corrigidos sem contornar hooks/limites. Seleção afetada: 7/7,
1.90 s, 13 não selecionados; inclui cancelamento e contratos/fingerprint.
Novos adaptadores e snapshot da revisão: 12/12, 2.17 s, 12 não selecionados.
Contratos/projeções iniciais: 13/13, 5.06 s. Bootstrap extraído: 7/7, 494 ms.

Quatro regressões Node de cancelamento/cleanup/versões inválidas: 4/4,
335.3243 ms, sem skips. Recibo histórico agora reconhece cover-storage e
persona-library somente em cleanupVersion compatível. Pedido de cleanup fixa
limit 16, preservado no fingerprint da retomada.

Sessão cobre ativação explícita, replay após excluir raiz, resolução original,
revisão obsoleta sem troca automática, avanço comprovado de checkpoint, perda
de respostas de mídia/archive/cancelamento/cleanup, conclusão por outra aba,
revisão de archive avançada, conta invalidada, CAS concorrente e recibo inválido.
Snapshot da revisão precede a primeira espera de storage.

## Chromium nativo

14 cenários positivos: sete regressões de bootstrap após extração do kernel,
seis de store operacional e um fluxo completo. Store prova CAS, reinício,
mesmo stamp com reviewToken diferente, registro malformado preservado, páginas
isoladas por conta e corrida entre abas com uma única criação.

Fluxo completo: arquivo atual de 15408 bytes, inspeção, perda da resposta de
start e reinício, perda da resposta de append e reinício, 194 unidades de
preparação até revisão com raiz ausente. Ativação explícita perde resposta após
commit/revogação de chave; terceiro reinício recupera intenção exata e confirma.
220 unidades terminais concluem mídia/limpeza; raiz ativa preservada e controles
locais vazios. Nenhum pedido de chave após ativação.

1284 RPC e 389 HTTP de chave neste fixture local; não medem custo/latência de
produção. OPFS/IndexedDB/Web Locks/WebCrypto são nativos. Serviços e handler HTTP
reais usam banco em memória com updates nativos; verificação de identidade/SDK
callable simulados em perfil isolado. Não comprova infraestrutura de produção.

Artefatos QA externos: m48-bootstrap-browser, m50-effects-browser e
m50-file-to-complete-browser. O campo rootAbsent do runner completo descreve a
barreira anterior à ativação; activeRootPreserved comprova o estado final.

## Checks e pendências

Typecheck do projeto passou por npm run typecheck; tsc --noEmit isolado não
substitui o build de referências. Lint dirigido, formato, arquitetura, docs e
diff passaram no fechamento. Revisão conferiu codecs/CAS, captura anterior às
esperas, pedidos originais e separação entre histórico e disponibilidade.

Interface do Estúdio, roundtrip integral atual/legado com consumidores normais,
inventários/writers/exclusão/rollout e validate global de P1 continuam pendentes.
Modo indexado padrão false. Fases 3–5 e gates humanos/comerciais continuam.
Sem nova dependência, CI, push, PR, merge, deploy ou subagentes; commits locais.
