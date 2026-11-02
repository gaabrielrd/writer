# P2 — preparação privada das imagens de aventuras

Base: 0fd3a54. Continuação da restauração aprovada, após personas na biblioteca.

## Objetivo e requisitos

Preparar vínculos explícitos (inclusive null), descritores e bytes PNG em unidades
limitadas a um frame de 65.536 bytes, preservando o remapeamento por recurso.
Imagem original repetida em dois recursos não deve ser deduplicada. Manter raiz
sem dono, biblioteca de imagens ausente e personas preparing.

## Sequência e arquivos

1. Acrescentar fases/campos de imagens nos contratos e metadados existentes,
   preservando recibos antigos e cursor de histórico. Registrar endereços privados
   planos em preparedRoot antes de gravá-los; cleanup existente deve abrangê-los.
2. Criar adventureRestoreImageMeta.mjs, adventureRestoreImageProjection.mjs e
   adventureRestoreImages.mjs. Consumir unidades autenticadas e seus raw frames;
   revalidar fonte, job e journals no commit atômico. Conferir imagem com head
   preparado e fonte, vínculo/descritor por uso, SHA final e contagens do manifesto.
3. Bytes persistidos como arrays numéricos, com no máximo 65.536 entradas, para
   preservar hash canônico entre memória e SDK Firestore. Estado de leitura raw
   privado comprovado por journal; não aceitar cursor ou IDs do cliente.
4. Testes Node independentes e corpus nativo do Writer: nulos, duas referências à
   mesma origem, imagem de vários frames, bytes exatos, replay/CAS/rollback,
   cancelamento intermediário, origem/target/journal recriados ou corrompidos,
   contadores e metadados fechados. SDK real deve confirmar representação e cleanup.
5. Revisão/ADR/arquitetura/evidência, checks dirigidos e commit local com hooks.
   Suíte integral no fechamento do bloco de mídia, conforme orientação do operador.

## Suposições, limites e riscos

Nenhuma decisão nova de produto. Limite existente de 16 MiB por imagem mantido.
Não enviar ao Storage, conceder URL, criar imageLibrary/uso, ativar projeto ou
modificar manuscrito nesta preparação. Assinatura/SHA não provam PNG decodificável:
a etapa seguinte deve decodificar integralmente e reservar intenção antes de I/O,
com fence permanente antes da limpeza. Corrida de upload tardio após ativação e
remoção deve ser investigada na integração, sem presumir sua resolução.
Não criar dependência nova ou alterar limites de testes. Continuam obrigatórios
mídia Storage, agregados/auditoria/ativação, recuperação cifrada/UI/roundtrip,
P3/D/F2-09, fases seguintes e gates humanos/comerciais. Macro 8/35 preservada.

## Aceites

- [x] Vínculos e descritores por recurso comprovados; nulos preservados.
- [x] Bytes exatos por frame, cursor privado e commit atômico/replay seguro.
- [x] Cleanup intermediário e recusa de dados sem prova, sem apagar recriados.
- [x] Node, corpus nativo, SDK e checks dirigidos positivos; evidência e commit.
