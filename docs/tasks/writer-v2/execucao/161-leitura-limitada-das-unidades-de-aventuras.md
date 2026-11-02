# P2 — leitura limitada de unidades autorais no cliente

Base: 46dc6b2, inventário 160. Próximo passo do montador: consumir os read nativos
de estrutura/recursos/lore/personas/histórico como bytes provisórios de unidades,
sem acumular corpos/projeto em RAM e sem confundir hash de unidade com arquivo.

## Descoberta e contrato

Grafo sem resultados; read services 148–154 e helpers de snapshot existentes
conferidos no fallback. Cada resposta JSON em ranges tem fonte, escopo, ID,
itemToken, ordinal de transporte, quantidade/bytes/SHA e base64. Resources têm
parentId/present; persona usa scope; história tem parentId/parentToken. Não
transportar schemaVersion da fonte como campo extra nos pedidos fechados.

Fonte/escopo/item/port/guard/signal devem ser fixados na chamada, antes de
qualquer next/await. Guard lança erro em troca de conta/contexto. Base64 canônico,
tamanho/ordem/manifesto e identidades são validados em cada parte. SHA incremental
certifica bytes integrais, mantendo só buffers de até 64 KiB e estado constante.
Nenhum cap silencioso de projeto/unidade ou fallback para corpo vazio.

Metadados e bytes permanecem provisórios até terminar naturalmente. Encerre
iterator/abort sem pedir nova parte ou devolver prova; return durante RPC pendente
precisa sinalizar fechamento imediatamente para não entregar resposta tardia.
Nenhum cancelamento depende de o callable poder ser abortado remotamente.

## Implementação e validação

1. Tipar scopes/port/prova e definir reader de unidade com captura síncrona.
2. Mapear somente métodos JSON suportados e pedidos/DTOs fechados; preservar
   ausências opcionais de resource. Persona sem perfil não chama reader.
3. Hash incremental, backpressure, guard em limites await/yield, intenção estável
   e encerramento imediato do iterador.
4. Testar corpos emitidos pelos leitores/produtores reais via fixture do
   inventário, incluindo múltiplos ranges, ausência, hashes Unicode e todos os
   formatos. Adversariais: troca de fonte/token/ordinal/manifesto/base64/tamanho,
   corrupção, falha de leitura, mutação de input/buffer, conta e cancelamento
   durante resposta pendente, sem nova parte/prova.
5. Checks dirigidos, types/lint/bundle, revisão, ADR/docs/evidência e commit local.
   Validate integral apenas no fechamento do grande bloco de captura.

## Não escopo

DTO semântico de arquivo, remapeamento, selo completo, histórico textual ordenado/
manifesto, PNG/Storage, rascunhos locais, transporte público, UI e restauração.
História continua em ordem física no inventário; seu montador resolve ordinais e
verifica SHA do texto completo. Prova de JSON nativo não substitui esse manifesto.

## Aceites

- [x] Corpo por ranges/hash integral e identidade em todos os formatos suportados.
- [x] Intenção capturada antes de next/await; backpressure e fechamento sem resposta tardia.
- [x] Testes/checks, revisão/evidência e commit local reais.
- [x] Unidade não declarada como pacote completo; P2/P3/D e gates abertos.
