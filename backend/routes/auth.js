const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');

const router = express.Router();
const VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000;

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function safeUser(user) {
  const notificationPreferences = user.notification_preferences || {};
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username || '',
    email: user.email,
    emailVerified: !!user.email_verified,
    phone: user.phone || '',
    city: user.city || '',
    role: user.role || 'user',
    membership: user.membership || 'none',
    membershipExpiry: user.membership_expiry || null,
    bookingsUsed: user.bookings_used || 0,
    favouritePosition: user.favourite_position || '',
    notificationPreferences: {
      bookingConfirmations: notificationPreferences.bookingConfirmations !== false,
      eventReminders: notificationPreferences.eventReminders !== false,
      membershipRenewal: notificationPreferences.membershipRenewal !== false,
      promotionalMessages: !!notificationPreferences.promotionalMessages
    },
    createdAt: user.created_at
  };
}

function normalizeNotificationPreferences(preferences) {
  const source = preferences && typeof preferences === 'object' ? preferences : {};
  return {
    bookingConfirmations: source.bookingConfirmations !== false,
    eventReminders: source.eventReminders !== false,
    membershipRenewal: source.membershipRenewal !== false,
    promotionalMessages: !!source.promotionalMessages
  };
}

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getMemberId(user) {
  const raw = (user && user.id ? String(user.id) : '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return raw ? `DA-${raw}` : 'DA-UNKNOWN';
}

function normalizeTimeSlotForSort(timeSlot) {
  const parsed = Date.parse(`1970-01-01 ${timeSlot || ''}`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function buildQrTokenPayload(user, booking) {
  return {
    type: 'member-access',
    memberId: getMemberId(user),
    userId: user.id,
    email: user.email,
    membership: user.membership || 'none',
    bookingId: booking ? booking.booking_id : null,
    bookingFacility: booking ? booking.facility : null,
    bookingDate: booking ? booking.date : null,
    bookingTime: booking ? booking.time_slot : null
  };
}

function buildVerificationFields() {
  return {
    token: generateVerificationToken(),
    expiresAt: new Date(Date.now() + VERIFICATION_WINDOW_MS).toISOString(),
    sentAt: new Date().toISOString()
  };
}

function buildPasswordResetFields() {
  return {
    token: generateVerificationToken(),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_WINDOW_MS).toISOString(),
    sentAt: new Date().toISOString()
  };
}

router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, username, email, phone, password } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    const normalizedUsername = username ? username.toLowerCase().trim() : '';

    if (!firstName || !lastName || !normalizedUsername || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, username, email and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    if (!/^[a-z0-9._-]{3,20}$/.test(normalizedUsername)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3-20 characters and use only letters, numbers, dots, underscores, or hyphens.'
      });
    }

    const { data: existingByEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingByEmail) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const { data: existingByUsername } = await supabase
      .from('users')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (existingByUsername) {
      return res.status(409).json({ success: false, message: 'That username is already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verification = buildVerificationFields();
    const userId = crypto.randomUUID();

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: userId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        email_verified: false,
        email_verification_token: verification.token,
        email_verification_expires_at: verification.expiresAt,
        email_verification_sent_at: verification.sentAt,
        phone: phone ? phone.trim() : '',
        password: hashedPassword,
        role: 'user',
        membership: 'none',
        bookings_used: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('Register insert error:', insertError);
      return res.status(500).json({
        success: false,
        message: insertError.message || 'Failed to create account. Please try again.',
        details: insertError.details || null,
        hint: insertError.hint || null
      });
    }

    try {
      await sendVerificationEmail({
        email: normalizedEmail,
        firstName: firstName.trim(),
        token: verification.token
      });
    } catch (emailError) {
      console.error('Verification email error:', emailError);
      await supabase.from('users').delete().eq('id', newUser.id);
      return res.status(500).json({
        success: false,
        message: emailError.message || 'Could not send verification email.'
      });
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
      message: `Verification email sent to ${normalizedEmail}. Please verify your account before logging in.`
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const normalizedIdentifier = (identifier || email || '').toLowerCase().trim();

    if (!normalizedIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Username or email and password are required.' });
    }

    const query = supabase.from('users').select('*');
    const lookup = normalizedIdentifier.includes('@')
      ? query.eq('email', normalizedIdentifier)
      : query.eq('username', normalizedIdentifier);

    const { data: user, error: fetchError } = await lookup.maybeSingle();

    if (fetchError || !user) {
      return res.status(401).json({ success: false, message: 'No account found with that username or email.' });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email before logging in.'
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    const token = generateToken(user);
    return res.json({
      success: true,
      message: `Welcome back, ${user.first_name}!`,
      token,
      user: safeUser(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email_verification_token', token)
      .maybeSingle();

    if (error || !user) {
      return res.status(400).json({
        success: false,
        message: 'This verification link is invalid or has already been used.'
      });
    }

    if (user.email_verified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Your email is already verified.'
      });
    }

    if (!user.email_verification_expires_at || new Date(user.email_verification_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        expired: true,
        email: user.email,
        message: 'This verification link has expired. Please request a new one.'
      });
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        email_verification_token: null,
        email_verification_expires_at: null
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Verify email update error:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to verify email.' });
    }

    return res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    console.error('Verify email error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const normalizedEmail = (req.body.email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ success: false, message: 'No account found with that email.' });
    }

    if (user.email_verified) {
      return res.json({ success: true, alreadyVerified: true, message: 'This email is already verified.' });
    }

    const verification = buildVerificationFields();
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verification_token: verification.token,
        email_verification_expires_at: verification.expiresAt,
        email_verification_sent_at: verification.sentAt
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Resend verification update error:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to prepare verification email.' });
    }

    await sendVerificationEmail({
      email: normalizedEmail,
      firstName: user.first_name,
      token: verification.token
    });

    return res.json({
      success: true,
      message: `A new verification email has been sent to ${normalizedEmail}.`
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Could not resend verification email.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const successResponse = {
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.'
    };

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error || !user) {
      return res.json(successResponse);
    }

    const reset = buildPasswordResetFields();
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_reset_token: reset.token,
        password_reset_expires_at: reset.expiresAt,
        password_reset_sent_at: reset.sentAt
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Forgot password update error:', updateError);
      return res.status(500).json({ success: false, message: 'Could not prepare a password reset link.' });
    }

    await sendPasswordResetEmail({
      email: user.email,
      firstName: user.first_name,
      token: reset.token
    });

    return res.json(successResponse);
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Could not send a password reset email.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('password_reset_token', token)
      .maybeSingle();

    if (error || !user) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has already been used.' });
    }

    if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'This reset link has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password: hashedPassword,
        password_reset_token: null,
        password_reset_expires_at: null,
        password_reset_sent_at: null
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Reset password update error:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }

    return res.json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/qr-code', requireAuth, async (req, res) => {
  try {
    const [{ data: user, error: userError }, { data: bookings, error: bookingsError }] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('id', req.user.id)
        .single(),
      supabase
        .from('bookings')
        .select('booking_id, facility, date, time_slot, duration, status')
        .eq('user_id', req.user.id)
        .in('status', ['confirmed', 'pending'])
        .order('date', { ascending: true })
    ]);

    if (userError || !user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (bookingsError) {
      console.error('QR bookings fetch error:', bookingsError);
      return res.status(500).json({ success: false, message: 'Could not prepare QR code.' });
    }

    const now = new Date();
    const nextBooking = (bookings || [])
      .filter((booking) => new Date(`${booking.date}T23:59:59`) >= now)
      .sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        return normalizeTimeSlotForSort(a.time_slot) - normalizeTimeSlotForSort(b.time_slot);
      })[0] || null;

    const qrToken = jwt.sign(
      buildQrTokenPayload(user, nextBooking),
      process.env.JWT_SECRET,
      {
        expiresIn: '12h',
        issuer: 'dants-arena',
        audience: 'dants-arena-qr'
      }
    );

    return res.json({
      success: true,
      qrValue: `DANTSARENA:${qrToken}`,
      expiresIn: '12h',
      memberId: getMemberId(user),
      booking: nextBooking ? {
        bookingId: nextBooking.booking_id,
        facility: nextBooking.facility,
        date: nextBooking.date,
        timeSlot: nextBooking.time_slot,
        duration: nextBooking.duration,
        status: nextBooking.status
      } : null
    });
  } catch (err) {
    console.error('Get QR code error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.post('/verify-qr', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const rawToken = String(req.body.token || '').trim();
    if (!rawToken) {
      return res.status(400).json({ success: false, message: 'QR token is required.' });
    }

    const token = rawToken.startsWith('DANTSARENA:') ? rawToken.slice('DANTSARENA:'.length) : rawToken;
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'dants-arena',
      audience: 'dants-arena-qr'
    });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', payload.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: 'QR code owner not found.' });
    }

    const checkInPayload = {
      admin_user_id: req.user.id,
      member_user_id: user.id,
      booking_id: payload.bookingId,
      booking_facility: payload.bookingFacility,
      booking_date: payload.bookingDate,
      booking_time: payload.bookingTime,
      membership: payload.membership
    };

    const { error: checkInError } = await supabase
      .from('qr_checkins')
      .insert(checkInPayload);

    if (checkInError) {
      console.warn('QR check-in log insert warning:', checkInError.message || checkInError);
    }

    return res.json({
      success: true,
      valid: true,
      user: safeUser(user),
      qr: {
        memberId: payload.memberId,
        membership: payload.membership,
        bookingId: payload.bookingId,
        bookingFacility: payload.bookingFacility,
        bookingDate: payload.bookingDate,
        bookingTime: payload.bookingTime
      }
    });
  } catch (err) {
    console.error('Verify QR error:', err);
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'QR code is invalid or has expired.'
    });
  }
});

