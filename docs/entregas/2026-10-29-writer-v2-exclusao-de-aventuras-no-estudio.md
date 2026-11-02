# Writer V2 — exclusão de aventuras no Estúdio

## Estado

Incremento local do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 2dbfa02. A [ADR 0230](../decisions/0230-adventure-deletion-catalog-routes-and-binding.md)
registra a composição. É evidência dirigida parcial; o plano 199 e o fechamento
integral de 198–199 continuam abertos.

## Funcionalidades implementadas

- Excluir pela página e pelo cartão de aventura, com confirmação explícita.
- Manter diálogo/recibo quando a prova de revogação esconde original e cartão.
- Retomar pelo catálogo remoto/local do Estúdio mesmo sem raiz disponível.
- Consultar exclusão pela URL antiga; abrir/recarregar não avança por si só.
- Paginação com guarda de conta, geração, identidade, piso e cursor sem repetição.
  Falhas preservam linhas conferidas e metadata local, inclusive controles inválidos.
- Edição editorial pendente bloqueia novo início pela página. Revogação comprovada
  libera navegação sem apagar seus controles ou rascunhos.
- Seis exports reais de Functions ligados ao dispatcher lazy, com App Check,
  headers privados e a porta de mídia restaurada existente.
- ID nativo longo não impede a notificação da página por exceder o orçamento
  menor dos pulsos opcionais de apresentação.

## Testes e resultados reais

| Verificação                                             | Resultado                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Cliente, diálogo, catálogo, AdventurePage e Estúdio     | 161/161 Vitest, 11 arquivos, 14,60 s                           |
| Dispatcher e binding real do SDK                        | 15/15 Node, 1721,8917 ms                                       |
| Três jornadas de diálogo e três de rota, seis variantes | 36/36 Chromium, 1,7 min                                        |
| Cobertura dirigida da feature                           | 93,75% instruções; 92,10% ramos; 96,95% funções; 97,74% linhas |
| Tipos, bundle de produção e smoke                       | npm run build positivo; bundle em 2,48 s                       |
| Styleguide, arquitetura e sintaxe Functions             | Positivos; 407 módulos conferidos                              |

Os 161 incluem regressões existentes, 12 cenários do catálogo, cinco cenários
novos da página, cartão, invalidação da conta e ID nativo longo. Rodadas
anteriores se sobrepõem; não somar seus totais. Fixtures estão fora da cobertura
dirigida; limites existentes não foram reduzidos.

Os seis comandos são executados pelos exports reais de index sobre um banco de
teste com relógios documentais simulados. O percurso chega à raiz ausente,
consulta/listagem terminal e resolução do início após fechamento.
HTTP usa SDK real e usuário sintético conferido por um Auth Emulator mínimo
local; App Check ausente ou malformado retorna 401 sem banco nem reflexo de
payload privado. Não usa credencial real nem comprova atestado válido de produção.

No Chromium, rotas, AuthProvider/ThemeProvider, componentes, Web Locks, journal
e recarga são reais. Auth e RPC são fictícios, separados por UID/projeto e
sincronizados com reserva permanente/remoção no StudioStore. A primeira rodada
encontrou exports de órfãos ausentes na fixture de cenas; foram acrescentados
para permitir o carregamento real da aplicação de teste, sem alteração extra
de produção nesse domínio. Após a correção, as três rotas no desktop e as 36
jornadas completas passaram.

Jornadas incluem página/cartão, original oculto, diálogo vivo após remoção do
cartão, pausa entre unidades, reload com replay do pedido exato, URL antiga,
catálogo sem raiz e troca de conta. Outros livro/aventura/campanha continuam
listados. Tab/Escape/foco e limites do diálogo são conferidos em claro/escuro/
sépia, 1440×1000 e 390×844. Capturas de desktop escuro e celular sépia foram
inspecionadas. Não substitui dispositivo real, leitor de tela ou zoom físico.

O ajuste final do pulso para IDs longos foi conferido nos 161 testes finais.
A rodada visual anterior cobre IDs usuais; o ajuste não altera sua composição.
Lint inicial apontou dois callbacks async sem await nos testes; foram corrigidos.
ESLint final dos arquivos alterados passou. Build mantém avisos de imports
estáticos/dinâmicos ineficazes existentes, sem erro de bundle/smoke.

## Arquivos e evidências

Código principal: feature adventure-deletions (catálogo, preparations, hook,
diálogo, cliente/barrel), composição em adventures/Studio e functions/src/index.mjs.
Testes: AdventureDeletionPreparations, adventureDeletionDialog, AdventurePage,
StudioPage/useStudioProjects, adventureDeletionCallableSdk e jornadas de rota.
Fixtures de transporte/Studio/cenas foram alinhadas com as rotas atuais.
Documentação de arquitetura/testes, README, plano e ADR foram realinhados.

Artefatos fora do Git no diretório local writer-v2-portability-qa:
m121-final-ui.log, m121-final-coverage/, m121-final-node.log,
m121-browser.log, m121-browser-results.json, m121-browser-artifacts/,
m121-final-lint.log, m121-build.log e m121-state.md.

## Pendências e como conferir

Abrir /studio ou /adventures/:adventureId num ambiente autorizado com os bindings
implantados. Esta sessão não implantou Functions nem testou dados de produção.
O Vite manual 5173 permanece aberto; o servidor isolado 4317 encerrou ao fim das
jornadas. Nenhuma conta, projeto real ou dado do operador foi excluído.

Faltam ciclo rico restaurado e validate integral no fechamento 198–199.
A política final das perguntas do chat continua pendente; o motor atual preserva
perguntas próprias. Macro 8/35, 199/P2/P3/D/F2-09/V2 e gates humanos/comerciais
continuam abertos. A validação integral anterior 197 não é atribuída a este código.
Somente commit local; sem CI, push, PR, merge ou deploy.
