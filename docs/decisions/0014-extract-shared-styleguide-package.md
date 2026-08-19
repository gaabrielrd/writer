# ADR 0014: extrair o styleguide para pacote compartilhado

## Status

Aceita. Substitui, para o estado atual, a localização definida nas ADRs 0011,
0012 e 0013.

## Contexto

Tokens, componentes e fontes viviam dentro do template. Isso fazia cada projeto
receber uma cópia independente e dificultava distribuir correções visuais.

## Decisão

Consumir `@vitru/styleguide`, desenvolvido no repositório irmão
`styleguide-vitru`. O pacote expõe componentes, tipos, CSS, tokens e um showcase
opcional. React permanece peer dependency.

TheMix é referenciada pelo nome e por fallbacks, mas seus arquivos comerciais
não entram no pacote. Projetos licenciados mantêm os WOFF2 em `public/fonts` e
podem gerar o `@font-face` com `npx vitru-install-themix`.

O template consome a versão publicada no registro público do npm. O
`package-lock.json` fixa o artefato efetivamente validado, enquanto a faixa
semver em `package.json` permite receber correções compatíveis. Referências
`file:`, `link:` e `workspace:` ficam restritas ao desenvolvimento isolado da
biblioteca e não entram no template distribuído.

## Consequências

- Componentes e tokens passam a ter uma única fonte de verdade.
- Atualizações chegam por versão npm.
- Instalações do template não dependem de um repositório irmão no disco.
- `/styleguide` continua disponível sem manter uma feature duplicada.
- A publicação não redistribui a licença comercial da TheMix.
