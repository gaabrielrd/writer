# P1 / M21 — Remapeamento completo da identidade restaurada

## Objetivo

Preparar identidades/referências da nova cópia, consumindo somente o leitor
interno validado M20. Sem mapa de todo o projeto em RAM ou persistido. Marco
necessário à materialização; não conclui P1/F2-09.

## Requisitos e decisões de implementação

- Contexto fixo de versão, jobToken e IDs original/reservado; SHA-256 com domínio,
  tipo e pai quando necessário. Determinístico em novas instâncias, distinto
  entre pedidos/tipos/recursos de mesmo ID em arcos diferentes.
- Mapear atos, capítulos, cenas, lore local, narrativa, histórico, perfis e mídia,
  incluindo referências a recursos removidos. Não criar documentos ausentes.
- Preservar singleton current/unassigned; recalcular IDs derivados de controles,
  referências de cena, vínculos narrativos e envelopes pelo contrato nativo.
- Perfis do mesmo ID já precisam ter conteúdo consistente no núcleo M15.
  Copiar snapshots usados para IDs custom próprios, inclusive presets, sem
  depender da definição atual. Perfil legado ausente continua indisponível;
  sua identidade nova jamais aponta por acidente à biblioteca atual.
- Universo e referências a outros projetos conservam identidade/procedência;
  isso não autoriza vínculo/acesso. Lore local cujo ID parece externo tem
  precedência quando existe no índice validado.
- Não substituir IDs dentro de prosa, metadados textuais, rótulos ou trait IDs.
  Preservar bytes/hash/ordem/ranks/arquivo e histórico original. Datas/revisões/
  ledger serão reconstruídos pelos writers, não tratados como estado nativo.
- Relações de lore são separadas da projeção base e remapeadas em páginas de até
  64, com provas próprias dos índices usados e verify(tx) na escrita consumidora.
  Não acumular provas de todas as relações. Array ausente difere de presente vazio.
- Leitura original continua compatível. Nova capacidade mapped é interna,
  sem endpoint, efeito persistido ou coleção/dependência nova.

## Sequência e aceites

1. [x] Implementar mapper puro e integrar leitura remapeada/relações limitadas.
2. [x] Provar todos os tipos, referências/histórico removidos, Unicode/IDs hostis,
       isolamento/twin determinism, perfis repetidos/presets, ausência e externos.
3. [x] Validar domínio antes/depois da transformação com bytes raw inalterados,
       seis legados, provas/ABA/cancelamento e SDK real no caminho afetado.
4. [x] Revisar diff, documentar evidência/ADR, checks dirigidos e commit local.

## Riscos e trabalho obrigatório seguinte

IDs derivados de referência iguais convergem para uma única relação lógica;
writers devem contar relações distintas e conferir payload antes de deduplicar.
Essa convergência não autoriza mesclar textos ou recursos autorais distintos.
Aumento de tamanho causado pelos IDs novos precisa ser tratado no contrato dos
documentos nativos sem truncar dados ou reduzir o limite do arquivo.

Faltam inventário de limpeza ampliado, escritores nativos com ledger/índices,
personas e mídia sem visibilidade parcial, reautorização/ativação, host/UI/
roundtrip e validate integral de P1. Preservar manuscrito salvo e recuperar
rascunho diferente como versão separada. CI ignorada, sem push/deploy.

## Resultado local

Mapper puro e readMappedItem implementados. 83 Node dirigidos e dois SDK reais
passaram; vetor independente SHA-256 passou no arquivo repetido (15/15).
Perfis legados ausentes são mantidos como indisponíveis, caso separado do pacote
estrito com perfis completos. Nenhum documento de cópia foi criado. Veja a
[evidência](../../../entregas/2026-10-22-writer-v2-identidade-da-copia-restaurada.md).
