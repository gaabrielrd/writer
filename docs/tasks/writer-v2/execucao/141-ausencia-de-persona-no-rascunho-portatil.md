# P1 — ausência explícita de persona no rascunho portátil

## Objetivo e descoberta

Prosseguir o inventário de compatibilidade após o commit local 2097b47 e o
[plano 140](140-roundtrip-dos-livros-com-consumidores-normais.md). Rascunho M8
exige perfil disponível mesmo quando o capítulo já carrega personaAvailability
explícita. A captura não projeta essa metadata; schema de draft/histórico exige
perfil e a máquina rejeita overrides antigos. Isso bloqueia guardar texto próprio.

Grafo consultado e indexação fast falhou no incremento anterior; fallback nos
arquivos reais bookDraftBackupRecords, bookBackupSchema, bookContentMachine,
bookRestoreDraft/Finalize/Personas/Remap e testes existentes. Não há nova pesquisa
externa nem decisão comercial envolvida.

## Contrato antes do código

1. Contribuição local continua explícita, congelada antes de next/await, privada,
   sem autosave ou consulta à existência do capítulo. Projetar somente a metadata
   personaAvailability fechada já definida na ADR 0163, ligada ao mesmo personaId.
   Marca antiga de outro vínculo é omitida; marca malformada falha antes de I/O.
2. Com profile-not-recorded, preservar complemento/valores e persona null, sem
   consultar biblioteca/preset por coincidência. Isso é ausência declarada de
   conteúdo próprio, nunca grant. Prova final ainda reautoriza raiz/origem.
   Sem marcador, perfil indisponível continua falhando conforme M8.
3. Com legacy-overrides, capturar e revalidar perfil próprio pelo mesmo endpoint,
   conservando valores antigos e snapshot. Não transformar erro de rede/permissão
   em ausência, nem sintetizar perfil.
4. Schema aplica o mesmo contrato de identidade/marcador a book-draft e
   work-version.draft. Ausência exige persona null e marca correspondente;
   overrides antigos exigem perfil real. Vínculos sem marca permanecem estritos.
5. Máquina semântica registra warnings reais também no draft e nas versões
   recuperadas que contêm essa metadata. Registro global de perfil só para draft
   atual disponível, conforme contrato existente; histórico mantém snapshot próprio.
   Contagem não cria perfil/binding para ausência.
6. Restauro normal conserva marca/complemento/datas/texto no histórico, remapeando
   ID neutro. Não sobrescrever/recriar manuscrito nem instalar perfil ausente.
   Recaptura e nova restauração continuam válidas com os mesmos avisos.
7. Sem novo endpoint, namespace, dependência, Rules ou alteração na normalização
   v1. O formato local novo admite metadata opcional; leitores antigos recusam.
   Migração/certificação de raízes v1 e inventário geral continuam pendentes.

## Arquivos e sequência

- [x] Cliente bookDraftBackupRecords e testes: metadata, ausência, vínculo novo,
      validação fechada, snapshot e reautorização.
- [x] Schema/máquina e testes Node: perfil null/real, overrides, recusas e warnings,
      inclusive histórico e retomada.
- [x] Roundtrip dirigido com serviços normais: texto vazio/removido e metadata
      ausente/overrides preservados por duas cópias privadas.
- [x] Checks dirigidos, revisão, ADR/docs/evidência/AGENTS e commit local.

Arquivos previstos: functions/src/bookBackupSchema.mjs e bookContentMachine.mjs;
src/features/book-portability/services/bookDraftBackupRecords.ts; testes já
existentes dessas capacidades e harness de roundtrip. Declaração de tipo do
marcador reutilizada, sem acoplar o domínio Chapter a serviço de portabilidade.

## Riscos e validação

Marcador não prova autorização nem disponibilidade. Não consultar o perfil ausente
é essencial para não adotar conteúdo diferente após roundtrip. Ramo disponível
conserva token/hash e falhas M8. Testar troca de ID, marca forjada/malformada,
snapshot antes de await, perfil real com marca de ausência recusado, trait antigo
sem marca recusado, histórico autorreferente e warnings em checkpoint retomado.

Somente testes necessários durante ajuste; validate no fechamento de P1.
Sem CI, push, PR, merge, deploy ou subagentes. P1/F2-09/V2 e fases 3–5 permanecem
abertos; este incremento não substitui inventário/coleta/rollout ou gates humanos.
