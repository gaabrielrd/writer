# P3 — Ciclo de variantes com relações não resolvidas

- Data: 2026-10-29.
- Base: 74345da; etapa B de [224](224-corpos-de-variantes-com-relacoes-opacas.md).
- Estado: implementado e validado localmente; restauração persistente/C4 pendentes.

## Resultado esperado

Uma variante restaurada conserva chaves de relações sem descritores ao ler,
editar, retirar/restaurar, adotar uma base e gerar novo backup. Somente escolher
explicitamente um alvo atualmente autorizado resolve a relação. Descartar a
variante é a ação explícita que retorna à base. Nenhuma operação muda o original.

## Contrato e tarefas sequenciais

1. Codec puro privado portable-relations-v1 em bodyCodec do overlay. Ausência
   conserva JSON nativo; presença nula/desconhecida ou sem modo override falha
   fechada antes dos corpos. Validar entidade usando entityInput injetado, sem
   ciclo de importação. Corpo canônico preserva relações true com descritores
   e false apenas com chave/estado; máximo 50 e 900.000 bytes.
2. Integrar overlayRecord/bodyPlan/readVariantEntity/projectEntity. A entidade
   do cliente permanece fechada e nativa; projeção ignora false sem consultar
   alvo. Save primeiro valida pedido selado, relatedKeys e autorização; depois
   mescla chaves false do override anterior, conservando ordem e texto. Seleção
   explícita da mesma chave resolve; excesso falha sem escrita/truncamento.
3. Remove/restore preservam codec/corpo/binding. Discard limpa o codec.
   C3 keep-local preserva corpos inclusive em armazenamento anterior e após
   adoção de base nativa; use-candidate/discard-local retiram o codec.
   Ambas as verificações de relações da adoção ignoram false antes de consultas.
4. Selecionar/conferir bodyCodec nos masks/tokens de armazenamento e backup,
   antes do corpo; comparar presença/valor ao reler metadata. Reexportar false
   privado como available false/unresolved true em conteúdo v3; conhecidos
   continuam com autorização atual. Não serializar bodyCodec no arquivo.
5. Testes de comportamento com corpos/chunks/hash reais e API selada nativa:
   edição, resolução explícita, limites sem escrita, leitura sem lookup, modos,
   corrupção, remoção/restauração/descarte, adoção e arquivo assinado/revisado.
   Regressões dirigidas C2/C3/backup; ESLint, sintaxe e checks documentais.
6. Revisar diff, ADR/AGENTS/arquitetura/evidência e commit exclusivamente local.

## Critérios e limites

Texto editado e relações conhecidas seguem a ordem nova; false anteriores
mantêm ordem relativa e posição quando só o texto muda. Relações false não
ganham labels nem acesso quando um alvo surge. Entrada cliente não aceita
bodyCodec ou available; não reconstruir IDs de origem a partir de hashes.

Primeiro save em modo base conserva o contrato da ficha inteira de 223; a
base original permanece intacta. Este codec não concede autorização: overlay,
binding, fonte/âncora e acesso atual continuam obrigatórios. Falhas não apagam
rascunhos ou corpos anteriores. Sem endpoints, dependências ou produtor de
restauração persistente. Interface futura deve informar omissões da restauração.

Depois: inventário/cleanup C4 v1–v4 antes de upload/retomada, remapeamento,
materialização/ativação e Estúdio/ciclos. Validate integral no fechamento desse
bloco de leitores/cleanup; testes dirigidos durante ajustes. Macro 8/35,
P3/D/F2-09 e demais fases continuam abertos. Sem agentes/CI/push/PR/merge/deploy.
Preservar o servidor manual e o checkout master.

## Detalhe de preservação na mescla

Uma chave pode ter descritor conhecido e declaração false no mesmo corpo.
Reenviar o descritor conhecido sem mudança não significa resolver a outra
relação. A mescla compara ocorrências dos descritores anteriores: somente
um descritor novo para a chave pode substituir as declarações false.
Reenviar uma ficha apenas com texto alterado preserva também esse caso misto.
O alvo do descritor novo continua sujeito à autorização e ao pedido imutável.

## Resultado local

Codec e ciclo completo implementados nos serviços internos. Preservação de
chaves/ordem, resolução por descritor novo autorizado, limites e falha sem escrita
provados por API nativa selada; remoção/restauração/descarte e escolhas C3 também.
Backup assinado/revisado preserva unresolved true mesmo com alvo disponível.
41 novos e 627 regressões positivos (668/668); ESLint dirigido e sintaxe de 450
módulos Functions positivos. Limites e correção do ensaio de binding registrados
na [evidência](../../../entregas/2026-10-29-writer-v2-ciclo-das-variantes-portateis.md).

Esta etapa B fecha o ciclo interno previsto em 224. Inventário/cleanup C4 v1–v4
é o próximo incremento, antes de qualquer produtor de restauração. Sem interface
nova, SDK ou validate integral neste incremento; macro 8/35 permanece aberta.
