// Optional MongoDB Atlas storage for saved commutes. If MONGODB_URI is not set the app still works
// (saved commutes then live in the browser's localStorage only).
let clientPromise = null;
let lastError = null;

export const dbConfigured = () => !!(process.env.MONGODB_URI || '').trim();

export async function getDb() {
  if (!dbConfigured()) return null;
  try {
    if (!clientPromise) {
      const { MongoClient } = await import('mongodb');
      clientPromise = new MongoClient(process.env.MONGODB_URI.trim(), { serverSelectionTimeoutMS: 5000, maxPoolSize: 5 }).connect();
    }
    const client = await clientPromise;
    lastError = null;
    return client.db((process.env.MONGODB_DB || 'leavewise').trim());
  } catch (e) {
    clientPromise = null;
    lastError = e.message;
    console.error('[db] connection failed:', e.message);
    return null;
  }
}
export const dbError = () => lastError;
