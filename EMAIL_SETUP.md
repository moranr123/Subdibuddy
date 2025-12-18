# Email Notification Setup Guide

This guide explains how to set up email notifications for account approvals and rejections using EmailJS.

## Overview

When a pending account is approved or rejected, the system will automatically send an email notification to the user's email address. The email service uses EmailJS to send emails directly from the browser.

## Prerequisites

1. EmailJS account (free tier available at https://www.emailjs.com/)
2. EmailJS service configured
3. EmailJS email template created

## Current Configuration

- **Service ID**: `service_xre2ekc`
- **Template ID**: `template_1wwgxhv`

## Setup Instructions

### Step 1: Get Your EmailJS Public Key

1. Log in to your EmailJS dashboard: https://dashboard.emailjs.com/
2. Navigate to **Account** → **API Keys**
3. Copy your **Public Key** (also called User ID)

### Step 2: Configure Environment Variable

Create a `.env` file in the `web` directory (if it doesn't exist) and add your EmailJS Public Key:

```env
VITE_EMAILJS_PUBLIC_KEY=your_public_key_here
```

**Note**: Replace `your_public_key_here` with your actual EmailJS Public Key.

### Step 3: Configure Your EmailJS Template

Make sure your EmailJS template (`template_1wwgxhv`) includes the following variables:

- `{{to_email}}` - Recipient email address
- `{{subject}}` - Email subject line
- `{{{message}}}` - **HTML email content (use TRIPLE braces to render HTML)**
- `{{from_name}}` - User's full name (sender name)
- `{{from_email}}` - (Optional) Sender email
- `{{reply_to}}` - (Optional) Reply-to email
- `{{time}}` - (Optional) Timestamp

**⚠️ IMPORTANT:** To render HTML content properly, you must use **triple braces** `{{{message}}}` instead of double braces `{{message}}`. This tells EmailJS to render the HTML instead of displaying it as plain text.

#### Template Variable Mapping

The application sends the following data to your EmailJS template:

| Template Variable | Description | Example Value |
|-------------------|-------------|---------------|
| `to_email` | Recipient's email address | `user@example.com` |
| `subject` | Email subject | `Account Approved - Welcome to Subsibuddy!` |
| `message` | HTML email body | Full HTML email content |
| `user_name` | User's full name | `John Doe` |

### Step 4: Verify EmailJS Service Configuration

1. In your EmailJS dashboard, go to **Email Services**
2. Verify that service `service_xre2ekc` is properly configured
3. Ensure the service is connected to your email provider (Gmail, Outlook, etc.)

### Step 5: Test the Setup

1. Start your development server:
   ```bash
   cd web
   npm run dev
   ```

2. Approve or reject a pending account from the admin panel
3. Check the browser console for email sending logs
4. Verify the user receives the email

## Testing

1. Approve or reject a pending account from the admin panel
2. Check the browser console for email sending logs
3. Verify the user receives the email

## Troubleshooting

### Email Not Sending

1. **Check browser console for errors:**
   - Look for EmailJS-related error messages
   - Verify that the Public Key is correctly set

2. **Verify Public Key:**
   - Ensure `VITE_EMAILJS_PUBLIC_KEY` is set in your `.env` file
   - Restart your development server after adding the environment variable
   - Check that the Public Key matches the one in your EmailJS dashboard

3. **Check EmailJS Dashboard:**
   - Verify your service is active and properly configured
   - Check your email service connection (Gmail, Outlook, etc.)
   - Review EmailJS usage limits (free tier has rate limits)

4. **Verify Template Variables:**
   - Ensure your template includes all required variables: `to_email`, `subject`, `message`
   - Check that variable names match exactly (case-sensitive)

### Common Issues

- **"EmailJS Public Key not configured"**: Set `VITE_EMAILJS_PUBLIC_KEY` in your `.env` file
- **"Email service returned unsuccessful result"**: Check EmailJS dashboard for service status
- **Rate limit exceeded**: EmailJS free tier has a limit of 200 emails/month. Consider upgrading or implementing rate limiting
- **Template variables not working**: Ensure variable names in your EmailJS template match exactly: `{{to_email}}`, `{{subject}}`, `{{message}}`, `{{user_name}}`

## Email Templates

The email HTML content is generated in `web/src/utils/emailService.ts`:

- **Approval Email**: Sent when an account is approved (`sendApprovalEmail` function)
- **Rejection Email**: Sent when an account is rejected (`sendRejectionEmail` function)

You can customize the email content by editing the HTML in these functions. The HTML will be passed to your EmailJS template as the `message` variable.

## Security Notes

- EmailJS Public Key is safe to expose in client-side code (it's designed for browser use)
- Email sending happens directly from the browser, no backend required
- Failed email sends don't prevent account approval/rejection (graceful degradation)
- Consider implementing rate limiting for production use

## Rate Limits

EmailJS free tier includes:
- 200 emails per month
- 1 request per second

For higher limits, consider upgrading your EmailJS plan.

## Additional Resources

- [EmailJS Documentation](https://www.emailjs.com/docs/)
- [EmailJS Dashboard](https://dashboard.emailjs.com/)
- [EmailJS Template Guide](https://www.emailjs.com/docs/user-guide/creating-email-templates/)
