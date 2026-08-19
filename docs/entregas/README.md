# Entregas

Esta pasta guarda a evidência das entregas concluídas. Enquanto
[tasks](../tasks/README.md) descreve o que **será** feito, cada arquivo aqui
registra o que **foi** entregue: funcionalidades, testes e validações
executadas.

Serve para consultar depois o que mudou em uma entrega, sem precisar
reconstruir a história a partir do Git.

## Como usar

- Um arquivo por entrega, nomeado `AAAA-MM-DD-slug-da-entrega.md`
  (ex.: `2026-08-17-cadastro-de-clientes.md`).
- O agente cria o arquivo com a skill `document-delivery`, depois de
  implementar o plano e com `npm run validate` verde.
- Não sobrescreva entregas anteriores. Se a mesma entrega ganhar um
  incremento, acrescente uma seção datada ao arquivo existente.
- Registre apenas resultado real de comando executado; não estime saída
  de teste nem de validação.

## Modelo

O modelo fica em `skills/document-delivery/assets/delivery-template.md` e
tem as seções: objetivo, funcionalidades entregues, critérios de aceite,
arquivos alterados, testes, validações executadas, fora do escopo,
limitações e pendências, e como verificar manualmente.
