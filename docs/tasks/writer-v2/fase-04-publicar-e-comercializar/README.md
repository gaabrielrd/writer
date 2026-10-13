# Fase 4 — Publicar e comercializar

**Estado:** Planejada; tarefas não executadas.
**Janela:** Meses 7–9. **Capacidade:** 240 h brutas como orçamento inicial, não estimativa validada.

## Objetivo

Completar publicação, distribuição e venda de livros e aventuras por criadores convidados.

## Entrada

Fase 3 aceita; políticas D-05 a D-10 aprovadas; sandbox e habilitação técnica disponíveis.

## Entregas

- Edições/projeções separadas e artefatos por audiência.
- EPUB, formatos existentes e pacote de aventura.
- Criadores convidados, catálogo, séries e amostras.
- Ofertas, pedido, checkout, webhook, conciliação e biblioteca.
- Reembolso, disputa, razão, repasses e campanha a partir de compra.

## Tarefas em ordem

| Tarefa                                        | Descrição                                               | Dependências                 |
| --------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| [W2-F4-01](01-edicoes-e-projecoes.md)         | Preparar edições e projeções de publicação              | W2-F3-08, W2-F1-04           |
| [W2-F4-02](02-epub-e-pacote-externo.md)       | Exportar EPUB e preparar distribuição externa           | W2-F4-01                     |
| [W2-F4-03](03-pacote-de-aventura.md)          | Gerar pacotes de aventura por audiência                 | W2-F4-01, W2-F3-04, W2-F4-02 |
| [W2-F4-04](04-criadores-convidados.md)        | Habilitar criadores convidados e acompanhar publicações | W2-F1-04, W2-F4-01           |
| [W2-F4-05](05-catalogo-series-e-amostras.md)  | Apresentar catálogo, séries e amostras                  | W2-F4-04, W2-F4-01, W2-F4-03 |
| [W2-F4-06](06-ofertas-e-precos.md)            | Definir ofertas, preços e versões comerciais            | W2-F4-04, W2-F1-04           |
| [W2-F4-07](07-pedidos-e-checkout.md)          | Criar pedidos e iniciar checkout                        | W2-F4-05, W2-F4-06           |
| [W2-F4-08](08-webhooks-e-conciliacao.md)      | Confirmar eventos e conciliar pagamentos                | W2-F4-07                     |
| [W2-F4-09](09-biblioteca-e-entrega.md)        | Oferecer biblioteca e entrega protegida                 | W2-F4-08, W2-F4-02, W2-F4-03 |
| [W2-F4-10](10-reembolsos-e-disputas.md)       | Tratar reembolsos, disputas e retirada                  | W2-F4-09, W2-F4-08           |
| [W2-F4-11](11-repasses-e-operacao.md)         | Operar repasses e acompanhar o catálogo                 | W2-F4-10, W2-F4-04           |
| [W2-F4-12](12-campanha-a-partir-de-compra.md) | Iniciar campanha a partir de aventura adquirida         | W2-F4-09, W2-F2-07, W2-F4-10 |

Seguir a ordem da tabela como roteiro solo; as dependências identificam pré-requisitos reais.
Uma tarefa só inicia execução quando suas decisões necessárias estão fechadas.
Não é necessário executar tarefas em paralelo para cumprir o plano.

## Portão de saída

- [ ] Livro e aventura fazem o caminho completo em sandbox do provedor escolhido.
- [ ] Amostra é pública; edição paga e pacote exigem autorização.
- [ ] Replay/ordem invertida não duplicam cobrança, direito ou repasse.
- [ ] Compra de aventura gera campanha particular utilizável; reembolso/retirada têm tratamento coerente.
- [ ] Pacotes reais foram abertos e não contêm dados fora da audiência.

Para tarefas implementadas, aplicar [validação transversal](../validacao-e-aceite.md) e a definição de concluído.
O planejamento desta fase não é evidência de entrega do produto.
Usar [decisões e riscos](../decisoes-e-riscos.md) para hipóteses e
[timeline](../timeline.md) para reestimativa.
A fase seguinte de implementação só avança após o portão; estudo preparatório não equivale a aceite.

## Demonstração e evidência

Registrar resultado das jornadas de autor e mestre, origem dos dados de teste, data/ambiente/SHA, falhas corrigidas e pendências.
Distinguir validação documental, execução automatizada, sandbox comercial, produção e aceite humano.

[Voltar ao índice](../README.md).
