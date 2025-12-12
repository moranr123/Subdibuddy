import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as readline from 'readline';

// Firebase configuration
const firebaseConfig = {
  projectId: "subsibuddy-88108",
};

// Initialize Firebase Admin (you'll need to download service account key from Firebase Console)
// For now, we'll use a simpler approach with client SDK
async function createSuperAdmin() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  try {
    console.log('=== Create Superadmin Account ===\n');
    
    const email = await question('Enter email for superadmin: ');
    const password = await question('Enter password (min 6 characters): ');
    
    if (!email || !password || password.length < 6) {
      console.error('Error: Email and password (min 6 chars) are required');
      rl.close();
      return;
    }

    console.log('\nCreating superadmin account...');
    
    // Note: This script requires Firebase Admin SDK
    // You need to:
    // 1. Install: npm install firebase-admin
    // 2. Download service account key from Firebase Console
    // 3. Set GOOGLE_APPLICATION_CREDENTIALS environment variable
    
    // For a simpler approach, we'll create a web-based script instead
    console.log('\nPlease use the web-based admin creation tool instead.');
    console.log('Or set up Firebase Admin SDK with service account key.');
    
    rl.close();
  } catch (error) {
    console.error('Error creating superadmin:', error);
    rl.close();
  }
}

createSuperAdmin();


