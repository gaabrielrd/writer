# P2 — composição integral da captura de aventuras

Base: ef53647. Reunir as oito seções já implementadas em fluxo, com segunda
passagem antes do fechamento de envelope/container. Ainda não é validador
semântico para arquivo importado, interface ou restauração.

## Plano

1. Compositor fixa port/opções/fonte e rascunho explícito antes do consumo.
   Reusar congelamento de input de draft, sem copiar texto inteiro em binário.
2. Abrir envelope próprio; compor cinco seções centrais, recolhendo somente
   duas provas para o draft escolhido. Depois histórico, draft e imagens.
   Conferir source único, contagens históricas/imagens contra inventário
   completo e contagens de todos os registros/payloads de cada seção.
3. Revalidar inventário completo, origem do draft e todas as imagens/gerações
   antes de package-end. Segundo inventário inclui perfis/universo/corpos e
   versões/chunks, com identidades nativas. Prosa global não é copiada.
   Prova captured-data-only não declara validação semântica de arquivo externo.
4. Encapsular registros no encoder próprio de aventura; conferir guard/signal
   em cada bloco de bytes, inclusive entre package-end e selo do container.
   Encerramento imediato fecha fontes sem aguardar RPC e observa conclusão tardia.
5. Testes integrados por produtores/leitores reais: oito seções, bytes/framing/
   hashes e inspeção envelope; com/sem draft/imagens, Unicode/histórico,
   ausência/arquivo/importação, corrupção/troca de fontes/perfis/imagens/conta,
   falha/retry e cancelamento. Sem UI ou escrita de arquivos autorais ainda.
6. Fechar o grande bloco de captura com validate integral e checks pertinentes;
   não atribuir ao fluxo semântico/restore resultados ainda não executados.
   Duas tentativas falharam no lint por OOM (padrão e heap local de 1.536 MiB).
   Executar lint em subprocessos sequenciais por feature e src/test de Functions,
   com passagem final da raiz excluindo somente diretórios já verificados.
   Preservar configuração/Rules/escopo integral; testar falha/continuidade e
   diretórios novos/restantes. Não reiniciar servidor ou processos alheios.
7. Revisão/ADR/docs/evidência/commit local. Próximo bloco: leitor/validador autoral,
   índice/revisão, backend/UI de transporte e restauração/roundtrip.

## Aceites

- [x] Oito seções reais com fonte e contagens conferidas.
- [x] Segunda passagem completa antes de footer, sem memória integral.
- [x] Container de aventura íntegro e abort/conta sem selo tardio.
- [x] Checks restantes/revisão/evidência e commit local parcial; P2/P3/D abertos.
- [ ] Fechamento formal com npm run validate verde no próximo grande bloco,
      após ajuste individual do timeout; não declarar a rodada exit 1 aprovada.
