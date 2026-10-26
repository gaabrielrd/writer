# P2 — cenas, blocos e referências no backup privado

Base: b520ac0. Estender captura interna sem habilitar arquivo/restore/UI.
Grafo writer-v2 permanece indisponível após worker crash; fontes atuais conferidas:
scene.ts, scenes/sceneJobs, sceneContracts, adventureBlocksState/Contracts,
adventureBlockImages e bookBackupResources/Read como referência de protocolo.

## Descoberta relevante

- Arquivar mantém parentId e registra formerParentId; retirar parte move cenas
  a parentId null, preserva formerParentId e atribui rank do grupo sem parte.
  Desarquivar tenta a parte anterior e usa Sem parte quando ela não existe.
  formerParentId é pista de recuperação, não prova para criar parte ausente.
- Ordem de cena depende de rankA/rankB e rankSlot no grupo. Preservar esses
  valores requer controles mínimos, não apenas a ordem das partes.
- Referências nativas guardam kind/scopeId/entityId; nomes/categorias são
  resolvidos para a tela e não devem entrar no arquivo como fallback.
- Principal mora em scenes + body/current; adicionais em sceneBlocks +
  body/current. Imagens são imageId/alt/caption; não URL.
- MainBlockTitle/Type/Audience antigos podem faltar; a tela aplica default
  privado do criador. Captura não inventa classificação Mestre/Jogadores.
- Persona é da aventura com complemento da cena; blocos herdam. Mudança do
  vínculo de cena pode não alterar raiz, exigindo prova nativa própria.
- Agregados de palavra/blocos são controle, não fonte de prosa. Não depender
  de contador possivelmente pendente para preservar texto.
- Conversão legacy usa sceneSources no fluxo de capítulo. Nenhum novo produtor
  de fontes de conversão de aventura é habilitado por este incremento.

## Famílias deste incremento

| kind fechado    | Origem                                                 | Prova/dependência                                                        |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| part-control    | partes existentes, somente rankSlot                    | Mesmo head nativo autorizado da parte, sem prosa                         |
| scene-control   | singleton sceneControls/unassigned, inclusive ausência | Raiz e presença/identidade do controle; não listar controles arbitrários |
| scene           | cenas físicas, inclusive arquivo/sem parte             | Head obrigatório schema 1 e owner da conta                               |
| scene-body      | scenes/id/body/current                                 | Head da cena + corpo obrigatório, hashes devem coincidir                 |
| scene-planning  | scenes/id/planning/current, inclusive ausência         | Head + presença/nascimento/versão do planner                             |
| scene-reference | scenes/parentId/references/id                          | Cena autorizada + ref; nunca resolver labels/corpo externo               |
| block           | sceneBlocks/id                                         | Head obrigatório e cena dona correspondente autorizada                   |
| block-body      | sceneBlocks/id/body/current                            | Block + cena dona + corpo obrigatório, hashes coincidentes               |

Ausência do controle/planner é explícita e diferente de corpo ausente.
Coleções são percorridas por ID físico, sem filtro que retire arquivo ou texto
próprio. Excluir/reorganizar fonte ativa bloqueia captura, não a altera.

## Contrato e sequência antes do código

1. Serviço interno separado de recursos, reusando fonte 147 no mesmo snapshot.
   Não receber coleção/caminho arbitrário. Lista por kind, sourceToken, parentId
   para filhos de cena/bloco, cursor canônico e limite 1–50; N+1 metadata.
   scene-control oferece singleton explícito mesmo sem documento.
2. Token do item liga UID/aventura/fonte/kind/id/parentId e identidades nativas
   próprias e dos heads necessários. Cada unidade confere os mesmos vínculos.
   Capturar todos os primitivos antes de awaits; nenhum pedido valida índice
   novo depois de pausa nem troca autoridade por conteúdo de outro head.
3. Metadados de listagem nunca carregam título/prosa. Corpo/planner consultados
   por máscara metadata para formar a identidade; leitura do conteúdo ocorre
   somente em read, com um item inline por unidade.
4. Codec próprio fechado por kind, JSON UTF-8/hash integral, até 64 KiB por
   faixa. Sem trim/default de texto, perda de vazio/ausência ou dump de jobs,
   Auth, chaves, owner, URLs e recibos. Controles mínimos capturam rankSlot;
   cena mantém ranks, parentId/formerParentId, estágio/arquivo, datas e hash.
   Contadores/revisões transitórias são reconstruídos, sem alegar selo global.
