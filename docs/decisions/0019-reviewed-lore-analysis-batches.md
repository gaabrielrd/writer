# ADR 0019 — Revisão e aplicação do lore por lote

- Data: 2026-10-11
- Status: aceito

## Contexto

Autores precisam propor fichas a partir do capítulo em edição, sem gravar fatos
inferidos automaticamente nem cobrar cada entidade separadamente. O lore pode
pertencer ao livro ou ao universo compartilhado.

## Decisão

Separar análise, revisão humana e aplicação. O editor captura o texto atual;
serviços produzem JSON validado com evidência literal. O servidor registra
origem, snapshot e expiração. BYOK chama o provedor no navegador; a plataforma
chama o Gemini no servidor reutilizando segredo/modelo de geração já configurados.

Aplicar valida autoria, vínculo, versões e payload e confirma todas as fichas
com débito na mesma transação. Custo fixo de 1 crédito para lote da plataforma;
BYOK zero. O registro fixa o provedor e devolve resultados idempotentes no retry.
Não permite alterar visibilidade, relações ou notas estruturadas pelo lote.
Criações privadas e publicação explícita preservam a revogação existente.

## Consequências

Confirmação humana pode editar sugestões ou rejeitar campos; conflitos de nomes
e destinos não são resolvidos silenciosamente. Alterações concorrentes exigem
nova análise. Limites de tamanho/frequência evitam resposta parcial e abuso de
análises gratuitas. BYOK não é atestado pelo servidor; isso não concede acesso ao
provedor da plataforma e corresponde à capacidade existente de editar lore.

Functions e regras precisam ser implantadas para disponibilizar a capacidade.
A retenção dos registros e custos do provedor são responsabilidade do ambiente.
Detalhes em [atualização do compêndio](../lore-analysis.md).
