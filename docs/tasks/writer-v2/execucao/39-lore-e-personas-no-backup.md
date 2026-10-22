# F2-09 P1 M6 — Lore próprio e personas usadas

Contrato para implementação em 2026-10-21 sobre e777d97. P1/F2-09 abertos.
Desenvolvimento local, sem CI/push; validate completo no fechamento P1.

## Objetivo e descoberta

Completar a captura salva de lore particular e perfis de escrita necessários ao
livro, capítulos e originais de conversão. Grafo consultado primeiro; snippets
tinham faixas antigas, fontes atuais conferidas. Lore vive em books/{id}/lore;
writers SDK/Admin avançam localLoreVersion na raiz. Personas próprias vivem em
users/{uid}/aiPersonas e não avançam a raiz do livro; presets são contrato puro
em personaProfile. Não há limite demonstrado para número de personas usadas.

## Contrato

Acrescentar lore como recurso raiz do protocolo interno M5 (ainda sem rollout).
Projeção fechada: nome, aliases, categoria, resumo, texto, estrutura conhecida,
relações próprias e flags/datas presentes. Relações conservam IDs/tipo/descrição,
sem available/nome resolvido; nenhuma consulta global. Conferir bookId quando
presente e recusar escopo externo explícito. Não inventar defaults/datas.
Lista e prova nativa existentes cobrem seleção e alterações de cada ficha.

Duas leituras novas: listBookBackupPersonaBindings e readBookBackupPersona.
Scopes fechados book/chapter/scene-source. Lista por ID, até 50 mais sentinela,
retorna todos os proprietários de vínculo, inclusive sem persona (personaId null),
para detectar inclusão de vínculo sem Set crescente. Query seleciona somente
personaComplement ou original.personaComplement; não lê prosa dos capítulos.
Livro singleton usa origem M3b. Campos de manutenção do proprietário são lidos
como metadados e impedem captura intermediária.

Resolver ID somente a partir do vínculo atual autorizado, nunca de um personaId
arbitrário fornecido pelo cliente. Persona personalizada só em users/UID próprio;
preset só na lista pura conhecida. Perfil ausente/malformado falha explicitamente.
Preservar arquivada ainda referenciada: arquivar impede uso futuro de IA, não
destrói perfil próprio necessário à portabilidade. Validar perfil/complemento
pelos contratos puros existentes, projetar campos conhecidos sem credenciais.

Token de item fixa origem, scope/ID, encarnação/versão nativa do proprietário e
perfil personalizado; preset fixa hash do perfil. Recriação com mesmo conteúdo
também invalida. Cursor fechado fixa scope/livro/origem. Todas as transações
reautorizam livro ativo próprio. Perfil em JSON limitado e partes de 64 KiB.

Cliente percorre três scopes; cada vínculo usado emite seu próprio perfil.
Duplicatas entre vínculos são intencionais para evitar Set/catálogo ilimitados;
schema/restaurador futuros deduplicarão com prova de conteúdo idêntico. Envelope
contém schemaVersion/scope/ownerId/personaId/profile, sem UID/tokens. ID de registro
book-persona é SHA-256 de [scope,ownerId]; índice book-personas contém contagens
de proprietários/vínculos. Reenumerar tokens/IDs/ausências e reautorizar origem
no fim, após demais capacidades e antes do selo M2. Não capturar biblioteca alheia
ou não usada, BYOK, chat, grants ou chaves.

## Sequência e arquivos

1. bookBackupResources(.mjs/.d.mts), bookBackupResourceRead e testes existentes:
   adicionar lore raiz/projeção, sem mudar ABI de cenas/narrativa.
2. Novo bookBackupPersonas(.mjs/.d.mts) puro e bookBackupPersonaRead; dispatcher
   index e syntax check Functions. Sem writes/coleções/Rules/dependências novas.
3. book-portability: bookPersonaCallables e bookPersonaCapture; exportação pública,
   reuso de bookSnapshotCapture para hash/partes/sink.
4. Testes Functions/Vitest/SDK: todos os scopes, mais de 50 proprietários, null,
   mesmo perfil em vários vínculos, presets, arquivados, fonte de conversão,
   dono/escopo errado, origem ocupada, alteração/recriação de perfil com raiz
   imóvel, vínculo alterado, hash/cursor/sessão/abort e prova antiga sem selo.
5. Chromium/emulador compõe captura M3b/M4/M5/M6, confere lore, perfis necessários,
   ausência de biblioteca não usada e invalidação externa. Prova do produtor e
   transporte; fixture não equivale a sink persistente/UX final.
6. Checks dirigidos, revisão, ADR/docs/entrega/AGENTS, commit local com hooks.

## Aceites e limites

Preservar prosa/datas de lore próprio e perfil usado sem resolver global.
Detectar mudança de perfil personalizado mesmo sem clock da raiz. Nenhuma
lista/copía da biblioteca inteira, deduplicação ilimitada ou truncamento.
APIs JSON v1–v6 preservadas; formato integral/restauração ainda não ativados.
Mídia, universo autorizado, rascunho explícito, schema/leitor, sink persistente,
revisão e preparação/restauração/cleanup/recuperação continuam em P1.
O marco não fecha uma tarefa ampla adicional nem a fase.

## Resultado local

Implementados lore próprio e perfis por vínculo nos três escopos, com masks,
tokens nativos externos e prova final. Functions final 20/20; cliente 30/30;
seis SDK novos têm prova positiva composta após corrigir a expectativa de
deleção (proibida ao cliente); seis SDK de regressão positivos. Chromium compõe
155 registros e 58 versões em 11 cenários, incluindo perfil alterado/recriado
sem raiz alterada e prova inválida sem selo. Build e checks dirigidos positivos.
Veja [entrega M6](../../../entregas/2026-10-21-writer-v2-lore-e-personas-no-backup.md)
e [ADR 0050](../../../decisions/0050-book-lore-and-personas.md).
P1/F2-09 permanecem abertos; sem CI/push/deploy.
