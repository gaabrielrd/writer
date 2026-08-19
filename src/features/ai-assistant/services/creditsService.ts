import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { firestore } from '@/shared/lib';

export async function getUserCredits(userId: string): Promise<number> {
  const userDocRef = doc(firestore, 'users', userId);
  const snap = await getDoc(userDocRef);

  if (!snap.exists()) {
    return 0;
  }

  const data = snap.data();
  return typeof data.credits === 'number' ? data.credits : 0;
}

export async function deductCredit(userId: string, amount = 1): Promise<number> {
  const userDocRef = doc(firestore, 'users', userId);

  return runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(userDocRef);

    if (!snap.exists()) {
      throw new Error('Usuário não encontrado para débito de créditos.');
    }

    const currentCredits = (snap.data().credits as number | undefined) ?? 0;

    if (currentCredits < amount) {
      throw new Error('Saldo de créditos insuficiente.');
    }

    const newCredits = currentCredits - amount;

    transaction.update(userDocRef, {
      credits: newCredits,
      updatedAt: Date.now(),
    });

    return newCredits;
  });
}

export async function addCredits(userId: string, amount: number): Promise<number> {
  const userDocRef = doc(firestore, 'users', userId);

  return runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(userDocRef);
    const currentCredits = snap.exists() ? ((snap.data().credits as number | undefined) ?? 0) : 0;

    const newCredits = currentCredits + amount;

    transaction.set(
      userDocRef,
      {
        credits: newCredits,
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    return newCredits;
  });
}
