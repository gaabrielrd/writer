# ADR 0038 — Vínculos de lore autorizados por sessão

**Estado:** concluída tecnicamente em `d9b7988`; CI e regras verdes.
**Contrato:** [F2-08 S2A](../tasks/writer-v2/execucao/22-referencias-de-lore-da-sessao.md).

## Contexto

O mestre precisa consultar fichas efetivas e legadas a partir da preparação de uma
sessão sem copiar prosa derivada para suas notas próprias. A origem pode perder
autorização depois de um vínculo ou de um pedido cuja resposta se perdeu. O texto
S1 precisa continuar independente e a recuperação não pode depender de reler essa
origem. Jobs C4 antigos têm posições de limpeza persistidas.

## Decisão

Guardar vínculos flat por campanha, com alvo mínimo kind/sourceKey, controle por
sessão e recibos/fences próprios por usuário. Novas mutações e toda consulta de
material, incluindo candidatos do seletor, conferem campanha e sessão ativa na
revisão observada antes de resolver origem. O SDK direto permanece fechado.

A projeção reutiliza os gates C2 de base, geração, autorização por UID e legado.
Uma ficha indisponível vira linha neutra sem alvo/nome; outras fichas autorizadas
continuam disponíveis. Universo atual indisponível não invalida legado de outro
universo. Leitura com contexto antigo autorizado falha explicitamente e não adota
material novo. Nenhum corpo, alias, imagem ou entityHash entra no journal ou recibo.

Um pedido confirmado é reconhecido por seu fingerprint histórico sem exigir sessão
ativa ou origem. O usuário pode encerrar explicitamente um pedido desconhecido:
o servidor confirma o recibo existente ou cria fence, antes de resolver qualquer
material. O cliente persiste a intenção cancel sob CAS/Web Locks antes de enviar;
reload repete cancel. O resultado nunca promete desfazer um evento já confirmado.

A feature campaign-session-references conhece auth/shared e APIs públicas puras de
campaign-lore. Campaigns compõe um slot público de S1 e os controles de recuperação
externos ao diálogo. O renderer de lore é puro; somente a leitura session-scoped
pode fornecer o corpo desse painel. A pendência se agrega à de S1 e gestão.

C4 começa em cleanupVersion 3, com seis namespaces de recuperação e onze coleções
filhas. V1 mantém posições 3/7 e v2 mantém 4/9. O terminal remove a versão interna.
Novas escritas respeitam a reserva de qualquer versão. Implantação conjunta de
start/advance, guardas, APIs, regras/índices e drenagem de starts antigos é condição
de habilitação futura; este incremento não autoriza deploy.

## Consequências

- Sessão tombstonada revoga os vínculos imediatamente. IDs mínimos flat podem
  permanecer no servidor até C4; não há promessa de remoção física imediata.
- Texto S1, originais e outras mesas não são alterados por vincular/remover.
- Recibos e fences não transportam material derivado; controles locais inválidos
  ou trocados por outra aba ficam preservados.
- Cenas/blocos, pistas, missões, lore vivo independente, compartilhamento, IA,
  backup e histórico de vínculos têm recortes próprios.
- Se vínculos passarem a armazenar anotações ou nomes, será necessário definir
  limpeza própria antes de habilitar esses campos.

## Verificação

Validate local verde: 1.910 frontend, 83 scripts e 383 Functions; cinco famílias
SDK únicas e 12 combinações nativas comprovadas. A CI geral e regras 145/145 do head `d9b7988` passaram. Resultados e limites estão na [entrega S2A](../entregas/2026-10-18-writer-v2-referencias-de-lore-da-sessao.md);
a evidência de S1/c95253a permanece distinta.
