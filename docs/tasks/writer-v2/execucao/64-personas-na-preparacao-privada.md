# P1 / M31 — Personas e vínculos na preparação privada

## Objetivo e contrato

Preparar todos os perfis usados e seus vínculos sem sobrescrever a biblioteca
atual, expor uma cópia parcial ou buscar uma persona atual em lugar da arquivada.

- Novo escritor interno advanceBookRestorePersonas, somente após M30.
- Consumir um book-persona por unidade pelo leitor M21, conferindo verify(tx).
  Vínculo do livro confere também metadata do arquivo; capítulo/fonte conferem
  o artefato nativo autorizado e seu complemento remapeado.
- Preservar o perfil portátil integral (texto, atributos, arquivo, revisão e datas),
  alterando somente o ID já remapeado por M21. Não normalizar/truncar strings.
  Essas são definições congeladas privadas, não perfis globais ativos.
- Deduplicar definições por personaId remapeado e igualdade integral/hash.
  Registrar vínculos por scope/ownerId, sem prosa, apontando a mesma definição.
  Perfis iguais em vários vínculos não são regravados nem mantidos em Set ilimitado.
- Não copiar biblioteca não usada, chaves, configurações de provedor ou grants.
  Preset também vira definição própria remapeada. Arquivado permanece arquivado.
  Persona legada ausente continua ausente, sem empréstimo da biblioteca atual.
- Coleções privadas preparedPersonas/personaBindings sob o job. Inventário v9
  antes de criá-las; namespace vazio na migração, journal/recibo/cursor atômicos.
  Cleanup mascara/pagina, confere nascimento e certifica ambas as coleções vazias.
- Preparação v5 fixa resourceEndIndex para conservar a prova/contagem M30 quando
  o cursor principal avança. Contadores de vínculos por scope e perfis distintos,
  fechados e cumulativos, são conferidos contra manifesto e relatório validado.
- Encerrar em universe sem consumir o primeiro item seguinte.
  Raiz ausente/countReady false. Nenhuma API pública, Rule ou UI nova.

## Tarefas e aceites

1. [x] Definições/vínculos privados com identidade e deduplicação comprovadas.
2. [x] Inventário v9/progresso v5 e compatibilidade de receipts/cleanup anteriores.
3. [x] Escritor interno, manifesto, validação de vínculo e replay/CAS/rollback.
4. [x] Testes dirigidos Node/SDK, revisão, documentação e commit local.

## Suposições, riscos e próximos requisitos

O destino final esperado são novas cópias privadas das personas usadas,
preservando a biblioteca atual. Este estágio não escreve users/UID/aiPersonas.
A integração dos perfis preparados com biblioteca, consumidores de IA/histórico/
backup e disponibilidade atômica ainda é obrigatória antes de ativar a cópia.
Não inferir segurança só do prefixo do ID nem disponibilizar perfil durante cleanup.

Não existe limite necessário de quantidade de perfis: trabalho unitário e hashes
no servidor evitam carregar catálogo completo na RAM. O schema vigente limita
cada perfil, que cabe no documento nativo. Preservar metadados portáteis na
definição; revisões/datas das futuras cópias globais exigem seu contrato próprio.

Faltam universo autorizado, histórico/rascunho/capa, representação de campos grandes,
integração das personas, autorização final/ativação e host/UI/roundtrip/validate.
P1/F2-09 continuam abertos. Sem dependências, CI/push/PR/deploy ou subagentes.
