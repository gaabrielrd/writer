import { BookOpen, NotebookPen, UserRound } from 'lucide-react';
import { Badge, Card } from '@/shared/ui';
import type { AIPersona, ResolvedPersonaProfile } from '../model/persona';
import { PersonaAvatar } from './PersonaAvatar';
import styles from './Personas.module.css';

export function PersonaComposition({
  profile,
  showChapter = true,
  compact = false,
}: {
  profile: ResolvedPersonaProfile;
  showChapter?: boolean;
  compact?: boolean;
}) {
  const voices: { role: string; persona: AIPersona | null; fallback: string }[] = [
    { role: 'Base do livro', persona: profile.base, fallback: 'Sem persona base' },
    ...(showChapter
      ? [{ role: 'Complemento do capítulo', persona: profile.chapter, fallback: 'Sem complemento' }]
      : []),
  ];
  return (
    <section
      className={`${styles.composition} ${compact ? styles.compositionCompact : ''}`}
      aria-label="Composição da voz"
    >
      {voices.map(({ role, persona, fallback }, index) => (
        <Card key={role} tone="flat" className={styles.voiceCard}>
          <div className={styles.voiceRole}>
            {index === 0 ? (
              <BookOpen className="icon icon-sm" aria-hidden="true" />
            ) : (
              <NotebookPen className="icon icon-sm" aria-hidden="true" />
            )}
            <span>{role}</span>
            {persona?.archived && <Badge variant="secondary">Arquivada</Badge>}
          </div>
          <div className={styles.identity}>
            {persona ? (
              <PersonaAvatar persona={persona} />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                <UserRound className="icon" />
              </span>
            )}
            <div className={styles.voiceCopy}>
              <h3>{persona?.name ?? fallback}</h3>
              {!compact && (
                <p>
                  {persona
                    ? persona.description ||
                      'Consulte as orientações efetivas para conhecer esta voz.'
                    : index === 0
                      ? 'Orientações padrão da operação.'
                      : 'O capítulo acompanha a voz do livro.'}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}
