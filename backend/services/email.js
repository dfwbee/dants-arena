
const nodemailer = require('nodemailer');

const DEFAULT_FRONTEND_URL = 'http://localhost:3001';

function getFrontendUrl() {
return (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/+$/, '');
}

function buildVerificationUrl(token) {
return `${getFrontendUrl()}/verify.html?token=${encodeURIComponent(token)}`;
}

function createTransport() {
const user = process.env.GMAIL_USER;
const appPassword = process.env.GMAIL_APP_PASSWORD;

if (!user || !appPassword) {
throw new Error('Email verification is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to backend/.env.');
}

return nodemailer.createTransport({
host: 'smtp.gmail.com',
port: 465,
secure: true,
family: 4,
auth: {
user,
pass: appPassword
}
});
}

async function sendVerificationEmail({ email, firstName, token }) {
const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;

if (!from) {
    throw new Error('Email verification is not configured. Add EMAIL_FROM or GMAIL_USER to backend/.env.');
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

const transport = createTransport();
const result = await transport.sendMail({
from,
to: email,
subject: 'Verify your Dants Arena account',
html
});

return result;
}

module.exports = {
buildVerificationUrl,
sendVerificationEmail
};
