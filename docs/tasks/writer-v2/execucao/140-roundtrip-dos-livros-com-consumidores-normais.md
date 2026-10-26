# P1 — roundtrip de livros com consumidores normais

## Objetivo e descoberta

Prosseguir [P1](31-portabilidade-de-livros.md) e os aceites restantes do
[plano 139](139-restauracao-de-livros-no-estudio.md), após os commits locais
221e7c7/3564d35. UI já foi provada até ativação/limpeza; falta conferir recaptura
com as APIs normais, sem usar leitores internos da preparação como substitutos.

Grafo consultado primeiro; tentativa de atualizar writer-v2 em modo fast falhou
com worker crashed on a file. Descoberta segue pelos arquivos reais, sem tratar
índice vazio como ausência de capacidade.

StreamBookBackup recebe ports de estrutura/recursos/personas/universo/draft/
capa/lore e histórico. Os serviços Functions normais e cliente lógico de lore
podem ser ligados por adaptadores de teste finos. StreamWorkHistoryBackup
preserva versões de recursos removidos. Restauro deve usar os clientes já
implementados e protocolos reais, sem inserir raízes/índices diretamente.

## Contrato e critérios

1. Ativar fixture atual representativa com todos os grupos, finalizar mídia e
   limpeza, capturar pelo stream normal, validar pacote/conteúdo e restaurar
   novamente por start/upload/preparação/revisão/ativação. Recapturar a segunda
   cópia e comparar dados lógicos remapeados, preservando prosa/bytes/datas
   particulares e os defaults nativos documentados.
2. Conferir IDs distintos/relacionamentos locais, cena ativa/arquivada/sem pai,
   fontes originais, narrativa/data livre, lore/aliases/relações, personas,
   progresso, versões de recursos removidos e rascunho convertido em versão.
   Capa usa bytes próprios autorizados; nunca URL do arquivo.
3. Casos para modo padrão e modo indexado injetado, incluindo corpo de lore
   grande, sem habilitar flag global. Recaptura não serializa stubs de payload.
   Sem acesso ao universo, não copiar prosa global nem labels resolvidos.
4. JSON v1–v6 devem chegar a cópia privada e backup atual normal, preservando
   ausências/avisos e sem inventar histórico/progresso/capa. Conferir ao menos
   extremos v1/v6 no fluxo integral; ampliar para demais versões compatíveis.
5. Ler/editar recursos por serviços normais após restauração; histórico e contagem
   devem acompanhar as mutações. Recibos históricos não concedem conteúdo após
   exclusão/revogação. Escrita não deve restaurar texto antigo silenciosamente.

## Sequência

- [x] Fixture/ports de teste com serviços normais e stream real.
- [x] Roundtrip atual, comparação lógica e mídia/histórico/rascunho.
- [x] Compatibilidade JSON legada e corpo indexado grande nos cenários descritos.
- [x] Escrita/leitura normal e regressões das falhas encontradas.
- [x] Evidência, revisão/checks e commit local deste incremento.

## Limites

Testes dirigidos não substituem inventário completo de namespaces/escritores/
exclusão/coleta, migração/certificação legada, rollout coordenado ou validate global
de P1. Esses itens continuam obrigatórios, assim como fases 3–5 e condições
humanas/comerciais. Identidade/banco/storage em memória não provam produção.
Sem CI, push, PR, merge, deploy, dependências novas ou subagentes.

## Falha observada e ajuste antes do código

A recaptura real falhou ao tentar serializar narrativeControls/entity-scenes.
Esse documento é controle do índice derivado, criado pela preparação normal;
não é sequência autoral nem item portátil. A listagem deve omitir apenas esse
ID reservado, conservando os demais controles e a paginação completa.

Ler no máximo limit+2 documentos metadata para esse grupo (um único reservado)
e selecionar limit+1 itens portáteis antes de calcular cursor/hasMore. Outros
grupos mantêm limit+1. Não filtrar desconhecidos, truncar páginas ou tratar
controle malformado como ausência. Sem alterar schema/contrato do arquivo.

Comparação do roundtrip usa a reconstrução de datas nativas já documentada no
plano 55, derivada do timestamp certificado da preparação/ativação/mídia. Não
ignora datas de histórico, perfis, capa ou lore indexado; elas permanecem literais.

## Contrato da ausência de persona antes da correção

A normalização legada preserva complementos sem perfil/traits conhecidos com
aviso (plano 45). A fonte v5/v6 mantém a identidade neutra remapeada, mas a
recaptura atual exige um perfil inexistente. Não fabricar perfil, remover vínculo
ou usar preset/biblioteca por coincidência.

Adicionar metadata portátil opcional personaAvailability no dono (book/chapter/
original de fonte): schemaVersion 1, personaId e reason profile-not-recorded ou
legacy-overrides. O ID continua neutro e é remapeado junto ao complemento.
Não contém perfil, chave ou grant. Perfil ausente não gera book-persona;
perfil disponível com overrides antigos mantém snapshot e valores originais.

Schema valida marcador fechado/vínculo. Máquina semântica só aceita ausência/
traits antigos explicitamente marcados, mantendo recusas anteriores sem marcador.
Warnings opcionais atuais contam a ausência real; checkpoints antigos sem esses
campos permanecem válidos. Novos normalizadores usam cursor v2; v1 mantém saída
literal/hash/protocolo anteriores em replay. Sem novo namespace, job ou endpoint.

Produção nativa preserva o marcador em metadata própria, e captura normal o
projeta. Perfil ausente nunca passa a disponível por coincidência de ID.
Marcador de vínculo antigo não é propagado quando o dono escolhe outro ID; esse
novo vínculo continua sujeito à autorização normal. O formato ainda local aceita
o campo opcional novo; leitores antigos devem recusá-lo, sem interpretação parcial.

Na exportação JSON antiga, projeção das fontes deve omitir somente o marcador
novo, sem mutar a fonte em memória. Esse formato não suporta o campo; o leitor
legado v2 reconstrói a ausência/overrides pelo catálogo real. Backup completo
novo conserva a marca explícita. Texto, complementos e valores permanecem.

## Resultado local parcial

16 Vitest distintos, 109 Node distintos, dois SDK e sete verificações Chromium
positivos em seleções. Ver [ADR 0163](../../../decisions/0163-portable-persona-absence-and-native-roundtrip.md)
e [evidência](../../../entregas/2026-10-25-writer-v2-roundtrip-normal-dos-livros.md).
Não equivale a inventário/rollout ou validate global. Fontes antigas v1 sem marca
não ganham reparo automático; rascunho explícito com perfil indisponível conserva
contrato estrito do plano 41 e precisa de compatibilidade no inventário seguinte.

## Estado técnico atualizado — 2026-10-26

141/144 resolvem a metadata explícita até o rascunho/editor; o
[fechamento 146](146-inventario-e-consumidores-dos-livros-restaurados.md) consolida
inventário, ciclo dos consumidores e validate local de P1. Estados internos
antigos não são migrados por inferência; revisão operacional antes de rollout
e demais P2/P3/D/fases/gates continuam.
