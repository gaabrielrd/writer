# ADR 0228 — cliente e recuperação metadata da exclusão de aventuras

- Data: 2026-10-28.
- Estado: núcleo cliente local implementado; fluxo público do plano 199 aberto.
- Base: 3628888. Complementa a [ADR 0227](0227-adventure-deletion-terminal-verification.md).

## Decisão

Criar adventure-deletions como folha de auth/shared, composta entre features
somente por adventures. O Estúdio consumirá a interface de adventures.
O verificador arquitetural cobre importações estáticas, tipos e import dinâmico.
Não importar a implementação de campanhas nem os drivers de portabilidade.

Usar contrato próprio: fonte com sourceToken/adventureToken e revisão atual;
progresso com deletionToken/nascimento do job, checkpoint, contagem, fase e datas.
Verificar schema fechado, UID/aventura/job, recibo/action/operationId e piso
conhecido antes de adotar respostas. Fase pode reabrir, enquanto checkpoint,
contagem e datas não retrocedem; conclusão conhecida não muda. O catálogo
conserva schemaVersion/ownerId próprios e cursor opaco limitado, sem repetir
página ou duplicar jobs/projetos.

O coordenador captura dados antes dos awaits e confere conta/aventura após cada
espera. Não avança automaticamente ao ler ou recarregar. Cada chamada executa
uma unidade. Início e avanço preservam pedido exato antes do envio, com Web Locks
e CAS do envelope inteiro em localStorage. Guard dentro e depois do lock,
releitura integral e conflito entre abas impedem sobreposição. Falta de reserva
segura mantém leitura remota disponível, mas impede novos efeitos.

O diário separa UID/aventura e guarda apenas IDs, hashes, revisão, checkpoint,
contagem, fase e datas. Não guarda título, manuscrito, pergunta/resposta,
arquivo ou chave de recuperação. Entrada inválida e falhas de quota/ACK local
não são apagadas implicitamente. A leitura local não concede acesso à origem.

Início incerto repete o mesmo ID ou persiste cancel-start antes de resolver o
pedido original no servidor. Resolução confirmada não cancela exclusão iniciada.
Recibo válido substitui pendência por metadata conhecida no mesmo CAS. Resposta
inválida, conta trocada ou alteração por outra aba conserva o controle anterior.

Conflito de checkpoint exige primeiro erro definitivo do servidor; depois,
consulta do mesmo job/token com checkpoint superior ao pedido. Só essa prova
permite retirar a pendência sem recibo próprio. Após reload, repetir o pedido
original para obter novamente a confirmação de conflito. Não usar timeout ou
progresso de outro job como autorização para descartar intenção.

Adaptador Firebase prepara seis comandos próprios, us-central1 e timeout de
120 segundos. Não compor esse cliente na UI nem exportar os endpoints do servidor
nesta etapa. Transporte autenticado, UI e validação integrada permanecem seguintes.

## Evidência e limites

49 Vitest positivos, incluindo ciclo com as factories reais do servidor sobre
double com relógios nativos: fonte, ACK perdido, novo cliente, retomada e remoção
terminal, mantendo perguntas. Adaptador Firebase tem dois testes de encaminhamento
mockado; não houve chamada a conta real, App Check ou endpoint implantado.

21 testes do verificador arquitetural passaram, com quatro novos cenários.
Veja a [entrega parcial](../entregas/2026-10-28-writer-v2-cliente-e-recuperacao-da-exclusao-de-aventuras.md).
Núcleo cliente ainda sem hook/tela, export público de servidor ou validação em
navegador real. Política final das perguntas, validate integral e plano 199 abertos.