router.get('/users', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const search = String(req.query.search || '').trim().toLowerCase();
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin users fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }

    const filtered = (users || [])
      .map((user) => safeUser(user))
      .filter((user) => {
        if (!search) return true;
        const haystack = [
          user.firstName,
          user.lastName,
          user.email,
          user.username,
          user.phone,
          user.role,
          user.membership
        ].join(' ').toLowerCase();
        return haystack.includes(search);
      });

    return res.json({ success: true, users: filtered, total: filtered.length });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.put('/users/:id', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const { role, membership } = req.body;
    const updates = {};

    if (role !== undefined) updates.role = role;
    if (membership !== undefined) updates.membership = membership;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'No admin updates provided.' });
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !updatedUser) {
      console.error('Admin user update error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update user.' });
    }

    return res.json({
      success: true,
      message: 'User updated successfully.',
      user: safeUser(updatedUser)
    });
  } catch (err) {
    console.error('Admin user update error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.get('/qr-checkins', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const { data: checkins, error } = await supabase
      .from('qr_checkins')
      .select('*')
      .order('checked_in_at', { ascending: false });

    if (error) {
      console.error('QR check-ins fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch QR check-ins.' });
    }

    return res.json({ success: true, checkins: checkins || [], total: (checkins || []).length });
  } catch (err) {
    console.error('QR check-ins error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.put('/update', requireAuth, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      city,
      favouritePosition,
      notificationPreferences,
      currentPassword,
      newPassword
    } = req.body;
    const updates = {};

    if (firstName !== undefined) updates.first_name = firstName.trim();
    if (lastName !== undefined) updates.last_name = lastName.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (city !== undefined) updates.city = city.trim();
    if (favouritePosition !== undefined) updates.favourite_position = favouritePosition;
    if (notificationPreferences !== undefined) {
      updates.notification_preferences = normalizeNotificationPreferences(notificationPreferences);
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new one.' });
      }

      const { data: user } = await supabase
        .from('users')
        .select('password')
        .eq('id', req.user.id)
        .single();

      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
      }

      updates.password = await bcrypt.hash(newPassword, 12);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update profile.' });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: safeUser(updated)
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;