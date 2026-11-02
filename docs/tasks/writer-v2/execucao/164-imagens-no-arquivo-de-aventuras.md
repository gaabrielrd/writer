# P2 — imagens no arquivo de aventuras

Base: 10002be. Capturar vínculos e PNGs autorizados pela interface pública de
adventure-portability, sem mudar readers/writers, Rules ou endpoints.

## Descoberta e plano

Grafo consultado, resultados insuficientes; adventureBackupImageRead, setters,
inventário e testes nativos conferidos. Listagem oferece cada cena/bloco mesmo
sem imagem. get fixa geração/metageração e hash por uso tipado; range e verify
revalidam autorização após I/O. RootSource sozinho não certifica biblioteca/GCS.

1. Contratos puros de endereço por recurso e manifesto/digest de seção.
2. Cliente congela port/guard/signal/fonte antes do primeiro consumo; percorre
   scene/block em páginas de 50 e ordem UTF-8, copiando a página antes de await.
3. Valida DTO fechado, vínculo e metadata PNG; emite binding explícito mesmo vazio.
   Para cada vínculo ativo emite asset próprio e bytes de 64 KiB, SHA de parte
   e integral/signature/quantidade. Preserva alt/caption/nome/datas sem URLs.
   Vínculos com o mesmo imageId continuam independentes: não deduplicar por ID.
   Repetir bytes por vínculo evita conjunto ilimitado em RAM e mantém cada grant.
4. Reconfere imagem após ranges e raiz no fim; manifesto de seção é provisório.
   Prova images-data-only guarda contagens/digest e digest operacional separado,
   sem copiar tokens/caminhos/gerações para o arquivo.
5. Segunda passagem percorre todos os vínculos, revalida metadata/hash/autoridade
   atual e compara provas sem guardar lista inteira; necessária antes do selo
   global futuro, junto ao inventário geral. Sem bytes repetidos na verificação.
6. Testes por produtores/readers reais: cena/adicional/ausência/arquivo, mesmo
   asset em dois grants, limites/paginação, falha/troca/ABA/retry/cancelamento.
   Node/cliente/types/lint pertinentes; validate integral ao fim do bloco.
7. Revisão/ADR/docs/evidência/commit local. Sem arquivo completo, restore ou UI.

## Aceites

- [x] Vínculos e bytes autorizados, metadata preservada sem dados operacionais.
- [x] Memória limitada e segunda passagem completa, sem deduplicação por ID.
- [x] Erro/cancelamento sem prova, testes e checks verdes.
- [x] Revisão/documentação e commit local; P2/P3/D permanecem abertas.
