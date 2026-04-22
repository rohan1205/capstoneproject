const nodemailer = require('nodemailer');

let transporter = null;

// Initialize transporter (lazy init to avoid errors if SMTP not configured)
function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[Mail] SMTP credentials not configured. Password reset emails will not be sent.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} resetUrl - Password reset URL to include in email
 * @returns {Promise<boolean>} - true if sent, false if failed
 */
async function sendPasswordResetEmail(email, resetUrl) {
  const transport = getTransporter();
  if (!transport) {
    console.log(`[Mail] Password reset URL for ${email}: ${resetUrl}`);
    return false;
  }

  try {
    console.log(`[Mail] Sending password reset email to: ${email}`);
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM_EMAIL || 'noreply@breachlens.com',
      to: email,
      subject: 'Reset your BreachLens password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 20px; text-align: center; border-radius: 8px;">
            <h1 style="color: white; margin: 0;">BreachLens</h1>
          </div>
          
          <div style="padding: 30px; background: #f9fafb;">
            <h2 style="color: #1f2937; margin-bottom: 20px;">Password Reset Request</h2>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
              Hi there,
            </p>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
              We received a request to reset the password for your BreachLens account. Click the button below to reset your password. This link will expire in 10 minutes.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              Or copy and paste this link in your browser:
            </p>
            <p style="color: #4f46e5; font-size: 12px; word-break: break-all;">
              ${resetUrl}
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              If you didn't request this password reset, you can ignore this email. Your password will remain unchanged.
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Best regards,<br/>
              The BreachLens Team
            </p>
          </div>
          
          <div style="background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">© 2024 BreachLens. All rights reserved.</p>
            <p style="margin: 5px 0 0 0;">This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      `,
      text: `
        Password Reset Request
        
        We received a request to reset the password for your BreachLens account. 
        Click the link below to reset your password. This link will expire in 10 minutes.
        
        ${resetUrl}
        
        If you didn't request this password reset, you can ignore this email.
        
        Best regards,
        The BreachLens Team
      `,
    });

    console.log(`[Mail] Password reset email sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`[Mail] Failed to send password reset email to ${email}:`, err);
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  getTransporter,
};
