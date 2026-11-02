# F2-09 P1 M16 — Validação servidor do contêiner novo

Contrato em 2026-10-22 sobre 81af4b3. M15 foi progresso verificado: núcleo único,
checkpoints e provas Node/cliente/nativas. Sem CI/push/deploy/subagentes.

## Objetivo e sequência completa

Ligar entrada M14, parser continuável e núcleo M15 em validação real no servidor,
sem criar livro. Este passo cobre writer-book-archive v1 integralmente, inclusive
JSON multipartes, histórico/draft/capa e referências. A normalização servidor
de JSON v1–v6 é continuação obrigatória; não declarar P1/F2-09 concluídos.

A sequência permanece: revisão protegida, reserva/upload, integridade, validação
semântica servidor de ambos os formatos, remapeamento/materialização/mídia,
revisão de universo atual e ativação atômica, UI/recuperação/roundtrip/cleanup.

## Descoberta

Grafo consultado primeiro, sem símbolos recentes. Container/Package ainda guardam
offset/chain/contagens em generators; extrair passos/cursor e fazer os generators
usarem esses mesmos passos. Não criar segundo parser permissivo.
Machine M15 já separa itens, raw, relações e finalização em lotes.

## Protocolo e limites

advanceBookRestoreValidation recebe somente restoreId/jobToken/operationId/
expectedCheckpoint. Cada chamada faz uma unidade: quadro, conclusão de JSON
(até 8 MiB), até 64 relações/referências ou conferência final de 16 partes.
Não recebe cursor, DTO, relatório ou prova raw do cliente.

Cursores de framing/pacote fechados/versionados, com offset, chain, contagens,
manifesto/seções/EOF. Sempre derivados dos bytes verificados do servidor.
JSON pendente guarda spans limitados (até 128 partes/8 MiB), não prosa.
Corpo raw guarda SHA serializável privado e cursor/parte/bytes.
Reusar os checks raw/canonicidade existentes, sem perder Unicode/BOM/vazio.

Cada unidade prepara fora da transação final, somente com leituras autorizadas.
Capturar todas as identidades nativas de chunks/provas e índices usados.
Na transação final, reautorizar job/reserva/marcador/raiz ausente, CAS, recibo,
snapshot privado e todas as leituras observadas antes dos writes.
Confirmar índice/checkpoint/progresso/recibo juntos. Concorrência/CAS vencidos
não podem virar rejeição definitiva do arquivo atual.

Índice metadata-only com identidade lógica única e dono/jobToken, valor <=16 KiB;
buffer limitado até 96 efeitos e overlay para read-your-writes. Duplicata de
arquivo difere de replay do recibo. validationItems guarda spans/cursor raw por
item lógico, para materialização futura sem reler o projeto inteiro.

Estados novos: validating/content-verified/content-rejected. Apenas erro de formato
determinístico gera rejeição com razão segura; indisponibilidade/identidade/CAS
falham sem avançar. Content-verified exige framing/EOF, núcleo done e rechecagem
das provas de entrada; não autoriza publicar, vincular universo ou ativar livro.
Cada leitura de materialização futura deverá conferir essas mesmas versões.

## Inventário antes dos writers

Promover cleanupVersion 2 para 3 atomicamente com primeiro estado de validação.
Inventário v3: chunks, validationIndex, validationItems, validationState/current,
integrityProofs, integrityState/current e chave. Fases limitadas a 50 remoções.
Certificar EOF de tudo antes de cancelled; preservar metadados permanentes e
contexto alheio. Estado SHA pode conter entrada e nunca aparece em progresso,
recibo, lista ou log. Rejeição remove seu snapshot; cancelamento continua possível.

Namespaces novos continuam sob Rules recursivas deny de bookRestores; provar SDK.
Manter jobs v1/v2 e recusas explícitas de versões desconhecidas.
Antes de novos DTOs/mídia de preparação, ampliar inventário de novo.

## Arquivos e execução

1. Passos de Container/Package, declarations e regressões.
2. Fonte verificada com observações nativas e checks de metadata reutilizados.
3. Serviço de validação, índice de efeitos e controle/inventário v3; composição.
4. Node: pausa/retomada, equivalência ao validador existente, raw/multipartes/
   fanout, perda de resposta, corrida/CAS, corrupção/ABA, rejeição/cleanup v1–v3.
5. SDK real: índice/state privados, commits atômicos, retomada, conflitos,
   origem alterada, cancelamento e limpeza sem raiz nem dano a outros livros.
6. Cliente/build conforme refactor do parser; revisão/ADR/docs/entrega/commit local.

Sem dependência nova, Storage ou ativação. Legado servidor, preparação e host/
UI/roundtrip/validate completo permanecem necessários em P1.

## Resultado e aceites locais

- [x] Passos/cursor únicos preservam relatório congelado e EOF.
- [x] Núcleo, JSON/raw, relações e fonte privada ligam-se ao servidor.
- [x] Índice/checkpoint/recibo são atômicos e leituras são reconferidas.
- [x] Nascimento nativo vinculado a recibos recusa mutação/ABA.
- [x] Cleanup v3 e Rules deny provados sem apagar outros projetos.
- [x] Regressões dirigidas e evidência/revisão/commit local.

104 Node distintos, 46 cliente, quatro SDK novos/cinco de regressão e 11 cenários
nativos positivos. [Evidência](../../../entregas/2026-10-22-writer-v2-validacao-servidor-do-conteiner.md)
registra lotes e limites; P1/F2-09 continuam abertos.

A callable específica usa timeout 540 s para a unidade máxima limitada,
sem prometer tempo produtivo. Índices imutáveis e checkpoint fixam nascimento
pelos recibos; leitor futuro de validationItems deve conferir o mesmo vínculo.
Leitura tardia de pedido idêntico já confirmado recupera o recibo antes de
reportar erro. Parser/normalização servidor de JSON v1–v6 são a próxima etapa,
sem substituir remapeamento/mídia, ativação e host completos.
