# ADR 0284: Captura de decisões próprias sem caches ou grants derivados

Status: leitor interno local; validação pendente.

## Contexto

Decisões contêm justificativas próprias ao lado de rótulos e provas derivados. Reautorizar um relatório inteiro para ler a justificativa perderia anotações próprias; copiar o registro bruto exportaria caches e controles operacionais.

## Decisão

Capturar máscaras fechadas de campos próprios e conferir UID de impacto antes de ler justificativa/evidência. Preservar estados nativos, ações e correções somente como histórico. Não copiar rótulos, checks, resultados, fences, sucessores ou confirmações ativas.

Conferir destinos por metadata e conservar descritores indisponíveis quando a observação original não corresponde à encarnação/versão atual. Não relabelar versionToken como contentHash. Preservar descritores de índices estruturais com tipo/ID e unavailable, sem mapper nativo.

Versionar decisões por linhagem e rechecagens privadas, mantendo execução desabilitada/revisão obrigatória na cópia. Enumerar páginas de impacto por UID com cursor do último registro examinado, sem encerrar numa página vazia com continuação.

## Consequências

Justificativas permanecem no arquivo sem reabrir fontes revogadas nem promover correções antigas. Algumas relações exigem reconciliação com os futuros projetores das fontes. O leitor continua interno; não habilita geração do pacote ou restauração.

Ver [incremento 36](../tasks/producao-literaria/36-captura-de-decisoes-proprias.md). Testes apenas preparados.
