# P2 — inventário limitado das fontes de aventura no cliente

Base: 2760e45, formato 159. Preparar o montador com percurso completo de metadata
e prova reproduzível, usando os serviços autorizados 147–157. Sem RPC/arquivo
completo/interface nesta etapa; unidades de conteúdo, histórico ordenado e mídia
serão compostos em seguida, antes de qualquer selo autoral.

## Descoberta

Grafo sem resultados; fallback atual conferiu todos os list/read/get nativos,
recordCaptureStream/bookSnapshotCapture como referência de backpressure, e
inventário 158. adventureBackupResources importa helpers Node: registro de
definições deve ser extraído literalmente para módulo puro, com reexports
compatíveis. Não importar codecs/serviços Node no navegador.

Histórico lista por ID físico SHA, não ordinal; visita de metadata não certifica
ordem/hash do texto. Montador posterior deve resolver ordinais pelo produtor
nativo e conferir manifesto integral. Imagens têm prova Storage independente,
que também não é certificada somente pelo percurso de bindings.

## Escopo e implementação

1. Extrair somente ADVENTURE_RESOURCE_DEFINITIONS/KINDS para módulo puro com
   declarações próprias; manter codec, singleton nativo e exports existentes.
2. Criar feature adventure-portability por interface pública. Port injetado
   permite chamar APIs já autorizadas sem iniciar Firebase no import.
3. Percorrer structure/parts; todas as views de resources, inclusive filhos;
   lore/lore-body; persona root/cenas; versões/chunks; imagens cena/bloco;
   origem neutra de universo. Source raiz/progresso é conferida no começo/fim.
4. Validar DTOs metadata fechados, identidades/tokens/presença, IDs por bytes UTF-8,
   páginas N+1 de 50, cursores progressivos e ancestrais. Manter só páginas da
   pilha limitada e SHA incremental; não acumular conjunto/prosa em RAM.
5. Expor prova somente de inventário e uma segunda passagem completa por digest/
   counts/views/fonte. Capture port/guard/signal/visit/expected antes de awaits;
   cópias congeladas por visita. Nenhum arquivo/prova recebida do usuário é grant.
6. Testar com produtores/leitores reais no banco de fixture, mais páginas 50/53,
   mudanças sem mudança de contagem, ausência/ABA, persona própria sem rootclock,
   erros/cancelamento/conta e resposta/entrada alterada durante await. Rodar só
   testes/checks pertinentes; suite integral no fim do próximo grande bloco.
7. Revisar diff, ADR/docs/evidência e commit local; depois conectar corpos,
   manifesto histórico e Storage ao framer, ainda mantendo P2 aberta.

## Não escopo

Validar bytes, DTO autoral, ordem/SHA completo de história, Storage generation,
rascunhos locais, endpoints, Rules, UI, restauração/ativação e operação comercial.
Inventário tem nome e relatório explícitos para não ser confundido com selo.

## Aceites

- [x] Registro puro e aliases/contratos do servidor preservados.
- [x] Todas as views correntes, sem truncamento/cap de projeto ou prosa em prova.
- [x] Segunda passagem recusa mudanças; guard/cancelamento/intenção congelados.
- [x] Testes/checks, revisão/evidência e commit local, com P2/P3/D abertas.
