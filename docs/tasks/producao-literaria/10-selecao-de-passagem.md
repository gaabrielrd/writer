# Seleção de condições de passagem na preparação do capítulo

Incremento de E4 na worktree literária sobre b9fc03c, após incorporar a principal.
Conecta à interface as [condições nativas](09-condicoes-de-passagem.md). O plano
integral permanece ativo; não encerra E4 nem amplia a autorização para outras unidades.

## Comportamento disponível

Em Ciclo editorial do capítulo, Entrada neste capítulo permite manter um ciclo
independente ou continuar após um capítulo revisado. A segunda opção consulta ciclos do
mesmo livro por páginas. Escolha o ciclo anterior pelo título atual e pela data. Ao sair
de um ato, consulte e escolha uma integração aceita daquele ato. Páginas sem opções
válidas mantêm o botão de próxima página; ausência na página não significa ausência no
livro inteiro. Consultas têm estados carregando, erro recuperável, vazio e sucesso.

A prévia mostra a condição selecionada. Registrar fica indisponível enquanto a seleção
estiver incompleta. O servidor reconfere ator, origens, ordem, revisão e integração;
as opções da lista são metadata para escolha, não certificados de prontidão. Um rótulo
done pode ter se tornado obsoleto desde a última execução e não dispensa o preflight.

O preflight e o registro recebem a mesma seleção. Se a resposta do registro se perder,
a recuperação reutiliza o input e o token originais; não recaptura fontes, não troca
predecessor e não inicia execução. Após registrar, o checkpoint mostra a condição
congelada e se a entrada já foi conferida. Preparar um novo ciclo limpa essa escolha;
não há herança silenciosa de autorização.

## Contratos e privacidade

listLiteraryWorkflows aceita chapterId null para descoberta privada no livro; o filtro
por capítulo existente é preservado. Cada página é limitada e seleciona apenas campos
metadata. O servidor confere dono atual, ator do ciclo e nascimentos de livro/capítulo,
obtém título e agrupamento nativos e marca contrato/instância/agrupamento obsoletos como
stale. Registros filtrados não interrompem o cursor. Instrução, prosa e propostas não
saem por essa listagem. Não há varredura global nem leitura de corpos dos capítulos.

LiteraryWorkflowPassageFields usa os componentes compartilhados e mantém escolhas só
em memória. WorkflowSession isola conta/livro/capítulo; respostas tardias da consulta
antiga não preenchem a seleção nova. O journal continua metadata-only com hash do pedido,
sem persistir o wire das condições nem a orientação. As mutações usam os mesmos setores,
coleções e ações existentes:422; nenhuma dependência ou índice novo.

## Verificação

- 387 testes backend, incluindo37 do ciclo e da descoberta privada.
- 109 testes frontend em19 arquivos, incluindo12 do painel.
- Roundtrip do cliente real através do roteamento servidor: dois capítulos concluídos,
  resposta perdida após aplicação e após registro da passagem, sem débito duplicado.
- 12 casos Chromium nos três temas e desktop/móvel320; rodada complementar de6 casos
  captura também a seleção antes do registro. Teclado, títulos longos e ausência de
  overflow conferidos. Capturas desktop claro e móvel sépia inspecionadas.
- Build/tipos/smoke e lint dirigidos aprovados. Logs e limites da evidência no
  [relatório de validação](validacao-local-2026-11-02.md).

O navegador usa fixtures locais, sem IA/créditos de produção. Roundtrip usa o núcleo
real e o double transacional; não equivale a teste autenticado em produção. Sem nova
rodada de Rules ou validate global neste incremento.

## Requisitos que continuam abertos

Coordenar múltiplos capítulos com seleção explícita, orçamento agregado, pausa,
checkpoint e recuperação; exigir confirmação terminal da publicação anterior quando a
política tipada assim determinar. Essa política ainda não existe no contrato; texto
livre não será promovido a regra executável. Concluir as auditorias E1/E2/E3/E4 e E5 de
impacto e restauração editável em nova cópia privada. Cinco etapas continuam abertas;
o gate global histórico não está aprovado. Sem commit, push ou deploy.
