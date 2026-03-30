// models/emailService.js
const nodemailer = require('nodemailer');

let transporter = null;

const initializeEmailService = async () => {
  try {
    const { EMAIL_USER, EMAIL_PASS } = process.env;
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.warn('Warning: Email credentials not set. Email notifications disabled.');
      return false;
    }

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });

    await transporter.verify();
    console.log('Email service initialized');
    return true;
  } catch (err) {
    console.error('Email service initialization failed:', err);
    transporter = null;
    return false;
  }
};

const sendEmail = async (to, subject, html) => {
  if (!transporter) {
    console.error('Email service is not initialized.');
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('Email sending failed:', err);
    return false;
  }
};

const sendTaskAssignedEmail = async (email, name, taskTitle, dueDate, notes) => {
  const subject = `New Task Assigned: ${taskTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>New Task Assigned</h2>
      <p>Hello ${name},</p>
      <p>A new task has been assigned to you: <strong>${taskTitle}</strong>.</p>
      <p>Due date: <strong>${dueDate || 'Not specified'}</strong></p>
      <p>Notes: ${notes || 'No additional notes.'}</p>
      <p>Please login to complete the task in the Workforce Management System.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Workforce Management System</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

const sendTaskApprovalEmail = async (email, name, taskTitle, feedback) => {
  const subject = `Task Approved: ${taskTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Task Approved</h2>
      <p>Hello ${name},</p>
      <p>Your task <strong>"${taskTitle}"</strong> has been approved.</p>
      <p>Feedback: ${feedback || 'Great work!'}</p>
      <p>Please login to view details.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Workforce Management System</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

const sendTaskRejectionEmail = async (email, name, taskTitle, feedback) => {
  const subject = `Task Requires Revision: ${taskTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Task Needs Revision</h2>
      <p>Hello ${name},</p>
      <p>Your task <strong>"${taskTitle}"</strong> requires revisions.</p>
      <p>Feedback: ${feedback || 'Please review and resubmit.'}</p>
      <p>Please update and resubmit your report in the system.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Workforce Management System</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

const sendQRCodeEmail = async (email, name, qrData) => {
  const subject = 'Your QR Details';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>QR Access Information</h2>
      <p>Hello ${name},</p>
      <p>Your QR data is ready. Please use it for check-ins and task scanning.</p>
      <pre style="background: #f9f9f9; padding: 10px; border-radius: 4px;">${qrData}</pre>
      <p style="color: #666; font-size: 12px;">Workforce Management System</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

const sendPasswordResetEmail = async (email, resetUrl) => {
  const subject = 'Password Reset Request';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Password Reset</h2>
      <p>We received a request to reset your password. If this was not you, please ignore this email.</p>
      <p>Click below to reset your password:</p>
      <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Workforce Management System</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

const sendAdminNewUserEmail = async (adminEmail, adminName, newUserName, newUserEmail, newUserRole) => {
  const subject = `New User Registered: ${newUserName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>New User Registration</h2>
      <p>Hello ${adminName},</p>
      <p>A new user has joined the system:</p>
      <ul>
        <li><strong>Name:</strong> ${newUserName}</li>
        <li><strong>Email:</strong> ${newUserEmail}</li>
        <li><strong>Role:</strong> ${newUserRole}</li>
      </ul>
      <p>Please review and assign as needed.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Workforce Management System</p>
    </div>
  `;
  return sendEmail(adminEmail, subject, html);
};

module.exports = {
  initializeEmailService,
  sendEmail,
  sendTaskAssignedEmail,
  sendTaskApprovalEmail,
  sendTaskRejectionEmail,
  sendQRCodeEmail,
  sendPasswordResetEmail,
  sendAdminNewUserEmail,
};
