# ADR 0035 — Adoção explícita de base e fichas legadas da campanha

**Estado:** implementada e concluída tecnicamente em `947cfc3`, com CI e regras verdes.
**Decisão de produto:** em 2026-10-17 o operador aprovou conservar fichas legadas
autorizadas, vinculadas à origem e às mesmas regras de acesso.

## Contexto

Uma candidata pronta contém aventura, referências e mídia congeladas. Adotá-la
precisa preservar variantes inteiras, retiradas, revisão contínua e notas próprias.
Alterar somente activeBaseId quebraria procedência, leitores e recuperação de
pedidos cifrados da base anterior. Campanhas grandes também exigem preparação
limitada e confirmação sem varrer todo o acervo numa transação.

## Decisão

A revisão ocorre sem barreira de edição. Cada escolha vincula ficha/revisão e o
checkpoint do plano; edição C2 concorrente invalida o plano, sem reaplicar escolhas.
Preparação explícita reivindica a candidata e instala uma barreira com encarnação,
adoção e epoch próprios antes de auditar operações remotas. Pendência aberta
aborta/libera a própria barreira para permitir sua recuperação. Nenhum passo ou
consulta dispara outra mutação automaticamente a partir de um controle conhecido.

Preparar uma geração privada de lore sem alterar os leitores da geração ativa.
Anchor achatado identifica a ficha congelada usada em modo base; bodyBinding
separado identifica diretamente os bytes físicos do override, sem cadeias ou paths
vindos do navegador. Corpos mantidos conservam bodyRevision. Todas as revisões de
overlay/tombstone continuam monotônicas, inclusive quando uma ficha reaparece.

Participação candidate/legacy/inactive é separada de modo base/override/removed.
Ficha ausente com material local exige manter legado ou descartar explicitamente.
Descarte de legado na adoção deixa tombstone inativo; descarte apenas do override
no editor retorna ao anchor e conserva a ficha legada. Retirada/restauração mantém
anchor e previousMode. Reentrada usa a mesma sourceKey, sem duplicação por nome.
Legado explicitamente retido fica oculto enquanto sua origem negar acesso; a
revogação não o converte em descarte. Conteúdo ausente nunca retido e já indisponível
permanece inerte até uma escolha autorizada posterior, sem ler sua prosa.

Um relógio privado por UID cobre autorizações de qualquer quantidade de universos
legados. Inicialização é explícita; token persistente e epoch seguro impedem reset
ou overflow silenciosos. Escritores de universo/lore global e análise atualizam o
mesmo relógio atomicamente. Cada etapa confere gates atuais; o commit compara um
certificado completo com token/epoch atuais. Edição comum refaz somente os gates,
sem recapturar a candidata. Perda efetiva de autorização previamente validada
impede a confirmação e libera apenas a própria barreira.

Antes de habilitar adoção num ambiente, implantar todos os escritores canônicos
que participam do relógio e aguardar o encerramento das versões antigas em voo.
Manutenções/importações Admin também precisam incrementá-lo na mesma transação;
regras que negam o SDK não protegem contra escrita Admin que ignore o protocolo.
O relógio pertence ao UID e não pode ser removido pela exclusão de uma campanha.
Os testes locais não comprovam essa migração operacional em produção.

O commit atualiza base ativa, provenance.baseId, geração C2, revisões, estado
adopted permanente e recibo juntos. Preserva metadados próprios atuais e C1.
Comparação adotada nunca fica descartável depois de outra adoção. Cancelamento
remove somente staging próprio; não remove corpos emprestados, bases ou pins.
Gerações inativas não oferecem histórico novo; sua coleta e exclusão integral
continuam na tarefa própria, sem limpeza recursiva de bindings referenciados.

## Recuperação e privacidade

Rascunhos cifrados continuam na base/AAD originais. Listagem de pedidos remotos
expõe somente controles mínimos, sem descriptor, alvos de relações ou chave.
Resolução remota consulta o descriptor privado no servidor e confirma o pedido
exato por recibo próprio, inclusive rejeição definitiva de token vencido. Nenhuma
falha de rede autoriza apagar journal ou criar outro pedido.

A ativação B conserva sua autoridade estrita. Seu resolver histórico confirma
somente um recibo privado do UID, mesmo após adoção ou remoção/recriação do root;
não reconhece a encarnação atual, não recria campanha e não retorna DTO atual.
Reservas/limpezas locais usam CAS integral sob Web Locks, sem lock durante HTTP.

## Consequências e validação

O relógio por UID concentra contenção e invalida conservadoramente campanhas do
mesmo criador; evita limitar artificialmente a quantidade de universos legados.
Retenção de bases/bindings cresce até a exclusão integral. Nenhuma relação incorpora
alvos automaticamente ou transforma conteúdo derivado em nota independente.

O [contrato C3B](../tasks/writer-v2/execucao/19-adocao-explicita-de-base-da-campanha.md)
define APIs, limites, estados e provas requeridas. Conclusão exige evidência de
unitários, SDK real, navegador dirigido e validate. A
[entrega C3B](../entregas/2026-10-18-writer-v2-adocao-de-bases.md) registra os
resultados reais e seus limites; esta decisão não concede merge, deploy ou compartilhamento.
