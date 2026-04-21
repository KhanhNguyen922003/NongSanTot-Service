import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function parsePrivateKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/\\n/g, '\n');
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return initializeApp();
}

const firebaseAdminApp = initializeFirebaseAdmin();

export const firebaseAdminAuth = getAuth(firebaseAdminApp);
