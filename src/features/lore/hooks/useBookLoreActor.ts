import { useState } from 'react';
import { useAuth } from '@/features/auth';
import { currentBookLoreActor } from '../services/bookLoreEditService';
/** Profile metadata updates keep the draft; SDK actor replacement fences it. */
export function useBookLoreActor() {
  const { user } = useAuth(),
    current = user ? currentBookLoreActor() : null,
    actor = current?.uid === user?.uid ? current : null,
    [binding, setBinding] = useState({ actor, n: 0 });
  if (binding.actor !== actor) {
    setBinding({ actor, n: binding.n + 1 });
    return null;
  }
  return actor ? binding.n : null;
}
