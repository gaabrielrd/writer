# Contrato transversal de validação e aceite

## Aplicação

Este contrato é herdado por cada tarefa. Planejamento não executa testes de funcionalidades inexistentes.
Tarefas de decisão geram documentos/protótipos e evidência de escolha.
Tarefas implementadas atendem aos critérios próprios e ao [processo vigente](../../development-process.md).
A evidência desta rodada documental fica separada em [registro de validação](validacao-do-planejamento.md).

## Interface

PT-BR e plataformas finais são fechadas em D-12; preservar a base web existente.
Usar shared/ui, Dropdown de seleção/ação, tokens semânticos, Lucide e ThemeProvider existente.
Cobrir claro/escuro/sépia, desktop/celular/320 px, teclado, foco, contraste e rótulos.
Estados de dados: carregando, vazio, erro com retry, sucesso, sem permissão/revogado quando aplicável.
Não remover textos pendentes ao navegar, fechar diálogo, consultar lore ou retomar após falha.
Toda ação sensível mostra alvo e alcance em linguagem de produto; não inserir detalhes internos como requisito do usuário.

## Persistência e segurança

Provar autorização na camada de dados e por acesso direto, não apenas pela UI.
Dono, revisor, mestre, jogador, comprador, vendedor, operador e terceiro usam contas distintas nos testes.
Verificar Firestore/Storage, resposta de servidor, artefatos e cache no recurso relevante.
Testar conta errada, recurso excluído, revisão concorrente, revogação, retry e resposta incerta.
Onde há dinheiro/texto/direito, conferir idempotência e estado final persistido.
Mutações globais e revogação por versão mantêm as garantias atuais.
Downloads não prometem apagar cópias que já foram obtidas.

## Matriz de cenários integrados

| ID    | Cenário                                                 | Resultado observável                                     | Tarefas principais   |
| ----- | ------------------------------------------------------- | -------------------------------------------------------- | -------------------- |
| VA-01 | Abrir/importar livro legado, editar e exportar com atos | Ordem/conteúdo preservados, nenhuma migração destrutiva  | F2-01, F2-02, F2-09  |
| VA-02 | Planejar conto com cena/arco/meta e recuperar versão    | Texto recuperável, publicação não muda                   | F2-02 a F2-05        |
| VA-03 | Preparar aventura e duas campanhas no mesmo universo    | Variantes independentes e origem identificada            | F2-06 a F2-08        |
| VA-04 | Convidar revisor, comentar e aceitar sugestão           | Rodada delimitada; só autor aplica; crédito não debita   | F3-01 a F3-03        |
| VA-05 | Jogador consulta portal e mestre revela material        | Segredos ausentes de payload/URL/cache/aliases           | F3-04, F3-05         |
| VA-06 | Conduzir duas sessões e propor cânone                   | Diário local; promoção explícita pelo dono               | F3-06 a F3-08        |
| VA-07 | Preparar edição enquanto origem é alterada/revogada     | Incompleta/antiga não é ativada indevidamente            | F4-01                |
| VA-08 | Abrir EPUB e pacotes reais                              | Ordem, sumário, Unicode, imagens e audiências corretos   | F4-02, F4-03         |
| VA-09 | Visitante consulta criador, série e amostra paga        | Metadados permitidos; corpo completo inacessível         | F4-04, F4-05         |
| VA-10 | Cotar e comprar com preço adulterado/duplo clique       | Servidor rejeita adulteração; compra não duplica         | F4-06, F4-07         |
| VA-11 | Webhook duplicado/forjado/fora de ordem                 | Confirmação verificável; direito/razão sem duplicação    | F4-08                |
| VA-12 | Pagamento aprovado sem retorno ao site e entrega falha  | Conciliação recupera; biblioteca/entrega retomáveis      | F4-08, F4-09         |
| VA-13 | Comprador A usa ID/URL de comprador B                   | Negado sem texto/arquivo privado                         | F4-09                |
| VA-14 | Reembolso/disputa após compra/repasse                   | Compensação e acessos coerentes com política             | F4-10, F4-11         |
| VA-15 | Comprar aventura e iniciar campanha com jogador         | Original intacto; jogador só vê liberação local          | F4-12                |
| VA-16 | Suspender vendedor/retirar obra/excluir conta           | Novas vendas e direitos seguem política sem perder razão | F4-04, F4-09 a F4-11 |
| VA-17 | IA/autosave/histórico/sugestão concorrentes             | Manuscrito e créditos mantêm protocolo aprovado          | F2-05, F2-09, F3-03  |
| VA-18 | Rollout falha e é recuperado                            | Sem abertura de conteúdo pago nem duplicação financeira  | F5-05                |
| VA-19 | Piloto humano + compra real autorizada dos dois tipos   | Aceite e conciliação comprovados em produção controlada  | F5-01, F5-06         |

A matriz resume os casos; cada tarefa contém falhas e validações específicas.
Estados, permissões e formatos devem ser testados no ambiente adequado.
Não usar apenas leitura anônima para comprovar todo o modelo comercial.

## Comandos e evidências de implementação

Instalar dependências functions com `npm ci --prefix functions` antes de validar.
Executar `npm run validate` com cobertura vigente e gates completos.
Para mudança de autorização, executar `npm run test:rules` nas regras reais/emulador.
Para UI/fluxo integrado, executar `npm run test:e2e` e os cenários visuais pertinentes.
Registrar comando, data, ambiente, SHA, resultado, falhas e limites; não inventar saída.
Se ambiente impedir um gate, registrar bloqueio e executar os checks independentes;
isso não equivale ao aceite completo de uma feature.
Não reduzir cobertura nem contornar hooks.

## Artefatos e integração externa

EPUB: validar estrutura e abrir em leitor real; conferir sumário, ordem, metadados e recursos.
DOCX/PDF/pacote de aventura: renderizar/abrir os arquivos e conferir audiência.
Pagamento: mocks validam lógica local; sandbox do provedor valida integração; piloto real autorizado valida operação.
CI verde é conferido no SHA pertinente, não inferido de um teste local.
Teste humano deve registrar tarefa, pessoa/consentimento, contexto e resultado sem expor conteúdo sensível.

## Portão público

EV-01 a EV-08 cobertos; duas jornadas completas; compra, acesso, entrega, reversão e operação;
políticas/direitos aprovados; suporte e recuperação ensaiados; resultado técnico/humano registrado.
Pendência que afete esses requisitos impede lançamento, mesmo que uma parte do aplicativo funcione.
