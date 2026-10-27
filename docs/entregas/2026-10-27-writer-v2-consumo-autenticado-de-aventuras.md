# Writer V2 — consumo autenticado e remapeamento de aventuras

Data: 2026-10-27. Base: 6d50d3d.
[Plano 171](../tasks/writer-v2/execucao/171-consumo-autenticado-e-remapeamento-de-aventuras.md)
e [ADR 0193](../decisions/0193-adventure-verified-consumption-and-remap.md).

## Implementado

Factory interna reconstitui o relatório do snapshot autenticado e compara
summary/reportHash/fonte. Cada item é autenticado ao ser consumido, por ordinal,
shape, contexto, operação criadora, nascimento e hash. JSON relido corresponde
ao SHA/posições aprovados. Não varrer todo o arquivo para abrir uma leitura.

Cada resultado oferece verify(tx), obrigatório na transação consumidora antes
das escritas. Reconfere job, snapshot, item e provas das partes lidas.
Mapeamento/metadata retornados são imutáveis; alteração de bytes retornados
impede a prova de consumo. sourceToken não é credencial de escrita/acesso.

Histórico, draft e imagens têm leitura por frame: payload até 64 KiB, ranges de
framing até 80 KiB, prefixo SHA/UTF-8 privado, bytes/partes/layout conferidos.
raw-content-complete só após SHA integral; passos anteriores são raw-part-only.
Vazio conserva um frame explícito. PNG verifica assinatura/manifesto, sem alegar
decodificação de pixels. Prefixos persistidos exigem autenticação do host futuro.

Remapper próprio separa job/origem/destino/tipo/parent; IDs nativos cabem em 80.
Cobre as 17 famílias de recursos, partes, lore/relações, personas, histórico/draft
e imagens. Recalcula referências/ordens/links, preserva origem de universo e
referências externas para autorização posterior. Imagem é por asset/uso:
a mesma imagem original usada em cena e bloco produz cópias distintas e coerentes.

identity-projection-only não é novo backup validado. sourceOnly e sourceBindings
preservam provas de entrada; stagers posteriores devem reconstruir provas nativas.
Não ativa projeto, cria ownerId, materializa Storage/biblioteca ou concede grants.

## Testes dirigidos

Nove Vitest distintos positivos em seleções com arquivos produzidos pelo Writer:
todos os JSONs mapeados mantêm a prova original; referências de cenas/corpos/
personas concordam; leitura raw reabre em novas factories preservando SHA e
continuação UTF-8; vazio/histórico/draft/imagens, UID/token/índice, alteração/
recriação de fonte/prova/item/estado, cancelamento, cursores cruzados e mutabilidade.

Seis Node de remapeamento positivos (122,149 ms total dirigido), incluindo todas
as 17 famílias, chaves nativas, relações próprias/externas, origem neutra,
isolamento por destino/job/tipo/parent e captura de intenção antes de awaits.

Sete Node de raw positivos na seleção final (112,824 ms), incluindo UTF-8 dividido
ou inválido, SHA divergente, PNG/limites, vazio, estado/cursor corrompido ou cruzado,
reuso após término, abort, short read, tamanho mutável e reordenação de mapas
privados. Casos inválidos usam o motor de hash real, não apenas stub que rejeita.

Três SDK reais distintos positivos no Firestore 1.22.0 demo local, total
164.460,707 ms: consumo JSON/raw antes de escrita atômica, recusa de fonte/prova/
estado/item alterados ou recriados sem escrita parcial, rollback e cancelamento.
Nenhum projeto de produção foi acessado.

O cenário consumidor foi repetido após a correção de imutabilidade (35.336,941 ms)
e refinado para armazenar/recuperar checkpoint como mapa real do Firestore,
positivo em 35.474,059 ms. São três SDK distintos e duas repetições dirigidas,
não cinco novos testes. JVMs próprias encerradas pelo finally; não encerrar
processo alheio caso o sistema reutilize um PID.

## Revisão e correções

O primeiro teste raw nativo revelou comparação indevida do tipo de registro do
draft com adventure-resource. Draft usa o mesmo endereço de recurso, mas seu tipo
é próprio; corrigida a conferência de endereço sem confundir os tipos.

Uma expectativa inicial exigia recusa do item adulterado ao abrir a factory.
O contrato é leitura por unidade: o teste agora exige recusa quando o item é lido,
além de bloquear a prova anteriormente retida. Não adicionar varredura global.

Revisão reproduziu em RED a mutabilidade do manifesto remapeado de openMappedRaw;
aplicado congelamento profundo e seleção afetada positiva. Outra regressão RED
mostrou que mapas equivalentes com chaves reordenadas eram recusados por comparar
JSON textual do estado UTF-8. A comparação agora usa campos fechados e seus
valores, sem reiniciar hash ou UTF-8. Inicialização exige estado UTF-8 vazio.
Node e percurso nativo afetado passaram; SDK comprova prefixo privado armazenado.

A expectativa de range raw foi ajustada para 80 KiB de framing; payload continua
64 KiB. Nenhum limite de produção, cobertura ou asserção de integridade foi reduzido.
Unknown kind/layout é recusado explicitamente, inclusive propriedade ausente.

## Checks e limites

Lint dos oito arquivos de código/teste, sintaxe de 337 módulos de Functions e
checks documentais/arquitetura/styleguide/formatação/diff acompanham o fechamento.
Nenhuma dependência, configuração de testes, exportação de callable ou permissão
foi modificada. Servidor Vite preservado e HTTP 5173 respondeu 200.

Sem novo validate integral, build, navegador, a11y ou Node 22 neste incremento.
O verde integral de 170 é base anterior, não evidência do novo código.
Repetir a suíte integral no fechamento do próximo grande bloco, conforme orientação
do operador; ajustes locais receberam somente as seleções pertinentes.

Próximas entregas: revisão/stager de estrutura/lore/personas/mídia/histórico,
universo autorizado, draft como versão separada, contadores/audit/ativação,
recuperação cifrada/UI e roundtrip. Referências somente históricas não devem
criar heads ativos. A prova por etapas não é snapshot atômico contra alterações
administrativas externas nem autorização de conteúdo de terceiros.

P2/P3/D/F2-09, gates humanos/comerciais e 8/35 permanecem abertos.
Somente commit local com hooks normais; sem CI/push/PR/merge/deploy/subagentes.