5. Cena mantém mainBlockOrder/Title/Type/Audience declarados e imagem neutra;
   ausência/classificação antiga continua distinta e privada. Bloco adicional
   mantém sceneId, título/tipo/audiência/order/archived/imagem e datas.
   Metadata de imagem leva somente ID/alt/caption; bytes autorizados virão depois.
6. Complemento de persona é vínculo neutro (ID/overrides próprios), sem lookup
   por coincidência, tokens/provedor/chave ou descarte de traits antigos.
   Perfil/disponibilidade e prova de autorização serão fechados no contrato
   de personas, antes de emitir pacote completo.
7. Corpo obrigatório: content string, hash próprio e do head iguais ao texto.
   Não exigir revision de corpo igual à revisão de metadata (planejamento muda
   a cena sem mudar texto). Marcador externo desconhecido, inclusive null, falha
   sem fallback inline. Planner/ref nunca usam labels globais.
8. Preservar formerParentId literal mesmo se parte foi removida, sem recriá-la
   nem adotar ID por coincidência. Remapeamento/hint será tratado no restaurador.
   Head atual precisa existir/ser autorizado; não adotar órfão de outro projeto.
9. Testes de produtores reais: cenas/sem parte/arquivo, parte retirada, principal
   legado e adicional, planner vazio/ausente, refs neutras, imagens/persona como
   metadata; >50, Unicode, bytes, mudança/ABA em cada dependência, erro/retry,
   conta/escopo, intenção congelada e nenhuma escrita.
10. SDK dirigido real confirma máscaras/cursores/heads/corpo/Rules pertinentes.
    Lint/sintaxe/docs/format/diff; validate no fechamento do bloco P2.
    Revisar/documentar/commits locais sem CI/push/PR/merge/deploy/subagentes.

## Arquivos previstos

Novos adventureBackupResources (codec/definições fechadas) e
adventureBackupResourceRead (serviço), testes/fixtures e SDK pertinente.
Reusar helpers de fonte e expor validação de parte do leitor 148 somente se
necessário, mantendo seu contrato/hash e regressões. Nenhum writer novo.

## Aceites

- [x] Todas as oito famílias e ausências explícitas, sem omitir arquivo/texto.
- [x] Listagem metadata e leitura íntegra por unidade com autorização/provas.
- [x] Datas/ordem/audiência/ref/imagem/persona sem grants ou fallback proibido.
- [x] Testes dirigidos/SDK/checks, revisão/docs/commit; P2 completo ainda aberto.

### Endereçamento dos filhos e presença

Seguir o protocolo demonstrado nos livros: scene-body/planning recebem parentId
da cena e id current; block-body recebe parentId do bloco e id current; referência
recebe parentId da cena e seu ID físico. Demais kinds não recebem pai.
Singleton ausente opcional (planner/controle) ainda oferece descriptor present
false com token de ausência, diferentemente de corpo obrigatório ausente, que falha.
O DTO inclui kind/parentId/id/present/data, sem converter ausência em texto vazio.

Reter rankA/rankB e capturar rankSlot nos controles mínimos permite interpretar
a ordem sem usar agregados. Descrever o hint formerParentId mesmo quando a parte
já foi retirada; não criar parte para satisfazer esse hint. A restauração definirá
a reconstrução dos índices separadamente da preservação de conteúdo autoral.

## Resultado dirigido e revisão

118 Node passaram (54 novos recursos + 64 regressões), sem skip, em 366,1354 ms.
Três SDK reais passaram na seleção final em 11.792,0326 ms; logs de recusa de
escrita são esperados. Primeira execução também positiva em 11.613,627 ms.
Revisão fixou kind em um valor capturado antes de awaits. Fonte/getter/hash da
147 e contrato da 148 permanecem; parte expõe apenas validador interno existente.
Nenhuma mudança de writer/Rule/runtime/namespace/UI ou dependência.

Confira [ADR 0172](../../../decisions/0172-adventure-backup-scene-block-resources.md)
e [evidência parcial](../../../entregas/2026-10-26-writer-v2-cenas-e-blocos-no-backup-de-aventuras.md).
Demais famílias, selo/arquivo/restore/UI e validate de P2 permanecem abertos.
