# ADR 0280: Escritores explícitos para o fence de captura dos ciclos

Status: cobertura local parcial de workflow; validação pendente.

## Contexto

Jobs mudam sem tocar a raiz do livro. O backup editorial precisa observar essas mutações antes de compor uma captura consistente. A coordenação deve preservar os contratos de cada escritor.

## Decisão

Adicionar um marcador privado na mesma transação de cada criação/atualização de cabeçalho em literaryWorkflow. Usar chamadas explícitas na família, sem interceptar getFirestore ou transações globais. Conferir identidade nativa do marcador e da raiz após reautorizar o livro.

Rotular a observação como workflow-headers-only. Não habilitar captura v2 com essa cobertura parcial. Preservar no-op de consultas/replays, ausência explícita, Rules servidor-only e limpeza pelo inventário do livro.

## Consequências

Avanços de cabeçalho podem invalidar uma observação sem alterar texto, créditos ou clocks semânticos. Cada commit pertinente acrescenta uma escrita privada. As demais famílias e corpos ainda precisam de coordenação e prova em SDK real, com drenagem dos escritores antigos antes de habilitar produção.

Ver [incremento 32](../tasks/producao-literaria/32-fence-explicito-dos-ciclos.md). Testes preparados, não executados.
