import { authorize, closed } from './bookRestoreUploadContracts.mjs';
import { workFail } from './workProgressContracts.mjs';
import { createBookLoreCreationReservationService } from './bookLoreCreation.mjs';
import { createBookLoreSourceInspectionService } from './bookLoreSourceInspection.mjs';
import { createBookLoreFieldUploadService } from './bookLoreFieldUpload.mjs';
import { createBookLoreEditReservationService } from './bookLoreEditReservation.mjs';
import {
  BOOK_LORE_EDIT_CALLABLE,
  BOOK_LORE_MANUAL_ROUTES,
} from './bookLoreEditTransportMethods.mjs';

const invalid = () => workFail('invalid-argument', 'Pedido de edição de lore inválido.');
const manualId = (value, prefix) => {
  if (typeof value !== 'string' || !new RegExp('^' + prefix + '-[a-f0-9]{64}$').test(value))
    invalid();
};
export function setBookLoreEditHeaders(method, request) {
  if (method !== BOOK_LORE_EDIT_CALLABLE) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
/** Public manual-edition boundary; never a generic dispatcher for internal jobs. */
export function createBookLoreEditTransportService({ db, now }) {
  const factories = {
    creationId: createBookLoreCreationReservationService,
    inspectionId: createBookLoreSourceInspectionService,
    uploadId: createBookLoreFieldUploadService,
    editId: createBookLoreEditReservationService,
  };
  return {
    async bookLoreEdit(uid, data) {
      authorize(uid);
      closed(data, ['method', 'input']);
      const route = BOOK_LORE_MANUAL_ROUTES.find((r) => r.methods.includes(data.method)),
        input = data.input;
      if (!route || !input || typeof input !== 'object' || Array.isArray(input)) invalid();
      manualId(input[route.key], route.prefix);
      if (Object.hasOwn(input, 'creation')) {
        if (!['uploadId', 'editId'].includes(route.key)) invalid();
        manualId(input.creation?.creationId, 'lore-creation');
      }
      if (Object.hasOwn(input, 'inspection'))
        manualId(input.inspection?.inspectionId, 'lore-source');
      if (Object.hasOwn(input, 'upload')) manualId(input.upload?.uploadId, 'lore-field');
      if (Object.hasOwn(input, 'fields'))
        for (const ref of Object.values(input.fields ?? {}))
          if (ref !== null) manualId(ref?.uploadId, 'lore-field');
      // Service constructors do no I/O; only the selected method opens a native unit.
      return factories[route.key]({ db, now })[data.method](uid, input);
    },
  };
}
