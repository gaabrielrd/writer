# ADR 0025 — Contratos para a implementação incremental do Writer V2

- **Status:** Aceito como direção técnica; implementação por incremento
- **Data:** 2026-10-13

## Contexto

O Writer existente mantém livros, editor, lore, universos, IA e publicação gratuita.
A evolução autorizada dá igual prioridade a autores e mestres e inclui distribuição
externa e comércio convidado. O protótipo validado aprova navegação, mas não comprova
serviços, autorização, pagamentos ou pilotos reais. Preservar a base exige contratos
antes de introduzir os novos recursos.

O número 0024 está reservado pelo trabalho paralelo de pipeline no checkout original.
Este ADR não integra suas alterações nem modifica a definição de concluído.

## Decisão

1. Compor cinco espaços — Universos, Estúdio, Publicações, Catálogo e Biblioteca —
   com livros, aventuras e campanhas no Estúdio. Separar recurso autoral de instância
   particular; universo é opcional. Campanha independente não exige compra.
2. Conservar coleções/IDs/URLs de livros, capítulos, atos, lore e personas. Introduzir
   recursos distintos quando necessários, sem migração genérica nem livro fictício.
   Novas fronteiras ficam em features com interfaces públicas, confirmadas pelo
   plano do incremento; a lista de módulos não obriga uma feature por substantivo.
3. Usar dono derivado da sessão/recurso pai, revisão esperada, identidade estável de
   operação, recibo atômico e datas de servidor. Novo recurso inicia schemaVersion 1;
   legado sem revisão usa a compatibilidade definida no contrato, sem truncamento.
4. Preservar lore vivo em originais autorizados. Campanha usa base congelada e
   variante de entidade inteira; promoção de cânone exige comparação e aceite do
   dono. Procedência e revogação acompanham derivados. Notas próprias permanecem
   separadas do material de origem e do direito comercial.
5. Produzir projeções físicas de campos permitidos para revisão, jogador, gratuito
   e pago. Não enviar segredo para ocultá-lo na interface. Convites exigem identidade
   verificada/aceite; revogação afeta URL direta, aliases, busca, IA e cache. Arquivos
   protegidos usam endpoint autenticado com direito vigente, sem token permanente.
6. Separar corpo de edição imutável de ciclo de vida/acesso mutável. Edição antiga,
   restore e artefato não restauram conteúdo cuja origem/consentimento foi revogado.
   Retirada normal suspende novas vendas e conserva a edição adquirida; política
   de reversão/remediação e notas próprias segue o contrato comercial.
7. Manter preço, pedido, evento confirmado, razão e direito no servidor. Crédito de
   IA não é saldo de compra; retorno do checkout não concede acesso. Stripe é o
   provedor escolhido. Direct charges com configuração de responsabilidades é um
   candidato condicionado à conta/API/capabilities reais, sem reserva Writer presumida.

Detalhes normativos: [domínio](../tasks/writer-v2/execucao/02-modelo-de-dominio.md),
[acesso](../tasks/writer-v2/execucao/03-permissoes-e-privacidade.md),
[comércio/direitos](../tasks/writer-v2/execucao/04-regras-comerciais-e-direitos.md).
Limites 25/50 e orçamentos em bytes pertencem ao contrato inicial, não a quotas
comerciais nem prova de capacidade Firestore. Histórico/custo e binários/roundtrip
serão fechados nos incrementos próprios antes de sua implementação.

## Alternativas descartadas

- Converter todos os recursos em livros/projetos genéricos: arrisca identidade e
  regras legadas e mistura original, campanha e edição.
- Alterar o cânone durante a sessão ou sincronizar variante por campo implicitamente:
  interfere em outras mesas e torna conflito/origem difícil de explicar.
- Enviar original completo para jogador/leitor e filtrar na UI: expõe dados por
  resposta, arquivo, cache e acesso direto.
- Usar coleção pública para corpo pago, redirect para direito ou créditos IA como
  carteira comercial: atravessa fronteiras de confiança e conciliação.

## Consequências e portões

Reuso do editor e componentes atuais não elimina backend/regras/índices/testes novos.
Os contratos entram no plano executável e nos casos negativos de cada incremento.
Propostas de módulos e integração comercial não descrevem infraestrutura existente.

[Consolidação e matriz de condições](../tasks/writer-v2/execucao/06-contratos-e-replanejamento.md)
separa preparação técnica de F2-01, aceite integral de fase, CI, humanos e operação
comercial. A definição de concluído vigente conserva CI verde em PR; validate local
não a substitui. Não há autorização de publicação live decorrente deste ADR.

Em 2026-10-13, após o CI verde de `079d4e9`, o operador autorizou implementar
o Estúdio F2-01 com os contratos técnicos aprovados e manter as condições humanas
e comerciais pendentes. O portão do incremento substitui o bloqueio integral
anterior de fase para essa implementação. Critérios de piloto, venda, direitos,
capacidade comercial e lançamento permanecem nos respectivos aceites; nenhum
resultado humano/comercial é inferido da autorização.

### Contratos concretizados em F2-01

O Estúdio separa `books`, `adventures` e `campaigns`, com criação idempotente
privada e vínculo de universo transacional. Listas por tipo usam dono, estado,
data e ID; não há feed global nem total inventado. Livros legados passam por
preparação limitada e retomável, usando datas reais do snapshot e preservando
conteúdo/IDs. Regras e mutações Admin conservam datas válidas após a preparação.
Excluir universo exige conferir contadores e referências dos três tipos.

`app` compõe a navegação; as features usam interfaces públicas. Os três espaços
futuros informam indisponibilidade até suas entregas. Metadados de projeto não
comprovam estrutura narrativa, sessão ou comércio. O
[plano executável](../tasks/writer-v2/execucao/07-estudio-projetos.md) especifica
limites, rotas, retry e evidências necessárias.

Estimativas não calibradas das 41 tarefas ampliam o horizonte do orçamento histórico,
preservando o escopo. Reestimar com horas humanas e resultados reais de cada incremento.
