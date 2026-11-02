# P2 — personas usadas pela aventura no backup privado

Base: f21db1c. Capturar perfis efetivamente vinculados à aventura e às cenas.
Blocos herdam cena; não criar terceira configuração por bloco. Texto das
instruções é autoral do perfil; credenciais/provedor/modelo/chat não entram.

Grafo consultado sem resultados; fallback em editorChatContext/Read/Contracts,
personaProfile/Availability e bookBackupPersonaRead/Personas. Setter nativo de
cena não muda raiz: prova própria do vínculo é indispensável. Perfis custom
legados têm IDs alfanuméricos/hífen que nem sempre começam com custom-;
resolver nativo aceita esses IDs. Não copiar restrição indevida por prefixo.
Perfil arquivado é conteúdo próprio preservável, embora não esteja habilitado
para geração. Perfil restaurado de livro exige lote/recibos ativos pelo helper
readAvailablePersonaMetadata antes de abrir prosa.

## Contrato antes do código

Leitor específico listAdventureBackupPersonaBindings/readAdventureBackupPersona,
scope adventure ou scene; raiz singleton e cenas físicas paginadas N+1 até 50.
Input/cursor fechados, fonte 147 e índices/IDs/tokens capturados antes de awaits.
Máscara de vínculo inclui owner/schema/flags e personaId ou personaComplement,
sem título/prosa. Reautorizar cena schema 1/owner e raiz a cada operação.

Binding ausente/null gera descriptor personaId null e nenhuma consulta de
biblioteca. Complemento usa validateComplement nativo: traits antigos válidos
não são descartados nem cruzados por nome. Vínculo neutro já capturado em 148/
149 permanece literal. Não fabricar profile-not-recorded retroativo nem resolver
ID perdido por outra biblioteca: perfil declarado ausente/indisponível falha,
como captura completa de livros sem marker explícito. Futuro restore do formato
novo terá perfis registrados; tratamento de legado sem perfil exige contrato
explícito, não fallback de geração.

Preset recebe hash de definição pura. Outro ID válido é consultado somente em
users/UID/aiPersonas/ID por readAvailablePersonaMetadata. Não listar biblioteca.
Metadata de autorização do perfil/lote é conferida antes de ler prosa; somente
perfis de lote ativo são elegíveis. Token do item liga fonte/UID/ID/scope,
identidade nativa do vínculo e do perfil ou hash do preset. Mudanças do vínculo
de cena, edição/remoção/recriação do perfil e revogação bloqueiam continuidade.
Disponibilidade é revalidada em toda unidade, sem cache autoritativo.

Extrair projeção pura fechada de perfil do bookBackupPersonas para
portablePersonaProfile, compartilhada porque há dois domínios concretos.
Manter exportação antiga por alias e bytes/contrato do livro idênticos.
Não reutilizar DTO de livro ou seus IDs como aventura por cast.

Novo DTO próprio schema 1/kind persona/scope/bindingId/personaId/profile.
Profile conserva campos autorais declarados/traits/revision/archive/datas, com
validação pura sem normalizar o valor emitido. Excluir restoreOrigin, owner,
recibos, chaves, provedor e extras inclusive por trait. Read usa projeção
conhecida do documento autorizado, com mesma identidade nativa da metadata.
Faixas UTF-8 64 KiB/hash integral; ausência de vínculo não inventa perfil.

## Sequência e validação

1. Extrair projeção neutra preservando serializer público do livro.
2. Serviço específico com fonte/prova de vínculo/perfil e autorização ativa.
3. Produtor real de vínculo root/cena; presets/custom/ID legado/arquivado,
   null/ausência, >50, unknown traits, bytes/segredos fora, sem biblioteca/prosa
   na lista; mudança/ABA de binding/perfil e conta/schema/flags.
4. Prova de lote restaurado ativo/cancelado/pendente antes de abrir instruções;
   intenção capturada, cursor/índice, falha/retry e nenhuma escrita.
5. Node dirigido/regressões do serializer e disponibilidade; SDK real, lint/
   sintaxe/docs/arquitetura/styleguide/format/diff. Validate no fechamento P2.
6. Revisar, ADR/evidência parcial e commit local; depois mídia/selo/pacote/
   revisão/restore/UI/roundtrip. Sem CI/remoto/deploy/subagentes.

## Aceites

- [x] Perfis efetivamente usados por aventura/cena, sem biblioteca inteira.
- [x] Provas/autorizações nativas revalidadas; herança e valores preservados.
- [x] Projeção neutra com compatibilidade binária do serializer de livro.
- [x] Testes/SDK/checks, revisão/docs/commit; P2 integral continua aberto.

## Resultado dirigido e revisão

50 Node positivos (22 novos + 28 regressões), sem skip, em 378,7042 ms.
Dois SDK positivos em 9.194,0748 ms com 52 cenas, setters reais e prova de
lote ativo/revogação antes da prosa. Fixture inicial corrigida para contrato
real do setter e vínculo válido antes de edição que remove trait; histórico
de tentativas preservado na evidência.

Vetor do serializer de livro antes/depois permanece
1040cf51cf5789c2048c83acd243750c1684a3289daeffd74e87600b55c08794.
Lint dirigido positivo; checks finais acompanham commit.
[ADR 0177](../../../decisions/0177-adventure-backup-used-personas.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-personas-no-backup-de-aventuras.md).
Revisão confirma projeção pura sem cast do DTO e revalidação de autorização.
Mídia/pacote integral/restore/UI/roundtrip e validate P2 continuam abertos.
