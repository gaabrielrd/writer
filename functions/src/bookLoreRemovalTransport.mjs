import { authorize, closed } from './bookRestoreUploadContracts.mjs';
import { workFail } from './workProgressContracts.mjs';
import { createBookLoreRemovalService } from './bookLoreRemoval.mjs';
import { createBookLoreSourceInspectionService } from './bookLoreSourceInspection.mjs';
import {
  BOOK_LORE_REMOVAL_CALLABLE,
  BOOK_LORE_REMOVAL_ROUTES,
} from './bookLoreRemovalTransportMethods.mjs';

const invalid = () => workFail('invalid-argument', 'Pedido de retirada de lore inválido.');
const manualId = (value, prefix) => {
  if (typeof value !== 'string' || !new RegExp('^' + prefix + '-[a-f0-9]{64}$').test(value))
    invalid();
};
export function setBookLoreRemovalHeaders(method, request) {
  if (method !== BOOK_LORE_REMOVAL_CALLABLE) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
/** Dedicated manual withdrawal entry; internal/analysis children never cross it. */
export function createBookLoreRemovalTransportService({ db, now }) {
  const factories = {
    inspectionId: createBookLoreSourceInspectionService,
    removalId: createBookLoreRemovalService,
  };
  return {
    async bookLoreRemoval(uid, data) {
      authorize(uid);
      closed(data, ['method', 'input']);
      const route = BOOK_LORE_REMOVAL_ROUTES.find((r) => r.methods.includes(data.method)),
        input = data.input;
      if (!route || !input || typeof input !== 'object' || Array.isArray(input)) invalid();
      manualId(input[route.key], route.prefix);
      if (Object.hasOwn(input, 'inspection'))
        manualId(input.inspection?.inspectionId, 'lore-removal-source');
      return factories[route.key]({ db, now })[data.method](uid, input);
    },
  };
}
