import { author, FIXTURE_BOOK_ID, FIXTURE_TIME, lore } from './fixtures/data.ts';
import { adventureImportDb } from '../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from '../../functions/test/helpers/bookLoreReadFixture.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../functions/src/bookLoreEditTransport.mjs';
import { createBookLoreEditOutcomeService } from '../../functions/src/bookLoreEditOutcome.mjs';
import { createBookLoreWriteRecoveryService } from '../../functions/src/bookLoreWriteRecovery.mjs';
import { createBookLoreRemovalTransportService } from '../../functions/src/bookLoreRemovalTransport.mjs';
import { FUNCTION_ROUTES } from '../../functions/src/functionDomains.mjs';

/** Real private native protocols in Node; only Auth/SDK/Firestore are local fixtures. */
/** @param {import('@playwright/test').Page} page */
export async function installNativeBookLore(page) {
  const f = adventureImportDb({ nativeUpdates: true });
  for (const { id, bookId, ...data } of lore.filter((e) => e.bookId === FIXTURE_BOOK_ID)) {
    await seedBookLoreRead(f.db, { uid: author.uid, bookId, id, data, inline: true });
  }
  const reader = createBookLoreReadService({ db: f.db }),
    edit = createBookLoreEditTransportService({ db: f.db, now: () => FIXTURE_TIME }),
    outcome = createBookLoreEditOutcomeService({ db: f.db }),
    recovery = createBookLoreWriteRecoveryService({ db: f.db, now: () => FIXTURE_TIME }),
    removal = createBookLoreRemovalTransportService({ db: f.db, now: () => FIXTURE_TIME }),
    calls = [];
  await page.exposeFunction('__writerVisualNativeLoreCall', async (name, input, uid) => {
    if (input?.version === 1 && FUNCTION_ROUTES[input.action] === name) {
      name = input.action;
      input = input.payload;
    }
    calls.push({ name, input: structuredClone(input), uid });
    if (name === 'bookLoreEdit') return edit.bookLoreEdit(uid, input);
    if (name === 'bookLoreEditOutcome') return outcome.bookLoreEditOutcome(uid, input);
    if (name === 'bookLoreRemoval') return removal.bookLoreRemoval(uid, input);
    if (name in reader) return reader[name](uid, input);
    if (name in recovery) return recovery[name](uid, input);
    throw Error('Unexpected native fixture callable: ' + name);
  });
  await page.route(/\/firebase_functions\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "import {auth} from '/e2e/visual/fixtures/firebase.ts';export const getFunctions=()=>({region:'us-central1'});export const httpsCallable=(_,name)=>async input=>{const data=await window.__writerVisualNativeLoreCall(name,input,auth.currentUser.uid);const action=input?.version===1?input.action:name;const payload=input?.version===1?input.payload:input;if(action==='bookLoreEdit'&&payload.method.startsWith('adoptBookLore'))window.dispatchEvent(new Event('writer.visual.native-lore'));return {data};};",
    }),
  );
  await page.route(/\/firebase_app-check\.js(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "export const getToken=async()=>({token:'visual-native-app-check'});",
    }),
  );
  await page.route('**/api/book-lore/recovery-key', async (route) => {
    const request = route.request(),
      token = request.headers().authorization ?? '';
    if (
      !token.startsWith('Bearer visual-native-id-') ||
      request.headers()['x-firebase-appcheck'] !== 'visual-native-app-check'
    )
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
    const uid = token.slice('Bearer visual-native-id-'.length);
    try {
      const data = await recovery.getBookLoreEditRecoveryKey(
        uid,
        JSON.parse(request.postData() ?? '{}'),
      );
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    } catch {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
    }
  });
  return { calls, fixture: f };
}
