import { Link } from 'react-router';
import type {
  PublicBook,
  PublicChapter,
  PublicLoreEntity,
  ReaderGuideBoundary,
} from '../model/publicBook';
import { publicReadingPath } from '../services/publicBookService';
import styles from './ReaderView.module.css';
const kinds = {
  direct: 'Presença direta',
  document: 'Transmissão documental',
  mention: 'Menção',
  uncertain: 'Presença incerta',
};
export function ReaderGuideCatalog({
  book,
  chapters,
  entities,
}: {
  book: PublicBook;
  chapters: PublicChapter[];
  entities: PublicLoreEntity[];
}) {
  const citation = (boundary: ReaderGuideBoundary | undefined) =>
    boundary && (
      <Link to={publicReadingPath(book.id, boundary.chapterId)}>
        Fonte: {chapters.find((chapter) => chapter.id === boundary.chapterId)?.title ?? 'capítulo'}
      </Link>
    );
  if (book.readerGuideVersion !== 1) return null;
  return (
    <section className={styles.guide} aria-label="Guia do leitor">
      <h2>Guia do leitor</h2>
      <p>Informações liberadas até o seu progresso neste livro.</p>
      {!entities.length && <p>Nenhuma entrada liberada até este capítulo.</p>}
      {entities.map((entity) => (
        <details key={entity.id} className={styles.guideEntry}>
          <summary>
            {entity.name}
            {entity.disambiguation ? ' · ' + entity.disambiguation : ''}
          </summary>
          {entity.certainty === 'uncertain' && <p>Informação incerta</p>}
          <p>{entity.summary}</p>
          {citation(entity.readerGuide)}
          {!!entity.facts?.length && (
            <ul>
              {entity.facts.map((fact, index) => (
                <li key={index}>
                  {fact.text}
                  {fact.certainty === 'uncertain' && ' (incerto)'} · {citation(fact.readerGuide)}
                </li>
              ))}
            </ul>
          )}
          {!!entity.relationships?.length && (
            <>
              <h3>Relações</h3>
              <ul>
                {entity.relationships.map((relation, index) => (
                  <li key={index}>
                    {relation.targetName}: {relation.description}
                    {relation.certainty === 'uncertain' && ' (incerto)'} ·{' '}
                    {citation(relation.readerGuide)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!!entity.appearances?.length && (
            <>
              <h3>Aparições e menções</h3>
              <ul>
                {entity.appearances.map((appearance, index) => (
                  <li key={index}>
                    {kinds[appearance.kind]} · {citation(appearance.readerGuide)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      ))}
    </section>
  );
}
