# W2-F3-04 — Oferecer portal e materiais aos jogadores

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-01](../fase-03-compartilhar-e-usar/01-convites-e-acessos.md), [W2-F2-08](../fase-02-criar-e-preparar/08-preparacao-de-sessoes.md)
**Áreas propostas:** image-library; propostas campaigns e access; functions, Firestore e Storage. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Dar aos jogadores um lugar para consultar materiais autorizados da campanha sem abrir a preparação do mestre.

## Entradas e resultado

Entradas: participante ativo e materiais selecionados para sua audiência. Resultado: portal com apresentação, resumos e arquivos efetivamente autorizados.

## Escopo e comportamento

- Mostrar somente projeção de materiais compartilhados e acontecimentos publicados pelo mestre.
- Separar material comum, segredo do mestre e conteúdo de destinatário específico conforme D-04.
- Usar arquivos da biblioteca por referência/projeção autorizada; URL pública antiga não pode contornar acesso privado.
- Definir estados de campanha vazia, material removido, falha e participação revogada.

## Passos de execução

- [ ] Implementar armazenamento/projeção de material e autorização de download.
- [ ] Montar portal e prévia do mestre como jogador.
- [ ] Adicionar atualização após revelação/retirada.
- [ ] Verificar API, consultas, cache e URLs diretas.

## Critérios de aceite

- [ ] Jogador não recebe notas privadas, pistas ocultas ou lista de nomes secretos.
- [ ] Prévia como jogador corresponde ao conteúdo servido à conta do jogador.
- [ ] Retirar material invalida novas leituras/downloads conforme política.
- [ ] Campanha sem material oferece estado vazio compreensível.

## Validação

- Regras de Firestore/Storage com mestre, jogador, destinatário e estranho.
- E2E: conferir payload/DOM e URL direta de material privado.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Arquivos privados já existentes com URL compartilhável exigem adaptação; ocultar link não protege o arquivo.
- Materiais baixados não podem ser apagados do dispositivo de terceiros.

## Não escopo

Chat, áudio, ficha mecânica de personagem e acesso a todo catálogo pago por participar.
