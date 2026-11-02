# ADR 0041 — Lore privado da aventura

**Estado:** implementada e concluída tecnicamente em `087bced`, com CI geral e regras verdes; sem rollout.
**Contrato:** [F2-09 L](../tasks/writer-v2/execucao/26-lore-proprio-de-aventura.md).

## Contexto

Aventuras já possuem cenas e blocos, mas sua escrita dependia de fichas do
universo. O criador precisa desenvolver personagens, lugares e conceitos próprios
do projeto, com prioridade de menções locais e referências explícitas para
campanhas. Revogar o universo não deve apagar a prosa própria da aventura ou da
mesa.

## Decisão

Ampliar `features/lore` por sua API pública, com cinco callables privados:
listAdventureLore, getAdventureLore, saveAdventureLore, deleteAdventureLore e
resolveAdventureLoreOperation. Metadata e corpos ficam em coleções separadas
`adventures/{id}/lore` e `loreBodies`; SDK direto permanece fechado, inclusive
para o proprietário. Recibos e fences por UID não contêm prosa.

A identidade da aventura deriva do createTime real da raiz. Escritas conferem
CAS da ficha e coleção, preservam whitespace da prosa e atualizam loreVersion
mais o relógio privado de autorização no mesmo commit. Exclusão gera tombstone
mínimo e remove corpo; IDs consumidos não são reutilizados. Recibo histórico é
reconhecido antes do estado do alvo e não devolve uma versão posterior do texto.

O cliente mantém o pedido incerto e seu hash somente em memória. Confirmação
repete o pedido congelado; cancelamento fecha o operationId por fence. Erros e
conflitos mantêm o rascunho; consultar a revisão atual não autoriza rebase
silencioso. Nenhuma recuperação persistente nova é prometida.

O catálogo visível é paginado. Menções recebem contexto completo de metadata,
carregando todas as páginas locais antes das globais sob o mesmo contextToken.
Detalhes e relações vêm do get autorizado por contextToken e entityToken exatos.
Hints de raiz/universo e o pulso neutro compartilhado invalidam o leitor antes
de nova prova no servidor. O relógio privado continua fechado ao SDK.

Origens globais mantêm exatamente `{kind:'lore',scopeId,id}`. Lore local usa
`{kind:'adventure-lore',adventureId,id}`, mas o item capturado continua kind lore.
Seu sourceKey deriva exclusivamente da origem canônica; o campo interno
originAdventureToken congela a encarnação à parte. Gates B/C2/C3/S2 comparam esse
token e a metadata da ficha com createTime da raiz atual antes de ler corpo.
Recriar raiz e ficha com os mesmos IDs não libera material antigo.

Relações indisponíveis são neutras. Descritor antigo pode ser mantido exatamente
ou removido, sem impedir a edição da prosa própria; novo alvo exige autorização
atual. Menções não criam referências de captura automaticamente. C4 permanece v4.

## Consequências

Autores podem escrever lore próprio de aventura e mestres usam apenas fichas
explicitamente referenciadas na base congelada. A autorização global continua
independente; relações não ganham nomes por fallback revogado. Livros e lore de
universo mantêm suas interfaces e identidades anteriores.

L não implementa importação, IA contextual nova, backup/restauração, publicação,
jogadores ou exclusão integral de aventura. Essas entregas mantêm seus próprios
contratos. Regras, índices e escritores devem ser publicados conjuntamente antes
de habilitar a capacidade; emulador não prova índices ou configuração produtiva.
