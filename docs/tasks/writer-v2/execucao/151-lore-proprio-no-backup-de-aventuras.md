# P2 — lore próprio no backup privado de aventuras

Base: b0015dd. Capturar metadata e corpos atuais do lore próprio, sem resolver
universo, relações, imagens ou perfil por coincidência. Este incremento não
fecha pacote integral, histórico, restauração ou interface.

Grafo consultado sem resultados após falha anterior de indexação. Fontes atuais:
adventureLore/Contracts, campaignLoreOrigin e testes dos produtores. Native:
lore/id contém metadata ou tombstone; loreBodies/id contém detalhes/estruturados/
relações da mesma revisão. Ambos carregam owner, adventureId e adventureToken
ligado ao nascimento da raiz. Relações são endereços canônicos neutros e descrição
própria. Remover ficha grava tombstone e apaga corpo atomicamente.

## Contrato antes do código

Serviço interno específico de lore, reutilizando fonte 147 e contratos nativos.
Não estender leitor 149 com validação de ficha: a identidade e par metadata/corpo
são concretamente diferentes. Duas famílias fechadas lore/lore-body com IDs
físicos, lista N+1 limitada a 50, cursor canônico próprio e leitura por faixas
UTF-8 de 64 KiB/hash integral. Input fechado; capturar todos os primitivos antes
de awaits.

Na mesma transação, conferir fonte e readAdventureLoreContext com withWorld
false. Nunca consultar universo/autorização de campanha. Listas projetam apenas
identidade/revisão/deleted e marcadores de storage, sem nome/aliases/resumo/prosa.
Cada descriptor comprova par head/body: ficha ativa requer corpo da mesma
identidade/revisão; tombstone exige corpo ausente. Corpo órfão, metadata de outra
raiz/conta/nascimento, schema/revisão futura ou marcador externo falham.
Não adotar origem antiga por coincidência.

Tokens ligam UID/aventura/fonte/kind/id e identidades nativas do head e corpo
(ausência explícita para tombstone). Read reconfere par e usa storedMetadata/
storedBody com projeções fechadas. Nome/aliases/resumo só na unidade metadata;
prosa/estruturados/relações só na unidade corpo. Preservar literal, não normalizar
pela entrevista nem truncar. Corpo usa contratos nativos de leitura e mantém
relações próprias neutras mesmo se alvo global saiu.

DTO próprio conserva head: nome/aliases/categoria/resumo/datas/isPublic false/
deleted; tombstone somente deleted/datas, sem inventar prosa apagada. Corpo:
details/structuredDetails/relations. Excluir owner/schema nativo/adventureToken/
revision/contadores/recibos/operações/chaves/URLs. Tombstone é estado de remoção,
não ficha ativa; futura restauração não deve ressuscitá-lo. A presença da
metadata removida mantém o inventário explícito, sem copiar corpo inexistente.

## Sequência e validação

1. Serviço/codec próprios com fonte e identidade nativa, sem novo writer.
2. Produtores reais criam/alteram/removem fichas; testar relações retidas com
   origem global indisponível, >50, corpos grandes/Unicode, par ativo/tombstone,
   ausência, órfão, nascimento/revisão/conta/schema e nenhuma leitura global.
3. Testar alterações/ABA de head/corpo/root, cursor/escopo, intenção capturada,
   falha/retentativa e nenhuma escrita; preservar regressões 147–150.
4. SDK real dirigido de masks/paginação/nascimentos/par/Rules, lint/sintaxe/docs/
   arquitetura/styleguide/format/diff. Validate integral no fechamento de P2.
5. Revisar, ADR/evidência parcial e commit local. Sem CI/remoto/deploy/subagentes.
   Depois histórico/progresso/checklist/personas/mídia/selo/arquivo/restore/UI.

## Aceites

- [x] Duas famílias e inventário de pares/tombstones sem adoção de órfão.
- [x] Identidade nativa/revisões/autoria e fonte no mesmo snapshot.
- [x] Valores próprios e relações neutras, sem leitura global ou vazamento.
- [x] Testes/SDK/checks, revisão/docs/commit; P2 integral e demais fases abertos.

## Resultado dirigido e revisão

204 Node positivos (37 novos de backup + nove do produtor + 158 regressões),
sem skip, em 476,0763 ms. Dois SDK reais positivos em 12.376,9785 ms.
Primeira seleção SDK revelou expectativa de página no teste de tombstone;
corrigida para buscar ambas as páginas sem alterar serviço/ordenação/Rules.

Revisão confirma máscara sem texto, comprovação de pares físicos, nascimento
da raiz e ausência de lookup global. Lint dirigido positivo; checks finais
documentados na [evidência parcial](../../../entregas/2026-10-26-writer-v2-lore-proprio-no-backup-de-aventuras.md).
[ADR 0174](../../../decisions/0174-adventure-backup-local-lore-pairs.md).
P2 integral, histórico/demais famílias e validate do bloco permanecem abertos.
