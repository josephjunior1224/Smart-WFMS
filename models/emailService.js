const nodemailer = require('nodemailer');
require('dotenv').config();

// Email Configuration (supports Gmail, Outlook, custom SMTP, or development mode)
let transporter = null;

function initializeEmailService() {
  const emailProvider = process.env.EMAIL_PROVIDER || 'development';
  
  if (emailProvider === 'gmail') {
    // Gmail configuration with App Password
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✓ Email service initialized: Gmail');
  } else if (emailProvider === 'outlook') {
    // Outlook/Office365 configuration
    transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✓ Email service initialized: Outlook');
  } else if (emailProvider === 'custom') {
    // Custom SMTP server
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✓ Email service initialized: Custom SMTP');
  } else {
    // Development mode - log emails to console
    console.log('⚠ Email service in DEVELOPMENT mode (emails logged to console only)');
  }
}

/**
 * Send email notification
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML email content
 * @returns {Promise<boolean>}
 */
async function sendEmail(to, subject, htmlContent) {
  try {
    // In development mode, just log the email
    if (!transporter) {
      console.log('\n📧 [DEV MODE] EMAIL NOTIFICATION');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content:\n${htmlContent}\n`);
      return true;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✓ Email sent to ${to}:`, info.response);
    return true;
  } catch (err) {
    console.error('❌ Email send error:', err.message);
    return false;
  }
}

/**
 * Send task assigned notification
 */
async function sendTaskAssignedEmail(employeeEmail, employeeName, taskTitle, taskId) {
  const subject = `New Task Assigned: ${taskTitle}`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #0f172a;">📋 New Task Assigned</h2>
          <p>Hello <strong>${employeeName}</strong>,</p>
          <p>A new task has been assigned to you:</p>
          <div style="background-color: #f0f4f8; padding: 15px; border-left: 4px solid #10b981; margin: 20px 0;">
            <p><strong>Task:</strong> ${taskTitle}</p>
            <p><strong>Task ID:</strong> ${taskId}</p>
          </div>
          <p>Please log in to the WFMS system to view details and start working on this task.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from Workforce Management System. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
  `;
  return sendEmail(employeeEmail, subject, htmlContent);
}

/**
 * Send task submission notification to admin
 */
async function sendTaskSubmissionEmail(adminEmail, adminName, employeeName, taskTitle, taskId, report) {
  const subject = `Task Report Submitted: ${taskTitle}`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #0f172a;">📝 Task Report Submitted for Review</h2>
          <p>Hello <strong>${adminName}</strong>,</p>
          <p><strong>${employeeName}</strong> has submitted a report for task: <strong>${taskTitle}</strong></p>
          <div style="background-color: #f0f4f8; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
            <p><strong>Employee:</strong> ${employeeName}</p>
            <p><strong>Task:</strong> ${taskTitle}</p>
            <p><strong>Task ID:</strong> ${taskId}</p>
            <p><strong>Report:</strong></p>
            <div style="background-color: white; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${report}</div>
          </div>
          <p>Please log in to the WFMS admin panel to review and approve/reject this report.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from Workforce Management System. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
  `;
  return sendEmail(adminEmail, subject, htmlContent);
}

/**
 * Send task approval notification to employee
 */
async function sendTaskApprovalEmail(employeeEmail, employeeName, taskTitle, feedback) {
  const subject = `Task Approved: ${taskTitle}`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #10b981;">✅ Task Approved</h2>
          <p>Hello <strong>${employeeName}</strong>,</p>
          <p>Your task report for <strong>${taskTitle}</strong> has been <strong style="color: #10b981;">APPROVED</strong>! 🎉</p>
          <div style="background-color: #f0f4f8; padding: 15px; border-left: 4px solid #10b981; margin: 20px 0;">
            <p><strong>Task:</strong> ${taskTitle}</p>
            <p><strong>Admin Feedback:</strong></p>
            <div style="background-color: white; padding: 10px; border-radius: 4px;">${feedback || 'Well done!'}</div>
          </div>
          <p>Keep up the great work!</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from Workforce Management System. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
  `;
  return sendEmail(employeeEmail, subject, htmlContent);
}

/**
 * Send task rejection notification to employee
 */
async function sendTaskRejectionEmail(employeeEmail, employeeName, taskTitle, feedback) {
  const subject = `Task Needs Revision: ${taskTitle}`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #ef4444;">⚠ Task Needs Revision</h2>
          <p>Hello <strong>${employeeName}</strong>,</p>
          <p>Your task report for <strong>${taskTitle}</strong> has been <strong style="color: #ef4444;">REJECTED</strong>. Please review the feedback and resubmit.</p>
          <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 20px 0;">
            <p><strong>Task:</strong> ${taskTitle}</p>
            <p><strong>Admin Feedback:</strong></p>
            <div style="background-color: white; padding: 10px; border-radius: 4px;">${feedback || 'Please see admin notes'}</div>
          </div>
          <p>Please address the issues mentioned above and resubmit your report.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from Workforce Management System. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
  `;
  return sendEmail(employeeEmail, subject, htmlContent);
}

/**
 * Send admin notification about new user registration
 */
async function sendAdminNewUserEmail(adminEmail, adminName, newUserName, newUserEmail, newUserRole) {
  const subject = `New User Registered: ${newUserName}`;
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #0f172a;">👤 New User Registration</h2>
          <p>Hello <strong>${adminName}</strong>,</p>
          <p>A new user has registered in the WFMS system:</p>
          <div style="background-color: #f0f4f8; padding: 15px; border-left: 4px solid #10b981; margin: 20px 0;">
            <p><strong>Name:</strong> ${newUserName}</p>
            <p><strong>Email:</strong> ${newUserEmail}</p>
            <p><strong>Role:</strong> ${newUserRole}</p>
          </div>
          <p>The user can now log in and access the system.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from Workforce Management System. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
  `;
  return sendEmail(adminEmail, subject, htmlContent);
}

module.exports = {
  initializeEmailService,
  sendEmail,
  sendTaskAssignedEmail,
  sendTaskSubmissionEmail,
  sendTaskApprovalEmail,
  sendTaskRejectionEmail,
  sendAdminNewUserEmail
};
