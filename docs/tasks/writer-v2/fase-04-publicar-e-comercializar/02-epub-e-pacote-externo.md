# W2-F4-02 — Exportar EPUB e preparar distribuição externa

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-01](../fase-04-publicar-e-comercializar/01-edicoes-e-projecoes.md)
**Áreas propostas:** editor e books; proposta publications. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Entregar um arquivo de leitura portátil e um pacote editorial conferível para distribuição fora do Writer.

## Entradas e resultado

Entradas: edição, metadados públicos, capa autorizada e formatos escolhidos. Resultado: EPUB validado e formatos existentes coerentes com a edição.

## Escopo e comportamento

- Construir EPUB com estrutura, sumário, ordem de atos/capítulos, idioma, metadados, imagens/alternativas e atribuições aprovadas.
- Reutilizar sanitização e JSZip se suficiente; ferramenta adicional exige necessidade explicada.
- Manter DOCX/Markdown/PDF atuais; PDF de navegador continua explicitamente impressão/salvar, sem prometer diagramação profissional.
- Oferecer revisão de metadados e checklist de submissão; autor envia a loja externa, sem automação de publicação.

## Passos de execução

- [ ] Especificar conversão de prosa e recursos suportados no EPUB.
- [ ] Implementar exportação a partir de edição autorizada, com cancelamento/limites.
- [ ] Validar padrão e abrir em leitores/previewer escolhidos.
- [ ] Conferir ordem, caracteres, imagens, sumário e ausência de notas privadas.

## Critérios de aceite

- [ ] EPUB passa em validador definido e tem sumário navegável.
- [ ] Conteúdo coincide com a edição escolhida, sem texto pendente ou notas internas.
- [ ] Falha de asset ou cancelamento não entrega arquivo corrompido como sucesso.
- [ ] Exportações antigas permanecem disponíveis e a distribuição externa é explicada.

## Validação

- Contrato de pacote: manifest/spine/sumário e fixtures com Unicode/listas/imagens.
- Inspeção em leitor real e Kindle Previewer se KDP for canal escolhido; registrar versão/fonte.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Tooltips web não são portáveis automaticamente; glossário opcional usa somente campos autorizados.
- Direitos de imagem/fontes e conteúdo D&D seguem D-10.

## Não escopo

Integração automática com KDP, promessa de aceitação comercial e diagramação de pré-impressão.
