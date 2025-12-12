/**
 * Script to create a superadmin account
 * 
 * Usage:
 * 1. Make sure you're logged in to Firebase (or use the web interface at /create-superadmin)
 * 2. Run: node scripts/create-superadmin.js
 * 
 * Or visit: http://localhost:5173/create-superadmin in your browser
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('========================================');
  console.log('  Create Superadmin Account');
  console.log('========================================\n');
  console.log('To create a superadmin account, you have two options:');
  console.log('\n1. Use the web interface:');
  console.log('   - Start the web server: cd web && npm run dev');
  console.log('   - Visit: http://localhost:5173/create-superadmin');
  console.log('\n2. Use Firebase Console:');
  console.log('   - Go to Firebase Console > Authentication > Users');
  console.log('   - Click "Add user"');
  console.log('   - Enter email and password');
  console.log('   - Then add a document in Firestore:');
  console.log('     Collection: users');
  console.log('     Document ID: <user-uid>');
  console.log('     Fields:');
  console.log('       email: <user-email>');
  console.log('       role: "superadmin"');
  console.log('       createdAt: <timestamp>');
  console.log('       isActive: true');
  console.log('\n========================================\n');
  
  rl.close();
}

main().catch(console.error);


