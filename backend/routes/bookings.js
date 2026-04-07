const express  = require('express');
const axios    = require('axios');
const supabase = require('../config/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const PRICING = { 60: 15000, 90: 20000, 120: 28000, 180: 40000 };

const FACILITIES = {
  'Football Pitch (5-A-Side)': { openTime: 6, closeTime: 22 }
};

function getFrontendUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

function generateBookingId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'DA-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generateTimeSlots(openTime, closeTime) {
  const slots = [];
  for (let h = openTime; h < closeTime; h++) {
    const hour  = h % 12 === 0 ? 12 : h % 12;
    const ampm  = h < 12 ? 'AM' : 'PM';
    const label = `${String(hour).padStart(2, '0')}:00 ${ampm}`;
    slots.push({ time: label, hour: h });
  }
  return slots;
}

function parseSlotHour(timeSlot) {
  const match = String(timeSlot || '').match(/^(\d{1,2}):00\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const ampm = match[2].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour;
}

function isPastSlot(date, hour) {
  if (hour === null || hour === undefined) return false;
  const slotDate = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  return !Number.isNaN(slotDate.getTime()) && slotDate <= new Date();
}

// GET /api/bookings/slots
router.get('/slots', async (req, res) => {
  try {
    const { date, facility = 'Football Pitch (5-A-Side)' } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required. Format: YYYY-MM-DD' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const config = FACILITIES[facility];
    if (!config) {
      return res.status(400).json({ success: false, message: 'Unknown facility.' });
    }

    const { data: booked, error } = await supabase
      .from('bookings')
      .select('time_slot, duration')
      .eq('date', date)
      .eq('facility', facility)
      .in('status', ['confirmed', 'pending']);

    if (error) {
      console.error('Slots fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch slots.' });
    }

    const bookedHours = new Set();
    (booked || []).forEach(b => {
      const hour = parseSlotHour(b.time_slot);
      if (hour !== null) {
        const hoursUsed = Math.ceil((b.duration || 60) / 60);
        for (let i = 0; i < hoursUsed; i++) bookedHours.add(hour + i);
      }
    });

    const slots = generateTimeSlots(config.openTime, config.closeTime).map(slot => ({
      time:      slot.time,
      available: !bookedHours.has(slot.hour) && !isPastSlot(date, slot.hour),
      status: bookedHours.has(slot.hour) ? 'booked' : (isPastSlot(date, slot.hour) ? 'passed' : 'available')
    }));

    return res.json({ success: true, date, facility, slots, pricing: PRICING });

  } catch (err) {
    console.error('Slots error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/bookings/create
router.post('/create', requireAuth, async (req, res) => {
  try {
    const {
      facility = 'Football Pitch (5-A-Side)',
      date,
      timeSlot,
      duration = 60,
      teamName,
      specialRequests,
      paymentMethod = 'pay_on_arrival'
    } = req.body;

    if (!date || !timeSlot) {
      return res.status(400).json({ success: false, message: 'Date and time slot are required.' });
    }

    const slotHour = parseSlotHour(timeSlot);
    if (isPastSlot(date, slotHour)) {
      return res.status(400).json({ success: false, message: 'You cannot book a time slot that has already passed.' });
    }

    const { data: conflict } = await supabase
      .from('bookings')
      .select('id')
      .eq('date', date)
      .eq('facility', facility)
      .eq('time_slot', timeSlot)
      .in('status', ['confirmed', 'pending'])
      .maybeSingle();

    if (conflict) {
      return res.status(409).json({ success: false, message: 'This slot has just been booked. Please choose another time.' });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('membership, bookings_used')
      .eq('id', req.user.id)
      .single();

    const membership   = userData ? userData.membership   : 'none';
    const bookingsUsed = userData ? userData.bookings_used : 0;
    const limits       = { bronze: 2, silver: 6, gold: Infinity, none: Infinity };
    const limit        = limits[membership] !== undefined ? limits[membership] : Infinity;

    if (bookingsUsed >= limit) {
      return res.status(403).json({
        success: false,
        message: `You've used all ${limit} bookings in your ${membership} plan this month. Upgrade to book more.`
      });
    }

    const totalAmount = PRICING[duration] || PRICING[60];
    const bookingId   = generateBookingId();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        booking_id:       bookingId,
        user_id:          req.user.id,
        facility,
        date,
        time_slot:        timeSlot,
        duration,
        team_name:        teamName        || '',
        special_requests: specialRequests || '',
        total_amount:     totalAmount,
        payment_method:   paymentMethod,
        payment_status:   'pending',
        status:           'confirmed'
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Booking create error:', bookingError);
      return res.status(500).json({ success: false, message: 'Failed to create booking. Please try again.' });
    }

    if (membership !== 'none') {
      await supabase
        .from('users')
        .update({ bookings_used: bookingsUsed + 1 })
        .eq('id', req.user.id);
    }

    return res.status(201).json({
      success: true,
      message: 'Booking confirmed! ✅',
      booking: {
        id:            booking.id,
        bookingId:     booking.booking_id,
        facility:      booking.facility,
        date:          booking.date,
        timeSlot:      booking.time_slot,
        duration:      booking.duration,
        totalAmount:   booking.total_amount,
        paymentMethod: booking.payment_method,
        status:        booking.status,
        createdAt:     booking.created_at
      }
    });

  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/bookings/my
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', req.user.id)
      .order('date', { ascending: false });

    if (error) {
      console.error('My bookings error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
    }

    const formatted = (bookings || []).map(b => ({
      id:            b.id,
      bookingId:     b.booking_id,
      facility:      b.facility,
      date:          b.date,
      timeSlot:      b.time_slot,
      duration:      b.duration,
      teamName:      b.team_name,
      totalAmount:   b.total_amount,
      paymentMethod: b.payment_method,
      paymentStatus: b.payment_status,
      status:        b.status,
      createdAt:     b.created_at
    }));

    return res.json({ success: true, bookings: formatted, total: formatted.length });

  } catch (err) {
    console.error('Get bookings error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/bookings/cancel/:id
router.put('/cancel/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle();

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only cancel your own bookings.' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This booking is already cancelled.' });
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      console.error('Cancel error:', error);
      return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
    }

    return res.json({ success: true, message: 'Booking cancelled successfully.' });

  } catch (err) {
    console.error('Cancel booking error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/bookings/reschedule/:id
router.put('/reschedule/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, timeSlot, duration } = req.body;

    if (!date || !timeSlot) {
      return res.status(400).json({ success: false, message: 'Date and time slot are required.' });
    }

    const slotHour = parseSlotHour(timeSlot);
    if (isPastSlot(date, slotHour)) {
      return res.status(400).json({ success: false, message: 'You cannot reschedule to a time slot that has already passed.' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only reschedule your own bookings.' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Cancelled bookings cannot be rescheduled.' });
    }

    const { data: conflict } = await supabase
      .from('bookings')
      .select('id')
      .eq('date', date)
      .eq('facility', booking.facility)
      .eq('time_slot', timeSlot)
      .in('status', ['confirmed', 'pending'])
      .neq('id', id)
      .maybeSingle();

    if (conflict) {
      return res.status(409).json({ success: false, message: 'That slot is already booked. Please choose another.' });
    }

    const nextDuration = duration || booking.duration;
    const totalAmount = PRICING[nextDuration] || booking.total_amount;

    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({
        date,
        time_slot: timeSlot,
        duration: nextDuration,
        total_amount: totalAmount
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updatedBooking) {
      console.error('Reschedule booking error:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to reschedule booking.' });
    }

    return res.json({
      success: true,
      message: 'Booking rescheduled successfully.',
      booking: {
        id: updatedBooking.id,
        bookingId: updatedBooking.booking_id,
        facility: updatedBooking.facility,
        date: updatedBooking.date,
        timeSlot: updatedBooking.time_slot,
        duration: updatedBooking.duration,
        totalAmount: updatedBooking.total_amount,
        status: updatedBooking.status
      }
    });
  } catch (err) {
    console.error('Reschedule booking error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/bookings/initiate-payment
router.post('/initiate-payment', requireAuth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Booking ID is required.' });
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('user_id', req.user.id)
      .single();

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.payment_status === 'paid') {
      return res.status(400).json({ success: false, message: 'This booking is already paid.' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('id', req.user.id)
      .single();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const reference = `DANTS-BK-${booking.booking_id}-${Date.now()}`;
    const amount    = booking.total_amount * 100; // kobo

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:        user.email,
        amount,
        reference,
        callback_url: `${getFrontendUrl()}/booking.html?payment=success`,
        metadata:     {
          user_id:     req.user.id,
          booking_id:  booking.id,
          booking_ref: booking.booking_id,
          type:        'booking'
        }
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { data: paystackData } = paystackResponse;

    if (!paystackData.status) {
      return res.status(500).json({ success: false, message: 'Payment initiation failed. Please try again.' });
    }

    return res.json({
      success:          true,
      message:          'Payment initiated.',
      authorizationUrl: paystackData.data.authorization_url,
      reference:        paystackData.data.reference
    });

  } catch (err) {
    console.error('Initiate booking payment error:', err.response ? err.response.data : err.message);
    return res.status(500).json({ success: false, message: 'Failed to initiate payment. Please try again.' });
  }
});

// POST /api/bookings/verify-payment
router.post('/verify-payment', requireAuth, async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Payment reference is required.' });
    }

    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const txn = paystackResponse.data.data;

    if (!txn || txn.status !== 'success') {
      return res.status(400).json({ success: false, message: 'Payment not successful. Contact support if amount was deducted.' });
    }

    const { booking_id } = txn.metadata;

    const { error } = await supabase
      .from('bookings')
      .update({ payment_status: 'paid', payment_method: 'online' })
      .eq('id', booking_id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('Update booking payment error:', error);
      return res.status(500).json({ success: false, message: 'Payment verified but failed to update booking. Contact support.' });
    }

    return res.json({
      success: true,
      message: '✅ Payment confirmed! Your booking is fully paid.'
    });

  } catch (err) {
    console.error('Verify booking payment error:', err.response ? err.response.data : err.message);
    return res.status(500).json({ success: false, message: 'Payment verification failed.' });
  }
});

// GET /api/bookings/all (admin)
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const { date, status, facility } = req.query;

    let query = supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: false });

    if (date)     query = query.eq('date', date);
    if (status)   query = query.eq('status', status);
    if (facility) query = query.eq('facility', facility);

    const { data: bookings, error } = await query;

    if (error) {
      console.error('All bookings error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
    }

    const userIds = [...new Set((bookings || []).map((booking) => booking.user_id).filter(Boolean))];
    let usersById = {};

    if (userIds.length) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, username, phone, role')
        .in('id', userIds);

      if (usersError) {
        console.error('Admin bookings users error:', usersError);
        return res.status(500).json({ success: false, message: 'Failed to fetch booking users.' });
      }

      usersById = (users || []).reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
    }

    const formatted = (bookings || []).map((booking) => {
      const owner = usersById[booking.user_id] || null;
      return {
        id: booking.id,
        bookingId: booking.booking_id,
        userId: booking.user_id,
        facility: booking.facility,
        date: booking.date,
        timeSlot: booking.time_slot,
        duration: booking.duration,
        teamName: booking.team_name || '',
        specialRequests: booking.special_requests || '',
        totalAmount: booking.total_amount,
        paymentMethod: booking.payment_method,
        paymentStatus: booking.payment_status,
        status: booking.status,
        createdAt: booking.created_at,
        user: owner ? {
          id: owner.id,
          firstName: owner.first_name,
          lastName: owner.last_name,
          email: owner.email,
          username: owner.username || '',
          phone: owner.phone || '',
          role: owner.role || 'user'
        } : null
      };
    });

    return res.json({ success: true, bookings: formatted, total: formatted.length });

  } catch (err) {
    console.error('Admin bookings error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;


