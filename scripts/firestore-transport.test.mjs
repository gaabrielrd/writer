import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  doc,
  runTransaction,
  getFirestore,
  terminate,
} from 'firebase/firestore';

// Resolve exactly the transport used by Firestore, including its scoped override.
const require = createRequire(import.meta.url);
const firestoreRequire = createRequire(require.resolve('@firebase/firestore'));
const { Server, ServerCredentials } = firestoreRequire('@grpc/grpc-js');

function bytesField(tag, value) {
  const bytes = Buffer.from(value);
  assert.ok(bytes.length < 128, 'Fixture uses a one-byte protobuf length');
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

test(
  'Firestore reads a missing document through its patched gRPC transport',
  { timeout: 30000 },
  async () => {
    const server = new Server();
    const name = 'projects/demo-writer-ci/databases/(default)/documents/transport/missing';
    let received = false;
    server.addService(
      {
        commit: {
          path: '/google.firestore.v1.Firestore/Commit',
          requestStream: false,
          responseStream: false,
          requestDeserialize: (bytes) => bytes,
          responseSerialize: (bytes) => bytes,
        },
        batchGetDocuments: {
          path: '/google.firestore.v1.Firestore/BatchGetDocuments',
          requestStream: false,
          responseStream: true,
          requestDeserialize: (bytes) => bytes,
          responseSerialize: (bytes) => bytes,
        },
      },
      {
        commit(_call, callback) {
          callback(null, Buffer.alloc(0));
        },
        batchGetDocuments(call) {
          received = call.request.includes(Buffer.from(name));
          // BatchGetDocumentsResponse: missing (field 2), read_time (field 4).
          call.write(Buffer.concat([bytesField(18, name), bytesField(34, [8, 1])]));
          call.end();
        },
      },
    );
    const port = await new Promise((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, value) => {
        if (error) reject(error);
        else resolve(value);
      });
    });
    server.start();
    const app = initializeApp({ projectId: 'demo-writer-ci' }, 'transport-test');
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', port);
    let timer;
    try {
      const result = await Promise.race([
        runTransaction(db, (transaction) => transaction.get(doc(db, 'transport', 'missing')), {
          maxAttempts: 1,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Local Firestore transport timed out')), 10000);
        }),
      ]);
      assert.equal(received, true);
      assert.equal(result.exists(), false);
    } finally {
      clearTimeout(timer);
      await terminate(db);
      await deleteApp(app);
      server.forceShutdown();
    }
  },
);
