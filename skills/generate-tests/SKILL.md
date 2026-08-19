---
name: generate-tests
description: Cria ou atualiza testes a partir do comportamento observável de uma feature; use quando o comportamento mudou ou quando falta rede de segurança para alterar o código.
---

# Gerar testes

## Finalidade

Criar ou atualizar testes que cubram o comportamento observável do
código.

## Quando usar

- Ao adicionar ou alterar comportamento.
- Quando a cobertura de um caso relevante está ausente.

## Processo

1. Identifique o comportamento observável a ser testado.
2. Teste o resultado observável, não os detalhes internos.
3. Cubra os casos de sucesso e de falha.
4. Não remova nem enfraqueça testes existentes.
5. Mantenha os testes próximos da feature, na pasta `tests`.
6. Reutilize utilitários de teste já existentes em `src/test`.
7. Execute a suíte de testes (`npm run test`).

## Resultado esperado

- Testes adicionados ou atualizados.
- Resultado da execução da suíte.
