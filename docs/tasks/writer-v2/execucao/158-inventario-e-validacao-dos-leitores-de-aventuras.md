# P2 — inventário e fechamento do bloco de leitores

Base: 8c97714. Leitores 147–157 cobrem fontes persistidas atuais; ainda não
há arquivo/restauração de aventura. Fechar esse grande bloco com inventário
dos produtores/relógios e validate integral antes de construir assembler.

## Descoberta e escopo

Grafo sem resultados após falha de indexação; fontes atuais conferidas em
Studio, scenes/Jobs, adventureBlocks/Images, narrativePlanning/Jobs, adventureLore,
workProgress/Ledger, workHistory, editorChatContext, imageLibrary, universes e
adventureImport/Contracts. Auditoria já encontrou/corrigiu o caso real de filhos
anteriores à raiz na importação (157); não usar somente fixtures do Estúdio.

Registrar matriz de views/paths, leitores, escritores, prova de autoria/clock,
presença/ausência, exclusões e gates de ativação. Distinguir estado persistido
de rascunhos locais de cena/bloco, que precisam de contrato explícito quando
a entrada do backup na interface for implementada. Não enumerar localStorage
de outras contas nem prometer já incluí-los pelo reader remoto.

## Regras para o assembler futuro

Captura completa deve primeiro percorrer/ler todas as views obrigatórias,
projetar/validar conteúdo e montar inventário/provas, depois executar uma
segunda passagem completa comparando mesmas identidades/IDs/tokens/presenças.
Recontagem isolada ou conferir somente última página não é selo.

RootSource nativo cobre membership dos writers usuais; exceção importante:
setter de persona de cena muda head sem raiz, mas não membership. Head é
conferido por sua identidade própria. Perfis, imagens/Storage, origem de
universo e demais dependências externas precisam de suas provas específicas.

Para registros com versões nativas monotônicas, igualdade entre as duas
passagens delimita uma janela comum entre fim da captura e início da verificação;
não promete que o projeto ficará imutável depois. Disponibilidade inacessível
de universo é somente hint conservador sem grant, nunca fotografia de prosa
ou autoridade de terceiro. Reconferir fonte ao terminar e abortar sem footer se
qualquer família/identidade/presença mudar ou validação falhar.

Histórico deve fechar ordinais/quantidade/bytes/SHA do texto inteiro; imagens
deduplicadas exigem todos os vínculos/provas e SHA integral. Arquivo deve ter
identidade de aventura própria; magic WRITER-BOOK não vira aventura por cast.
Extrair framer neutro somente mantendo bytes de livro e validadores de domínio
independentes. Protocolos/handlers devem exigir todas as famílias reconhecidas,
sem silenciosamente ignorar namespace autoral acrescentado no futuro.

## Sequência e validação

1. Escrever inventário atual com fontes/exclusões/risco residual e pendências.
2. Revisar contratos e logs das seleções reais; nenhum novo teste que apenas
   espelhe constantes ou documento. Novos comportamentos seguem com seus testes.
3. Executar npm run validate integral uma vez no fechamento desse bloco;
   tratar falha real e repetir só quando causa/alteração justificar. Sem CI.
4. Registrar saída real, revisão e commit local da documentação. Dependências
   functions já instaladas e sem mudança de manifests desde P1.
5. Prosseguir para contrato/framer/assembler/validador/revisão/restore/UI/roundtrip,
   mantendo P2/P3/D, F2-09 e fases/gates abertos.

## Aceites

- [x] Matriz de fontes, writers/clocks/provas/exclusões e rascunhos locais.
- [x] Condições de segunda passagem/manifestos e limites explícitos.
- [x] Validate integral real, revisão/docs/commit local, sem elevar progresso da fase.

## Falha encontrada no fechamento

Primeiro validate parou em um timeout frontend: 4.095/4.096 passaram,
cobertura acima dos limites. Arquivo isolado com cobertura reproduziu o mesmo
caso a 5.010 ms, com 19/20 positivos. O caso percorre três edições protegidas
com produtores nativos inline/v1/v2; recebe timeout explícito de 30 s, conforme
os demais percursos longos do arquivo. Nenhum limite global/cobertura ou
assertion é reduzido. Medir o caso dirigido e repetir validate integral após
esse ajuste de infraestrutura do teste; registrar também a tentativa vermelha.

Segunda tentativa: outro timeout de 5 s em bookLoreControlCleanup. A espera
vi.waitFor de 5 ms podia vencer antes do producer atingir a pausa; então o teste
aguardava step, cuja liberação só ocorreria depois do loop. Corrigir o harness
com uma Promise de chegada explícita (atStart), sem polling por relógio nem
alterar assertions ou timeout desse segundo teste. Repetir seleções e validate.
