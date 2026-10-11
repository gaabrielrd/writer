import { DEFAULT_PERSONA_AVATARS, type AIPersona } from '../model/persona';
import styles from './Personas.module.css';
import { UserRound } from 'lucide-react';

export function PersonaAvatar({ persona }: { persona: AIPersona }) {
  const source = DEFAULT_PERSONA_AVATARS[persona.id];
  if (!source)
    return (
      <span className={styles.avatarFallback} aria-hidden="true">
        <UserRound className="icon" />
      </span>
    );
  return (
    <img
      className={styles.avatar}
      src={source}
      alt={`Avatar de ${persona.name}`}
      width={72}
      height={72}
      loading="lazy"
      decoding="async"
    />
  );
}
