---
name: update-documentation
description: Realinha docs/ ao código e registra decisões como ADR; use após mudanças em comandos, variáveis de ambiente, arquitetura, funcionalidades ou integrações.
---

# Atualizar documentação

## Finalidade

Manter a documentação em `docs/` coerente com o estado atual do
código.

## Quando usar

- Após mudanças que afetam comandos, arquitetura ou funcionalidades.
- Após decisões relevantes de projeto.

## Processo

1. Verifique se os comandos documentados continuam corretos.
2. Verifique as variáveis de ambiente e o `.env.example`.
3. Verifique se a arquitetura descrita reflete o código.
4. Atualize a descrição das funcionalidades alteradas.
5. Registre limitações conhecidas.
6. Registre decisões relevantes como ADR em `docs/decisions`.
7. Atualize a documentação de integrações externas.
8. Se o `README.md` também saiu do lugar, use `update-readme`.
9. Se a mudança criou ou revogou uma regra, use `update-agents`.

## Resultado esperado

- Lista de documentos atualizados.
- Resumo do que mudou em cada um.
