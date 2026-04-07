require('dotenv').config();

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('../config/supabase');

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return '';
  return String(process.argv[index + 1]).trim();
}

function printUsage() {
  console.log(`
Usage:
  npm run bootstrap-admin -- --email admin@example.com --username admin --password yourpassword --first-name Admin --last-name User [--phone +2348000000000]

What it does:
  - Creates a new admin user if the email does not exist
  - Promotes an existing user to admin if the email already exists
  `);
}

async function main() {
  const email = getArg('--email').toLowerCase();
  const username = (getArg('--username') || email.split('@')[0] || '').toLowerCase();
  const password = getArg('--password');
  const firstName = getArg('--first-name') || 'Admin';
  const lastName = getArg('--last-name') || 'User';
  const phone = getArg('--phone');

  if (!email) {
    console.error('Missing required --email argument.');
    printUsage();
    process.exit(1);
  }

  if (!password) {
    console.error('Missing required --password argument.');
    printUsage();
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
    console.error('Username must be 3-20 characters and use only letters, numbers, dots, underscores, or hyphens.');
    process.exit(1);
  }

  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (fetchError) {
    console.error('Failed to look up existing user:', fetchError.message || fetchError);
    process.exit(1);
  }

  if (existingUser) {
    const updates = {
      role: 'admin',
      username
    };

    if (!existingUser.password) {
      updates.password = await bcrypt.hash(password, 12);
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', existingUser.id);

    if (updateError) {
      console.error('Failed to promote existing user to admin:', updateError.message || updateError);
      process.exit(1);
    }

    console.log(`Existing user promoted to admin: ${email}`);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from('users')
    .insert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      username,
      email,
      phone,
      password: hashedPassword,
      role: 'admin',
      membership: 'none',
      bookings_used: 0
    });

  if (insertError) {
    console.error('Failed to create admin user:', insertError.message || insertError);
    if (insertError.details) console.error(insertError.details);
    if (insertError.hint) console.error(insertError.hint);
    process.exit(1);
  }

  console.log(`Admin user created successfully: ${email}`);
}

main().catch((error) => {
  console.error('Bootstrap admin failed:', error.message || error);
  process.exit(1);
});
