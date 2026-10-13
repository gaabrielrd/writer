# W2-F4-03 — Gerar pacotes de aventura por audiência

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-01](../fase-04-publicar-e-comercializar/01-edicoes-e-projecoes.md), [W2-F3-04](../fase-03-compartilhar-e-usar/04-portal-e-materiais-dos-jogadores.md), [W2-F4-02](../fase-04-publicar-e-comercializar/02-epub-e-pacote-externo.md)
**Áreas propostas:** image-library; propostas adventures, campaigns e publications; Storage. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Distribuir uma aventura utilizável preservando a separação entre instruções do mestre e materiais dos jogadores.

## Entradas e resultado

Entradas: edição de aventura, seleção de blocos/assets e licença. Resultado: pacote do mestre e materiais de jogador derivados da mesma edição.

## Escopo e comportamento

- Gerar documentos/arquivos navegáveis com introdução, cenas, pistas, NPCs e referências escolhidas.
- Separar pacote do mestre, material público de apresentação e handouts dos jogadores; notas privadas do criador não entram automaticamente.
- Incluir versão, licença, atribuições e lista de conteúdos/formato.
- Armazenar artefatos privados por edição e hash, com geração retomável e autorização de acesso.

## Passos de execução

- [ ] Definir composição e naming dos pacotes por audiência.
- [ ] Implementar projeção, geração e validação dos artefatos.
- [ ] Montar prévia e conferência dos materiais.
- [ ] Testar retry, origem removida, formato incompleto e assets privados.

## Critérios de aceite

- [ ] Material do jogador não inclui segredo, resposta de pista ou nota interna.
- [ ] Pacote do mestre contém apenas conteúdo deliberadamente distribuído.
- [ ] Versão e arquivos correspondem à edição aprovada.
- [ ] Falha parcial mantém pacote indisponível e permite retomar sem duplicação.

## Validação

- Inspeção de arquivos com marcadores secretos e conteúdo Unicode.
- Backend/Storage: hashes, versão, acesso direto e repetição da geração.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Master package pode conter segredos para comprador autorizado; o portal da campanha não deve repassá-lo aos jogadores.
- Backup privado atual contém dados demais e não é pacote de venda.

## Não escopo

Reprodução de layout de PDF importado, envio automático a VTT e mapa com tokens.
