/**
 * Email Service Utility
 * 
 * This utility sends emails via EmailJS.
 * 
 * Configuration:
 * - Service ID: service_xre2ekc
 * - Template ID: template_1wwgxhv
 * 
 * Make sure your EmailJS template includes the following variables:
 * - to_email: Recipient email address
 * - subject: Email subject
 * - message: HTML email content
 * - from_name: User's full name (sender name)
 * - from_email: (Optional) Sender email
 * - reply_to: (Optional) Reply-to email
 * - time: (Optional) Timestamp
 */

import emailjs from '@emailjs/browser';

// EmailJS configuration
const EMAILJS_SERVICE_ID = 'service_xre2ekc';
const EMAILJS_TEMPLATE_ID = 'template_1wwgxhv';
// Try to get from environment variable, fallback to hardcoded value for now
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'OpoSKg71Mm4YSjsqt';

// Log configuration on module load (for debugging)
console.log('📧 EmailJS Configuration:', {
  serviceId: EMAILJS_SERVICE_ID,
  templateId: EMAILJS_TEMPLATE_ID,
  publicKeyConfigured: !!EMAILJS_PUBLIC_KEY,
  publicKeyLength: EMAILJS_PUBLIC_KEY.length,
  envValue: import.meta.env.VITE_EMAILJS_PUBLIC_KEY
});

// Initialize EmailJS if public key is available
if (EMAILJS_PUBLIC_KEY) {
  try {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    console.log('✅ EmailJS initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize EmailJS:', error);
  }
} else {
  console.warn('⚠️ EmailJS Public Key not configured. Please set VITE_EMAILJS_PUBLIC_KEY in your environment variables.');
  console.warn('You can find your Public Key in your EmailJS dashboard under Account → API Keys.');
}

interface EmailData {
  to: string;
  subject: string;
  html: string;
  userName?: string;
}

/**
 * Sends an email via EmailJS
 */
export const sendEmail = async (emailData: EmailData): Promise<boolean> => {
  try {
    // Check if public key is configured
    if (!EMAILJS_PUBLIC_KEY) {
      console.error('❌ EmailJS Public Key is required to send emails.');
      console.error('Please set VITE_EMAILJS_PUBLIC_KEY in your .env file and restart the dev server.');
      return false;
    }

    if (!emailData.to || !emailData.subject || !emailData.html) {
      console.warn('❌ Missing required email fields:', {
        to: !!emailData.to,
        subject: !!emailData.subject,
        html: !!emailData.html
      });
      return false;
    }

    // Prepare template parameters for EmailJS
    const templateParams = {
      to_email: emailData.to,
      subject: emailData.subject,
      message: emailData.html,
      from_name: emailData.userName || 'Subdibuddy Team',
      // Optional variables (will be empty if not provided)
      from_email: '',
      reply_to: '',
      time: new Date().toLocaleString(),
    };

    console.log('📧 Attempting to send email via EmailJS:', {
      serviceId: EMAILJS_SERVICE_ID,
      templateId: EMAILJS_TEMPLATE_ID,
      to: emailData.to,
      subject: emailData.subject,
      publicKeyConfigured: !!EMAILJS_PUBLIC_KEY,
      publicKey: EMAILJS_PUBLIC_KEY.substring(0, 5) + '...' // Show first 5 chars for debugging
    });

    // Send email via EmailJS
    // Since we initialized with emailjs.init(), we can call send without publicKey
    // But we'll pass it in options to be explicit and ensure it works
    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams
    );

    console.log('✅ EmailJS Response:', response);

    if (response.status === 200 || response.text === 'OK') {
      console.log('✅ Email sent successfully to:', emailData.to);
      return true;
    } else {
      console.warn('⚠️ Email service returned unexpected result:', response);
      return false;
    }
  } catch (error: any) {
    // Email service not available or not configured - this is okay
    // The function will fail gracefully and the approval/rejection will still proceed
    console.error('❌ Error sending email via EmailJS:', error);
    console.error('Error details:', {
      message: error.message,
      text: error.text,
      status: error.status
    });
    console.log('Email details that would be sent:', {
      to: emailData.to,
      subject: emailData.subject
    });
    return false;
  }
};

/**
 * Sends approval email to user
 */
export const sendApprovalEmail = async (
  email: string,
  fullName: string,
  username: string,
  password?: string
): Promise<boolean> => {
  if (!email) {
    console.warn('No email address provided for approval notification');
    return false;
  }

  const subject = 'Account Approved - Welcome to Subdibuddy!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Account Approved</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #1877F2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Subdibuddy</h1>
      </div>
      <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #ddd;">
        <h2 style="color: #4CAF50; margin-top: 0;">Account Approved!</h2>
        <p>Dear ${fullName},</p>
        <p>We are pleased to inform you that your account has been approved!</p>
        <p>You can now log in to the Subdibuddy mobile app using your credentials:</p>
        <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #1877F2;">
          <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
          ${password ? `<p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>` : ''}
        </div>
        ${password ? '<p><strong>Please remember to change your password after your first login for security reasons.</strong></p>' : ''}
        <p>Please download the Subdibuddy mobile app and log in to access all features.</p>
        <p>If you have any questions or need assistance, please contact your building administrator.</p>
        <p style="margin-top: 30px;">Best regards,<br>The Subdibuddy Team</p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ 
    to: email, 
    subject, 
    html,
    userName: fullName 
  });
};

/**
 * Sends rejection email to user
 */
export const sendRejectionEmail = async (
  email: string,
  fullName: string,
  reason: string
): Promise<boolean> => {
  if (!email) {
    console.warn('No email address provided for rejection notification');
    return false;
  }

  const subject = 'Account Application Status - Subdibuddy';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Application Status</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #1877F2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Subdibuddy</h1>
      </div>
      <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #ddd;">
        <h2 style="color: #F44336; margin-top: 0;">Application Status Update</h2>
        <p>Dear ${fullName},</p>
        <p>We regret to inform you that your account application has been reviewed and unfortunately, we are unable to approve it at this time.</p>
        ${reason ? `
        <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #F44336;">
          <p style="margin: 5px 0;"><strong>Reason:</strong></p>
          <p style="margin: 5px 0;">${reason}</p>
        </div>
        ` : ''}
        <p>If you believe this is an error or have additional information to provide, please contact your building administrator for further assistance.</p>
        <p>Thank you for your interest in Subdibuddy.</p>
        <p style="margin-top: 30px;">Best regards,<br>The Subdibuddy Team</p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
        <p>This is an automated message. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ 
    to: email, 
    subject, 
    html,
    userName: fullName 
  });
};

