# W2-F6-06 — Explorar uso offline ampliado e aplicativos

**Estado:** Candidata pós-V1; descoberta e implementação não aprovadas.
**Dependências:** [W2-F5-06](../fase-05-validar-e-lancar/06-aceite-e-lancamento.md)
**Áreas propostas:** editor, campaigns e library propostos; armazenamento e distribuição. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Avaliar experiência offline explícita e formas de instalação a partir das limitações reais da web.

## Entradas e resultado

Entradas: eventos de conexão e demanda por dispositivos. Resultado: política offline e estudo separado de PWA/aplicativos nativos.

## Escopo e comportamento

- Distinguir edição offline, material de sessão e leitura adquirida; autorização e licença não se confundem com cache.
- Especificar conflitos, chaves de conta, dispositivo compartilhado e retomada segura.
- Investigar instalação web antes de aplicativo nativo e comparar manutenção/custo.
- Separar offline privado da garantia de revogação online; comprador precisa conhecer o limite.

## Passos de execução

- [ ] Observar cenários de conexão de autores, mestres e leitores.
- [ ] Desenhar conflitos e política de acesso offline.
- [ ] Prototipar uma jornada em dispositivo alvo.
- [ ] Produzir plano e estimativa por plataforma, preservando exportação.

## Critérios de aceite

- [ ] Política explica o que funciona offline e como sincroniza.
- [ ] Trocar conta não revela dados de outra pessoa.
- [ ] Conflito não sobrescreve manuscrito por comparação de relógio.
- [ ] Plataformas e manutenção são aprovadas antes da implementação.

## Validação

- Protótipo com duas abas/dispositivos, reconexão e conta revogada.
- Exercício de recuperação e isolamento de dados locais.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Leitura offline e revogação imediata têm limites que precisam ser assumidos explicitamente.
- Aplicativos multiplicam validação e suporte.

## Não escopo

Prometer apagar conteúdo offline remoto, aplicativo nativo na V1 e cache irrestrito de material pago.
