import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getUserCredits, deductCredit, addCredits } from '../services/creditsService';
import * as firestoreModule from 'firebase/firestore';

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof firestoreModule>('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn((_db: unknown, _col: unknown, id: string) => ({ id })),
    getDoc: vi.fn(),
    runTransaction: vi.fn(),
  };
});

describe('creditsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserCredits', () => {
    it('retorna os creditos do documento quando existente', async () => {
      vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ credits: 25 }),
      } as unknown as firestoreModule.DocumentSnapshot);

      const credits = await getUserCredits('user-1');
      expect(credits).toBe(25);
    });

    it('retorna 0 quando documento nao existe', async () => {
      vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
        exists: () => false,
      } as unknown as firestoreModule.DocumentSnapshot);

      const credits = await getUserCredits('user-unknown');
      expect(credits).toBe(0);
    });
  });

  describe('deductCredit', () => {
    it('debita credito com sucesso quando ha saldo suficiente', async () => {
      vi.mocked(firestoreModule.runTransaction).mockImplementationOnce((async (
        _firestore: unknown,
        updateFn: (t: firestoreModule.Transaction) => Promise<number>,
      ) => {
        const fakeTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({ credits: 10 }),
          }),
          update: vi.fn(),
        };
        return updateFn(fakeTransaction as unknown as firestoreModule.Transaction);
      }) as unknown as typeof firestoreModule.runTransaction);

      const newTotal = await deductCredit('user-1', 1);
      expect(newTotal).toBe(9);
    });

    it('lanca erro quando o saldo e insuficiente', async () => {
      vi.mocked(firestoreModule.runTransaction).mockImplementationOnce((async (
        _firestore: unknown,
        updateFn: (t: firestoreModule.Transaction) => Promise<number>,
      ) => {
        const fakeTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({ credits: 0 }),
          }),
          update: vi.fn(),
        };
        return updateFn(fakeTransaction as unknown as firestoreModule.Transaction);
      }) as unknown as typeof firestoreModule.runTransaction);

      await expect(deductCredit('user-1', 1)).rejects.toThrow('Saldo de créditos insuficiente.');
    });

    it('lanca erro quando o usuario nao existe', async () => {
      vi.mocked(firestoreModule.runTransaction).mockImplementationOnce((async (
        _firestore: unknown,
        updateFn: (t: firestoreModule.Transaction) => Promise<number>,
      ) => {
        const fakeTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: () => false,
          }),
          update: vi.fn(),
        };
        return updateFn(fakeTransaction as unknown as firestoreModule.Transaction);
      }) as unknown as typeof firestoreModule.runTransaction);

      await expect(deductCredit('user-1', 1)).rejects.toThrow('Usuário não encontrado');
    });
  });

  describe('addCredits', () => {
    it('adiciona creditos atomicamente', async () => {
      vi.mocked(firestoreModule.runTransaction).mockImplementationOnce((async (
        _firestore: unknown,
        updateFn: (t: firestoreModule.Transaction) => Promise<number>,
      ) => {
        const fakeTransaction = {
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({ credits: 5 }),
          }),
          set: vi.fn(),
        };
        return updateFn(fakeTransaction as unknown as firestoreModule.Transaction);
      }) as unknown as typeof firestoreModule.runTransaction);

      const newTotal = await addCredits('user-1', 50);
      expect(newTotal).toBe(55);
    });
  });
});
