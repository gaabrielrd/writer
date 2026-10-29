# Writer V2 — auditoria conjunta do backup de campanhas

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 211](../tasks/writer-v2/execucao/211-auditoria-conjunta-do-backup.md).
- Decisão: [ADR 0241](../decisions/0241-campaign-backup-joint-native-audit.md).
- P3/D/F2-09 e macro 8/35 abertos; somente commit local.

## Implementado

A conferência servidor agora reúne próprios, base congelada, variantes,
âncoras antigas, vínculos físicos e PNG por geração exata na mesma auditoria.
Todas as famílias são repetidas desde o início, incluindo páginas vazias,
controles por sessão, cobertura de corpos e sonda de órfãos. Hashes e provas
nativas são comparados antes de devolver um resultado final.

A origem indisponível não impede conferir o texto próprio. Derivados permanecem
explicitamente indisponíveis, sem leitura de Storage ou promoção para notas.
Somente progresso sem prosa/paths é emitido durante a execução; interrupção
impede a conclusão e descarta resultados tardios após o I/O em andamento.

O serviço usa os leitores reais e hashes incrementais. Não armazena índice ou
texto do projeto inteiro. A prova interna não é arquivo nem assinatura.

## Arquivos

- functions/src/campaignBackupAudit.mjs e teste dedicado.
- Helpers de adoção/lore aceitam assets opcionais, preservando os padrões.
- Fixture de imagens separa a criação do bucket/PNG de sua campanha de teste.
- Teste anterior de revogação foi reforçado: caminho da aventura vem de
  campaign.provenance e a mutação precisa completar antes da recusa.
- Plano, ADR, arquitetura, regras e progresso atualizados.

## Testes e validações reais

Conjunto Node dirigido passou: 116 testes, saída 0, 2.371,3623 ms:

- 22 da auditoria conjunta nova.
- 23 de imagens de campanha, incluindo a revogação reforçada.
- 28 dos leitores de lore/âncoras.
- 25 do inventário físico de lore.
- 18 da adoção de bases.

Vitest do consumidor de imagens passou: 38 testes, saída 0, 3,23 s.
O fixture compartilhado foi alterado; os cenários do consumidor foram repetidos.

Casos incluem campanha rica com notas/sessões/checklist/pistas/missões/referências,
lore multichunk e PNG; duas auditorias estáveis; S2 após a primeira passagem
sem mudança da âncora; regravação nativa idêntica; corrupção/ausência/órfãos;
origem revogada e próprios; adoção com binding antigo; removed; pai de loja
ausente; versão Storage mais nova/antiga ausente; metageneration entre passes;
30 notas e 28 lojas, com singleton legado varrido uma vez por passagem;
C4, conta, token obsoleto, mutação no portão final; abort/return/throw durante
hash pendente, cancelamento antes do primeiro pull e ausência de prefetch.

O cenário rico usa uma porta que recusa escritas e leitura integral de
documentos, exigindo máscaras e queries limitadas. Antes/depois do banco
permaneceram iguais. Progresso/prova não expõem prosa, path ou geração.

A primeira execução encontrou IDs incorretos no preparo do cenário rico; a
fixture foi corrigida para usar provenance.adventureId. O teste S2 também
precisou usar um alvo distinto e o ID exigido pelo escritor. Essas falhas eram
da preparação dos testes, corrigidas sem enfraquecer a comparação final.
Lint inicial dos seis arquivos aplicáveis passou, saída 0.

## Limites e reprodução

Sem interface, endpoint, nova persistência, Rules, dependência, segredo ou
escrita Storage. O teste usa produtores C1/S1/S2/S3/C2/C3 e banco/bucket em memória;
corrupções e escritas entre passagens são injetadas nos cenários específicos.

Node pode reproduzir a suíte campaignBackupAudit.test.mjs. A prova retornada é
nativa e efêmera; não habilita download ou restauração. Nenhum manifesto/atestado
portátil foi emitido. Faltam framing, arquivo, persistência/cleanup e UI/ciclo.

Validate integral permanece para o fechamento do grande bloco P3. Nenhuma
validação remota, CI, push, PR, merge ou deploy foi executada. Não houve alteração
de frontend de produção; typecheck/build/navegador não foram repetidos aqui.

## Revisão final local

Lint final dos seis arquivos de código passou, saída 0, sem avisos.
Sintaxe do módulo conferida; check:architecture e check:docs passaram, saída 0.
Formato aplicado somente aos 15 arquivos do incremento. Revisão conferiu
ordem/escopo das duas passagens, fronteira dos serviços nativos, páginas vazias,
limites de memória e interrupções. Nenhum bloqueador pendente na auditoria interna.
Nenhum resultado foi usado como prova de arquivo, atestado ou conclusão de P3.
