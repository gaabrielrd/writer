# W2-F4-04 — Habilitar criadores convidados e acompanhar publicações

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F1-04](../fase-01-direcao-e-fundamentos/04-regras-comerciais-e-direitos.md), [W2-F4-01](../fase-04-publicar-e-comercializar/01-edicoes-e-projecoes.md)
**Áreas propostas:** auth; propostas creator, commerce e publications; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir venda somente por criadores convidados e dar ao operador controle do catálogo sem invadir manuscritos.

## Entradas e resultado

Entradas: convite, identidade comercial necessária, perfil público e produto submetido. Resultado: vendedor habilitado e publicação aprovada/devolvida para ajuste.

## Escopo e comportamento

- Criar direito de vendedor no servidor, distinto de plano Premium e perfil de IA.
- Usar pseudônimo/perfil público escolhido; informações de pagamento ficam privadas e minimizadas.
- Acompanhar submissão com origem/licença, amostra, edição e pacote; operador lê apenas material necessário autorizado.
- Suspensão impede novas ofertas conforme política; não apagar compras/contabilidade automaticamente.

## Passos de execução

- [ ] Implementar convite e habilitação conforme provedor/política.
- [ ] Montar perfil público e painel de submissões.
- [ ] Implementar aprovação, devolução e suspensão com trilha de decisão.
- [ ] Testar conta não convidada e preservação de direitos de compradores.

## Critérios de aceite

- [ ] Alterar perfil no navegador não habilita venda.
- [ ] Criador aprovado publica somente suas edições autorizadas.
- [ ] Catálogo não expõe UID/e-mail/documentos comerciais.
- [ ] Suspensão tem efeito definido e compras antigas recebem tratamento D-07.

## Validação

- Regras/backend: papéis, convite, submissão e suspensão.
- Componentes: perfil vazio/erro, ajuste de publicação e confirmação de alcance.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- D-08 define onboarding do provedor e dados exigidos; não guardar documentos que o provedor já gerencia sem necessidade.
- Operador acompanha catálogo; não recebe acesso irrestrito a drafts.

## Não escopo

Cadastro aberto de vendedores, contas reais habilitadas neste planejamento e moderação de mensagens privadas.
