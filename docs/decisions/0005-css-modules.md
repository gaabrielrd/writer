# ADR 0005: Escolha de CSS Modules

## Contexto

O projeto requer uma abordagem para estilização de componentes React. Existem inúmeras alternativas no ecossistema (Styled Components, Tailwind CSS, Sass, CSS puro). É necessário um método que previna vazamento de escopo de CSS (global styles) sem introduzir grande complexidade de build ou curva de aprendizado acentuada.

## Decisão

Decidimos utilizar **CSS Modules** como a solução padrão para estilização.

## Consequências

- **Positivas:**
  - Escopo local garantido: classes são hasheadas (ex: `.button_x8k9`), evitando conflitos.
  - Zero dependências adicionais: já vem suportado nativamente pelo Vite e pela maioria dos bundlers.
  - Sintaxe padrão de CSS, permitindo reuso de conhecimento existente.
  - Fácil refatoração e remoção de código morto.
- **Negativas:**
  - Menos utilitários embutidos se comparado ao Tailwind CSS.
  - A estilização em tempo de execução para temas dinâmicos complexos requer o uso integrado com CSS Variables (Custom Properties), o que exige um pouco mais de organização na arquitetura de CSS (ex: `index.css` global com variáveis).
