# Writer V2 — revisão e interface da seleção de visibilidade

- Data: 2026-10-25.
- Plano: [125](../tasks/writer-v2/execucao/125-visibilidade-duravel-da-selecao-de-lore.md), marco C / M38c6c.
- Decisão: [ADR 0142](../decisions/0142-book-lore-visibility-selection-ui.md).
- Integração: local, branch codex/writer-v2; interface exportada, sem montagem no compêndio.

## Objetivo e funcionalidades

Conferir nomes, origens e consentimento antes de confirmar a visibilidade de
uma seleção inteira. UI nova não cria pedidos ao abrir. Manifesto fixa bool e
origens; retomada lê o bool gravado. Revisão C1/v2 completa, sem promover tokens,
com nomes somente em RAM e revalidação final de fonte/seleção/cursor.

Diálogo separa confirmação, consulta e retry explícito de uma ficha; salva dívida
sem outra unidade e cancela por handle fresco, inclusive com produtor retido.
Resultados aplicados e unchanged distintos. Callback exige todos os resultados
conferidos e contagens coerentes, sem dívida, uma vez por seleção/host.
Não representa o efeito histórico como valor atual ou publicação automática.

Lista paginada por conta e filtrada por livro, sem nomes/prosa e com contagens
neutras até consulta. Filhos de visibilidade são omitidos da lista manual isolada,
preservando registros, cópias e cursor para retomada pelo grupo.

## Arquivos

Revisão e sessão de visibilidade, Dialog/Recoveries exportados, filtro de filhos
no BookLoreRecoveries e contratos, exports públicos, quatro arquivos de testes
novos/alterados, ADR/AGENTS/arquitetura/testes/plano e registros de execução.

## Testes dirigidos

**87 testes Vitest positivos em seis arquivos**, sendo 32 novos e 55 regressões:

- BookLoreVisibilitySelectionDialog: 23.
- bookLoreVisibilitySelectionReview: oito.
- bookLoreVisibilitySelectionSession: seis, um novo.
- BookLoreManualEditor: 18, incluindo filtro de filho e paginação.
- BookLoreRemovalSelectionDialog: 21 regressões.
- bookLoreRemovalSelectionReview: 11 regressões.

Cobrem origem C1/v2, 53 nomes sem cap, bool fixo, ausência de consentimento,
tokens v1 rejeitados, mudança durante revisão, retry só no cursor original,
outros handles, conta/host, revisão tardia ignorada, callback misto/parcial/frio,
falha de consulta, dívida e ACK local, cancel retido/repetido, foco e descoberta.

Dois testes adicionais inicialmente falharam por expectativas/wire do fixture:
emissão v2 inicial versus readToken fixo nas releituras; cancel externo sem
startHash e encerramento do cursor não realizado. Corrigidos para usar os
contratos reais e fechar o membro por outro handle. Bateria final 87/87 positiva.
Sem alteração no executor para fazer esses testes passar.

## Chromium real e evidência visual

Quatro jornadas positivas, com React/kit/sessão/revisão/executor/journal de
produção, IndexedDB, Web Locks, WebCrypto/AES-GCM e cliente HTTP de chave reais:

1. 53 fichas em duas páginas, confirmação separada, 52 alterações e um unchanged,
   callback único, lista fria metadata sem prosa e fechamento sem aviso falso.
2. Apply aceito com resposta perdida, reinício persistente do browser e consulta
   fria, sem replay. Revisão posterior ignora o membro já aceito.
3. Cancel com produtor aceito retido, resposta do cancel perdida, repetição
   independente e ACK tardio sem sobrescrever resultado/emitir outro callback.
4. Origem alterada durante revisão: erro recebe foco e não permite confirmar.

Três temas e 390px positivos; capturas claro/escuro/sépia/mobile inspecionadas.
Nome de 400 caracteres quebra dentro da área rolável; ações continuam visíveis.
Tab fica no diálogo, Voltar devolve foco, Escape fecha e restaura o gatilho
tanto na abertura nova como na retomada. Foco também no aviso e no erro.

Contraste texto/superfície do diálogo: 14,21 claro, 14,64 escuro e 12,98 sépia.
Viewport 390px: diálogo de x16 a x374, document.scrollWidth 390, sem overflow
horizontal; scrollWidth/clientWidth do diálogo 356/356.

A primeira execução excedeu o prazo de 60s na aplicação de 53 fichas, sem
resultado conclusivo dessa jornada. Repetição com 180s concluiu os quatro casos
sem mudança no código de produto. Não é medição de desempenho de produção.

Backend Firestore/Auth/SDK/App Check são fixtures locais; serviços nativos
reais usam Firestore em memória. Cliente HTTP verifica tokens de fixture e
recebe envelope nativo; não prova credenciais/App Check real nem rede implantada.
Leitor de tela, zoom físico 200%, segundo dispositivo e piloto humano não feitos.

Artefatos fora do Git em writer-v2-portability-qa: m38c6c-browser.mjs,
m38c6c-browser-result.json, m38c6c-selection-{light,dark,sepia,mobile}.png e
m38c6c-vitest.json. Falha inicial preservada no mesmo diretório.

## Validações

Tipos e lint dirigidos positivos; bundle com 2971 módulos e smoke positivos.
Styleguide positivo. Formatação, docs, arquitetura e diff conferidos no fechamento.
Avisos anteriores de chunks/imports dinâmicos permanecem.
Validate integral reservado ao fechamento de P1 por decisão do operador.
Backend/Rules/SDK wire/env/dependências sem mudanças; sem repetir seus testes.
Sem CI, push, PR, merge ou deploy.

## Limitações e próximos passos

Etapa 4 implementada, sem concluir o plano 125: falta montar o compêndio com
todas as ações. Callback deve reler os valores atuais e retomadas devem dirigir
o grupo; efeito histórico não congela a privacidade. Fechamento não certifica
atomicidade de grupo, publicação ou coleta física dos corpos.

Lifecycle/consumidores/backup/rollout/validate de P1, demais fases da V2 e gates
humanos/comerciais permanecem no objetivo. Não houve ativação remota.

## Como conferir

Pelo host local de QA, escolher seleção pública/privada com origens v2 reais,
conferir nomes e confirmar. Fechar/reabrir mantém a tentativa e exige consulta
para resultados gravados. Interromper uma resposta de apply, recarregar e
consultar; nenhuma aplicação deve ser reenviada automaticamente. Se não aceita,
revisar reenvio só da ficha original. Cancel deve preservar aceites e cópias.
