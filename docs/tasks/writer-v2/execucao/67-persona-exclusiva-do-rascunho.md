# P1 / M34a — Persona exclusiva do rascunho na preparação

## Problema verificado e objetivo

O validador conta perfis distintos do livro e do rascunho. M31 prepara somente
vínculos salvos e compara sua contagem com o total final, rejeitando um pacote
válido cujo rascunho usa um perfil exclusivo. Corrigir esse pré-requisito antes
de materializar o rascunho como versão separada.

## Contrato e aceites

1. [x] No fechamento book-personas, ler book-draft pela posição estrutural
       penúltima do índice validado; verificar tipo/ID e prova na mesma transação.
       Pacote/normalizador garantem draft seguido por cover, sem consulta por nome.
2. [x] Se o perfil do rascunho já tem definição preparada comprovada, exigir
       igualdade integral. Caso contrário registrar draftProfileId remapeado
       como perfil exclusivo da contribuição; não copiá-lo nem tocar biblioteca.
3. [x] Conferir igualdade exata: definições dos vínculos salvos + contribuição
       exclusiva declarada = total validado. Nenhuma tolerância numérica genérica.
4. [x] Campo opcional de personas em progresso v5–v7 mantém jobs/recibos antigos.
       Não altera inventário v9/v10 ou cria recurso. Descritor não concede acesso.
5. [x] Testes Node/SDK, revisão, documentação/evidência e commit local.

## Continuação obrigatória de M34/P1

Este incremento não recupera texto nem prepara a definição exclusiva.
M34 deve consumir o rascunho e a persona verificados, confirmar sua definição,
preservar metadados e guardar o texto como versão separada quando diferente,
sem sobrescrever salvo ou recriar recurso removido. O registro exclusivo
continua necessário para reconciliar todas as definições antes da raiz.
Rascunho vazio também é contribuição; none não é texto vazio.

Faltam rascunho/capa, integração de personas, campos grandes/consumidores,
certificação/ativação e host/UI/roundtrip/validate. P1/F2-09 e Writer V2 abertos.
Sem API pública, Rule, dependência, crédito, subagentes ou CI/push/PR/deploy.

## Resultado local

93 testes Node distintos e um novo cenário SDK real positivos, com perfil
exclusivo/compartilhado, cancelamento, replay, continuidade até draft e cleanup.
[Evidência M34a](../../../entregas/2026-10-22-writer-v2-persona-exclusiva-do-rascunho.md)
e [ADR 0078](../../../decisions/0078-draft-only-persona-reconciliation.md) registram
resultados e limites. Recuperação do texto permanece na continuação M34.
