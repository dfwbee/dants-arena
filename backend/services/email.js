const DEFAULT_FRONTEND_URL = 'http://localhost:3001';

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/+$/, '');
}

function buildVerificationUrl(token) {
  return `${getFrontendUrl()}/verify.html?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetUrl(token) {
  return `${getFrontendUrl()}/reset-password.html?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail({ email, firstName, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error('Email verification is not configured. Add RESEND_API_KEY and EMAIL_FROM to backend/.env.');
  }

  const verifyUrl = buildVerificationUrl(token);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2>Verify your Dants Arena account</h2>
      <p>Hi ${firstName || 'there'},</p>
      <p>Click the button below to verify your email and finish creating your account.</p>
      <p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#00E676;color:#041008;text-decoration:none;border-radius:8px;font-weight:700;">
          Verify Email
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    </div>
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Verify your Dants Arena account',
        html
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to send verification email.');
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPasswordResetEmail({ email, firstName, token }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error('Password reset email is not configured. Add RESEND_API_KEY and EMAIL_FROM to backend/.env.');
  }

  const resetUrl = buildPasswordResetUrl(token);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
      <h2>Reset your Dants Arena password</h2>
      <p>Hi ${firstName || 'there'},</p>
      <p>Click the button below to choose a new password for your account.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#00E676;color:#041008;text-decoration:none;border-radius:8px;font-weight:700;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour. If you didn’t request this, you can ignore this email.</p>
    </div>
  `;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Reset your Dants Arena password',
        html
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to send password reset email.');
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildVerificationUrl,
  buildPasswordResetUrl,
  sendVerificationEmail,
  sendPasswordResetEmail
};