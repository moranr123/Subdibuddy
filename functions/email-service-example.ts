/**
 * Firebase Cloud Functions - Email Service Example
 * 
 * This is an example implementation for sending emails via Firebase Cloud Functions.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Install Firebase CLI:
 *    npm install -g firebase-tools
 * 
 * 2. Initialize Firebase Functions in your project:
 *    firebase init functions
 * 
 * 3. Install required dependencies:
 *    cd functions
 *    npm install nodemailer @types/nodemailer
 * 
 * 4. Configure email credentials:
 *    firebase functions:config:set email.user="your-email@gmail.com" email.password="your-app-password"
 * 
 *    Note: For Gmail, you need to use an "App Password" instead of your regular password.
 *    Generate one at: https://myaccount.google.com/apppasswords
 * 
 * 5. Deploy the function:
 *    firebase deploy --only functions:sendEmail
 * 
 * 6. Update your .env file with the function URL:
 *    VITE_FIREBASE_FUNCTIONS_URL=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/sendEmail
 */

import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';

// Configure email transporter
// For Gmail, you need to use an App Password
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().email.user,
    pass: functions.config().email.password,
  },
});

// Alternative: Use SMTP configuration for other email providers
// const transporter = nodemailer.createTransport({
//   host: 'smtp.gmail.com',
//   port: 587,
//   secure: false,
//   auth: {
//     user: functions.config().email.user,
//     pass: functions.config().email.password,
//   },
// });

/**
 * Cloud Function to send emails
 * Called from the web app when accounts are approved/rejected
 */
export const sendEmail = functions.https.onCall(async (data, context) => {
  // Optional: Add authentication check
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  // }

  const { to, subject, html } = data;

  if (!to || !subject || !html) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields: to, subject, html'
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid email address'
    );
  }

  const mailOptions = {
    from: 'Subdibuddy <noreply@subsibuddy.com>',
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to: ${to}`);
    return { success: true, message: 'Email sent successfully' };
  } catch (error: any) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send email',
      error.message
    );
  }
});

/**
 * Alternative: HTTP endpoint version (if you prefer HTTP over callable)
 * 
 * export const sendEmailHttp = functions.https.onRequest(async (req, res) => {
 *   // Handle CORS
 *   res.set('Access-Control-Allow-Origin', '*');
 *   res.set('Access-Control-Allow-Methods', 'POST');
 *   res.set('Access-Control-Allow-Headers', 'Content-Type');
 * 
 *   if (req.method === 'OPTIONS') {
 *     res.status(204).send('');
 *     return;
 *   }
 * 
 *   if (req.method !== 'POST') {
 *     res.status(405).send('Method Not Allowed');
 *     return;
 *   }
 * 
 *   const { to, subject, html } = req.body;
 * 
 *   if (!to || !subject || !html) {
 *     res.status(400).json({ error: 'Missing required fields' });
 *     return;
 *   }
 * 
 *   const mailOptions = {
 *     from: 'Subsibuddy <noreply@subsibuddy.com>',
 *     to,
 *     subject,
 *     html,
 *   };
 * 
 *   try {
 *     await transporter.sendMail(mailOptions);
 *     res.status(200).json({ success: true });
 *   } catch (error: any) {
 *     console.error('Error sending email:', error);
 *     res.status(500).json({ error: 'Failed to send email' });
 *   }
 * });
 */

