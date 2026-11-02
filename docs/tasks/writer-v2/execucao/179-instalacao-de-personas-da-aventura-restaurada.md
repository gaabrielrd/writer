# P2 — instalação de personas da aventura restaurada

Base: 7d07ec6. Escopo aprovado de integração dos snapshots privados de 174 à
biblioteca, usando origem v2 e prova de disponibilidade de 178.

## Requisitos e sequência

1. Após universe-ready, percorrer somente definições de persona comprovadas em
   preparedRoot, por uma unidade limitada. Instalar snapshot portátil exato com
   ID remapeado próprio e restoreOrigin v2; preservar presets capturados como
   snapshots, arquivo/datas/revisão/traits e overrides dos bindings existentes.
   Perfil único é instalado uma vez, não uma vez por binding.
2. Ampliar endereço/journal para aiPersonas do UID antes de qualquer escrita;
   strict create recusa mesmo documento idêntico existente. Profile/journal,
   lote preparing, checkpoint e recibo confirmam juntos.
3. Criar lote nativo na primeira unidade, inclusive zero perfis. Estado/cursor/
   quantidade são privados/limitados e conciliados com personaProfiles. Validar
   origem, namespace, nascimento, primeiro/último recibo e hash atual do lote.
4. Conservar recibos antigos e metadados anteriores, com fases persona-library
   e persona-library-ready; expor somente quantidade instalada e revogação.
   Cursor pertence ao host. Não habilitar persona ou aventura prematuramente.
5. Primeiro avanço de cleanup revoga lote pelo recibo de limpeza antes dos
   deletes. Cada perfil requer lote cancelado e journal/prova próprios. Conservar
   batch/recibos cancelados como fences; confirmar ausência limitada de perfis
   desse contexto no fim. Jobs sem instalação também recusam namespace órfão.
6. Testes Node/native Writer e SDK demo: snapshots/dedupe/null/zero, replay/CAS/
   retry/rollback, contagens/cursor inválidos, contexto e perfis/journals/lote
   ausentes/adulterados/recriados, cancelamento parcial e biblioteca preexistente.
   Exercitar leitores de disponibilidade/IA/backup e permissões reais.
7. Checks dirigidos e revisão/ADR/docs/evidência. Fechar o bloco de universo e
   personas 177–179 com npm run validate local antes do commit com hooks normais;
   sem CI ou envio remoto.

## Não escopo e riscos

Ativação do lote com a raiz somente na futura ativação auditada; não criar esse
endpoint ou tratar persona-library-ready como autorização. Mídia, agregados/
audit/ativação, recuperação cifrada/UI/roundtrip, P3/D/F2-09 e fases seguintes
continuam obrigatórios. Não duplicar original, adotar perfil da biblioteca por
coincidência ou excluir documento que perdeu sua prova. Contadores monotônicos
preservam replays durante cancelamento; batch cancelado não é apagado.
Não há nova dependência nem decisão de produto pendente.

## Aceites

- [x] Perfis únicos exatos na biblioteca, indisponíveis até ativação.
- [x] Operação limitada/atômica com origem v2, lote e provas nativas coerentes.
- [x] Cancelamento revoga antes de deletar e preserva existentes/recriados.
- [x] Testes/checks dirigidos e integrais, revisão/docs/evidência; commit local
      registrado no histórico Git deste incremento.

Macro 8/35 e gates humanos/comerciais permanecem abertos.
