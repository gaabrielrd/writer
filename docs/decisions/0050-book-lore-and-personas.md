# ADR 0050 — Lore próprio e personas por vínculo no backup

- **Estado:** adotado localmente em 2026-10-21, sem deploy.
- **Contrato:** [M6](../tasks/writer-v2/execucao/39-lore-e-personas-no-backup.md).

## Decisão

Acrescentar lore raiz ao protocolo interno M5, ainda sem rollout. Passa a doze
tipos. Preservar campos próprios presentes, estrutura conhecida e relações por
ID/tipo/descrição; descartar available, nomes resolvidos e campos desconhecidos.
Recusar bookId incompatível e escopo externo explícito. Não resolver nem copiar
lore global, não inventar datas/defaults. Reusar paginação/prova nativa M5.

Personas personalizadas pertencem à conta e seus escritores não avançam o livro.
Criar listBookBackupPersonaBindings/readBookBackupPersona para três escopos
fechados: livro, capítulo e fonte original de conversão. Reautorizar livro próprio
ativo em cada transação; resolver persona pelo vínculo atual, nunca por personaId
arbitrário de entrada. Ler somente users/UID/aiPersonas ou preset puro conhecido.

Listar até 50 proprietários mais sentinela por ID, incluindo vínculo ausente.
Máscaras selecionam complemento/flags, sem prosa. Perfil personalizado contribui
somente identidade nativa na lista; corpo é lido e validado separadamente em partes.
Token fixa origem, endereço, identidade nativa do proprietário e do perfil;
preset fixa hash do perfil puro. Recriação com mesmo corpo invalida token.

## Portabilidade e limites

Capturar perfis arquivados ainda referenciados: arquivar restringe uso de IA,
mas não retira dados próprios necessários ao backup. Perfil ausente/malformado
falha explicitamente. validatePersona/validateComplement conferem contratos puros;
projeção fechada preserva os valores textuais armazenados, sem chaves ou BYOK.

Emitir um perfil por vínculo, sem Set crescente ou listagem da biblioteca inteira.
Repetição é intencional: schema/restaurador futuros deduplicarão com conferência
de conteúdo. Registro book-persona usa SHA-256 de [scope,ownerId]; envelope mantém
scope/ownerId/personaId/profile. Índice book-personas guarda totais de
proprietários e vínculos por escopo. Prova privada reenumera ausências e tokens
depois das demais seções, reautoriza raiz e antecede selo M2.

Nenhuma escrita, coleção, Rules, dependência, crédito ou permissão nova.
SDK continua proibindo excluir persona; prova de recriação usa Admin.
A [entrega](../entregas/2026-10-21-writer-v2-lore-e-personas-no-backup.md)
separa evidência Functions/cliente/SDK/nativa de UI/sink/restauração ainda
pendentes. Projeção não substitui schema semântico integral ou autorização de
universo/mídia. P1/F2-09 abertos, desenvolvimento local sem CI/push.
