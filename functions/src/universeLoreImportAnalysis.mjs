const normalize = (text) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
const letter = (value) => /[\p{L}\p{N}_]/u.test(value ?? '');

/** Select all lexical matches, including homonyms. Never filter the source text. */
export function selectImportContext(source, entries) {
  const normalized = normalize(source);
  return entries.filter((entry) =>
    [entry.name, ...(entry.aliases ?? [])].some((value) => {
      const term = normalize(value).trim();
      if (!term) return false;
      let from = 0;
      for (;;) {
        const index = normalized.indexOf(term, from);
        if (index < 0) return false;
        if (
          (!letter(term[0]) || !letter(normalized[index - 1])) &&
          (!letter(term.at(-1)) || !letter(normalized[index + term.length]))
        )
          return true;
        from = index + term.length;
      }
    }),
  );
}

export function locateImportEvidence(source, evidence) {
  if (!source.spans) return { page: source.page };
  const start = source.text.indexOf(evidence);
  const end = start + evidence.length;
  const pages = [
    ...new Set(
      source.spans
        .filter((span) => span.start < end && span.end > start && span.page !== null)
        .map((span) => span.page),
    ),
  ];
  return { page: pages[0] ?? null, pages };
}
