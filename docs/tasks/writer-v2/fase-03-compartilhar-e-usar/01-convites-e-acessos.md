# W2-F3-01 — Convidar revisores e jogadores com acesso revogável

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F2-09](../fase-02-criar-e-preparar/09-lore-importacao-e-portabilidade.md), [W2-F1-03](../fase-01-direcao-e-fundamentos/03-permissoes-e-privacidade.md)
**Áreas propostas:** auth; propostas access, campaigns e editorial; functions e regras. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Dar acesso delimitado a revisores e jogadores sem abrir os documentos privados do proprietário.

## Entradas e resultado

Entradas: projeto, papel, destinatário e prazo aprovados. Resultado: convite aceito pela conta correta e participação revogável.

## Escopo e comportamento

- Gerar convite no servidor com escopo, prazo e consumo idempotente; apresentar link para compartilhamento pelo usuário.
- Separar revisor de jogador; participante não se torna coautor, vendedor ou administrador.
- Definir aceite, convite expirado/revogado, conta diferente e pessoa já participante.
- Revogação invalida projeções/consulta e fecha sessão autorizada segundo contrato; não deixar conteúdo secreto em cache geral.

## Passos de execução

- [ ] Implementar contratos de convite/participação e índices.
- [ ] Aplicar regras e operações de criação, aceite e revogação.
- [ ] Montar convite, entrada autenticada e lista de participantes.
- [ ] Testar acesso direto, conta errada e revogação durante uso.

## Critérios de aceite

- [ ] Aceite repetido não cria participações duplicadas.
- [ ] Revisor de livro não passa a ser jogador de campanha automaticamente.
- [ ] Usuário sem papel não consulta recurso por URL.
- [ ] Revogar participante impede novas leituras e informa perda de acesso.

## Validação

- Backend/regras reais: papéis, expiração, uso repetido e conta errada.
- Chromium: dono, convidado e terceiro com sessões separadas.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- D-03/D-09 precisam definir prazo e retenção; não escolher valores em silêncio.
- A implementação pode oferecer link sem autorização para enviar mensagens externas.

## Não escopo

Envio de e-mails/convites neste planejamento, coedição simultânea e permissões de venda por participação.
