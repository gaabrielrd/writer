# W2-F4-05 — Apresentar catálogo, séries e amostras

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-04](../fase-04-publicar-e-comercializar/04-criadores-convidados.md), [W2-F4-01](../fase-04-publicar-e-comercializar/01-edicoes-e-projecoes.md), [W2-F4-03](../fase-04-publicar-e-comercializar/03-pacote-de-aventura.md)
**Áreas propostas:** app/routes; propostas catalog, creator e publications. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir descoberta de livros e aventuras, compreensão da oferta e leitura de uma amostra antes da compra.

## Entradas e resultado

Entradas: publicações liberadas, perfil público, série e amostra escolhida. Resultado: catálogo navegável e páginas de produto/criador.

## Escopo e comportamento

- Pesquisar/filtrar por tipo, gênero/tema e criador com paginação definida.
- Organizar séries de livros e coleções de aventuras sem revelar projetos privados da mesma coleção.
- Mostrar conteúdo incluído, formatos, edição, licença e informações comerciais sem promessas não aprovadas.
- Amostra tem projeção própria; para pago, nunca baixar livro completo e ocultar capítulos só na UI.

## Passos de execução

- [ ] Criar índice público de metadados permitidos.
- [ ] Implementar páginas de criador, série e produto.
- [ ] Adicionar amostra selecionada e estados de indisponibilidade.
- [ ] Testar busca, item retirado e permissão de conteúdo pago.

## Critérios de aceite

- [ ] Visitante encontra os dois tipos e entende o que receberá.
- [ ] Busca não indexa prosa secreta nem títulos privados.
- [ ] Amostra não libera capítulos/arquivos completos por URL.
- [ ] Livro gratuito e publicação histórica mantêm navegação adequada.

## Validação

- Regras/contrato: metadados fechados e amostra parcial.
- E2E: descoberta, amostra, série incompleta, teclado e 320 px.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Estratégia de busca deve caber na escala medida; novo serviço exige justificativa.
- Uma série não concede acesso coletivo por si.

## Não escopo

Recomendação algorítmica, reviews públicos, feed social e bundles comerciais.
