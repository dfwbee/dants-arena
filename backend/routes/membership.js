const express  = require('express');
const axios    = require('axios');
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getFrontendUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

const PLANS = {
  bronze: {
    name:        'Bronze',
    price:       5000,
    bookings:    2,
    description: '2 bookings per month',
    features:    ['2 pitch bookings/month', 'Member locker access', 'Early event registration']
  },
  silver: {
    name:        'Silver',
    price:       12000,
    bookings:    6,
    description: '6 bookings per month',
    features:    ['6 pitch bookings/month', 'Member locker access', 'Early event registration', 'Discount on events', 'Priority slot booking']
  },
  gold: {
    name:        'Gold',
    price:       25000,
    bookings:    'Unlimited',
    description: 'Unlimited bookings',
    features:    ['Unlimited pitch bookings', 'Member locker access', 'Free event entry', 'Priority slot booking', 'Guest passes (2/month)', 'Members lounge access']
  }
};

// GET /api/membership/plans
router.get('/plans', (_req, res) => {
  return res.json({ success: true, plans: PLANS });
});

// GET /api/membership/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('membership, membership_expiry, bookings_used')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const plan     = user.membership || 'none';
    const isActive = plan !== 'none' && user.membership_expiry && new Date(user.membership_expiry) > new Date();
    const limits   = { bronze: 2, silver: 6, gold: Infinity, none: 0 };
    const limit    = limits[plan] !== undefined ? limits[plan] : 0;

    return res.json({
      success: true,
      membership: {
        plan,
        isActive,
        expiry:        user.membership_expiry || null,
        bookingsUsed:  user.bookings_used || 0,
        bookingsLimit: limit === Infinity ? 'Unlimited' : limit,
        planDetails:   plan !== 'none' ? PLANS[plan] : null
      }
    });

  } catch (err) {
    console.error('Membership status error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/membership/subscribe
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan. Choose: bronze, silver, or gold.' });
    }

    const planData = PLANS[plan];
    const amount   = planData.price * 100; // kobo

    const { data: user } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('id', req.user.id)
      .single();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:        user.email,
        amount,
        reference:    `DANTS-MEM-${req.user.id}-${Date.now()}`,
        callback_url: `${getFrontendUrl()}/membership.html?payment=success`,
        metadata:     { user_id: req.user.id, plan, type: 'membership', user_name: user.first_name }
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

    await supabase.from('payments').insert({
      user_id:   req.user.id,
      plan,
      amount:    planData.price,
      reference: paystackData.data.reference,
      status:    'pending',
      type:      'membership'
    });

    return res.json({
      success:          true,
      message:          'Payment initiated. Redirecting...',
      authorizationUrl: paystackData.data.authorization_url,
      reference:        paystackData.data.reference
    });

  } catch (err) {
    console.error('Subscribe error:', err.response ? err.response.data : err.message);
    return res.status(500).json({ success: false, message: 'Failed to initiate payment. Please try again.' });
  }
});

// POST /api/membership/verify-payment
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

    const { plan } = txn.metadata;

    if (!PLANS[plan]) {
      return res.status(400).json({ success: false, message: 'Invalid plan in payment metadata.' });
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await supabase
      .from('users')
      .update({ membership: plan, membership_expiry: expiry.toISOString(), bookings_used: 0 })
      .eq('id', req.user.id);

    await supabase
      .from('payments')
      .update({ status: 'success' })
      .eq('reference', reference);

    return res.json({
      success: true,
      message: `🎉 ${PLANS[plan].name} membership activated until ${expiry.toDateString()}!`,
      plan,
      expiry: expiry.toISOString()
    });

  } catch (err) {
    console.error('Verify payment error:', err.response ? err.response.data : err.message);
    return res.status(500).json({ success: false, message: 'Payment verification failed.' });
  }
});

// PUT /api/membership/cancel
router.put('/cancel', requireAuth, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('membership')
      .eq('id', req.user.id)
      .single();

    if (!user || user.membership === 'none') {
      return res.status(400).json({ success: false, message: 'You do not have an active membership.' });
    }

    await supabase
      .from('users')
      .update({ membership: 'none', membership_expiry: null, bookings_used: 0 })
      .eq('id', req.user.id);

    return res.json({ success: true, message: 'Membership cancelled. You can re-subscribe anytime.' });

  } catch (err) {
    console.error('Cancel membership error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
