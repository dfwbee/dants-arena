const express  = require('express');
const supabase = require('../config/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/events/all
router.get('/all', async (req, res) => {
  try {
    const { month, year, type } = req.query;

    let query = supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (type) query = query.eq('type', type);

    if (month && year) {
      const paddedMonth = String(month).padStart(2, '0');
      const start       = `${year}-${paddedMonth}-01`;
      const lastDay     = new Date(Number(year), Number(month), 0).getDate();
      const end         = `${year}-${paddedMonth}-${lastDay}`;
      query = query.gte('date', start).lte('date', end);
    } else {
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('date', today);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Events fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch events.' });
    }

    return res.json({ success: true, events: events || [], total: (events || []).length });

  } catch (err) {
    console.error('Events error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    return res.json({ success: true, event });

  } catch (err) {
    console.error('Get event error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/events/create (admin)
router.post('/create', requireAdmin, async (req, res) => {
  try {
    const { title, description, date, time, type, price, totalSpots, prize } = req.body;

    if (!title || !date || !time) {
      return res.status(400).json({ success: false, message: 'Title, date and time are required.' });
    }

    const { data: event, error } = await supabase
      .from('events')
      .insert({
        title:            title.trim(),
        description:      description   || '',
        date,
        time,
        type:             type          || 'tournament',
        price:            price         || 0,
        total_spots:      totalSpots    || 16,
        registered_count: 0,
        prize:            prize         || ''
      })
      .select()
      .single();

    if (error) {
      console.error('Create event error:', error);
      return res.status(500).json({ success: false, message: 'Failed to create event.' });
    }

    return res.status(201).json({ success: true, message: 'Event created successfully.', event });

  } catch (err) {
    console.error('Create event error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/events/update/:id (admin)
router.put('/update/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, date, time, type, price, totalSpots, prize } = req.body;

    const updates = {};
    if (title !== undefined)      updates.title       = title.trim();
    if (description !== undefined) updates.description = description;
    if (date !== undefined)       updates.date        = date;
    if (time !== undefined)       updates.time        = time;
    if (type !== undefined)       updates.type        = type;
    if (price !== undefined)      updates.price       = price;
    if (totalSpots !== undefined) updates.total_spots = totalSpots;
    if (prize !== undefined)      updates.prize       = prize;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    const { data: event, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      console.error('Update event error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update event.' });
    }

    return res.json({ success: true, message: 'Event updated.', event });

  } catch (err) {
    console.error('Update event error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/events/delete/:id (admin)
router.delete('/delete/:id', requireAdmin, async (req, res) => {
  try {
    await supabase.from('event_registrations').delete().eq('event_id', req.params.id);

    const { error } = await supabase.from('events').delete().eq('id', req.params.id);

    if (error) {
      console.error('Delete event error:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete event.' });
    }

    return res.json({ success: true, message: 'Event deleted.' });

  } catch (err) {
    console.error('Delete event error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/events/:id/registrations (admin)
router.get('/:id/registrations', requireAdmin, async (req, res) => {
  try {
    const { data: registrations, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Event registrations fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch event registrations.' });
    }

    const userIds = [...new Set((registrations || []).map((registration) => registration.user_id).filter(Boolean))];
    let usersById = {};

    if (userIds.length) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, username, phone')
        .in('id', userIds);

      if (usersError) {
        console.error('Event registrations users error:', usersError);
        return res.status(500).json({ success: false, message: 'Failed to fetch registration users.' });
      }

      usersById = (users || []).reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});
    }

    const formatted = (registrations || []).map((registration) => ({
      id: registration.id,
      eventId: registration.event_id,
      userId: registration.user_id,
      attended: !!registration.attended,
      checkedInAt: registration.checked_in_at || null,
      createdAt: registration.created_at,
      user: usersById[registration.user_id] ? {
        id: usersById[registration.user_id].id,
        firstName: usersById[registration.user_id].first_name,
        lastName: usersById[registration.user_id].last_name,
        email: usersById[registration.user_id].email,
        username: usersById[registration.user_id].username || '',
        phone: usersById[registration.user_id].phone || ''
      } : null
    }));

    return res.json({ success: true, registrations: formatted, total: formatted.length });
  } catch (err) {
    console.error('Event registrations error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/events/registrations/:id (admin)
router.put('/registrations/:id', requireAdmin, async (req, res) => {
  try {
    const attended = !!req.body.attended;
    const { data: updated, error } = await supabase
      .from('event_registrations')
      .update({
        attended,
        checked_in_at: attended ? new Date().toISOString() : null
      })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !updated) {
      console.error('Update event registration error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update registration.' });
    }

    return res.json({ success: true, message: 'Registration updated.', registration: updated });
  } catch (err) {
    console.error('Update event registration error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/events/registrations/:id (admin)
router.delete('/registrations/:id', requireAdmin, async (req, res) => {
  try {
    const { data: registration, error: registrationError } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (registrationError || !registration) {
      return res.status(404).json({ success: false, message: 'Registration not found.' });
    }

    const { error: deleteError } = await supabase
      .from('event_registrations')
      .delete()
      .eq('id', req.params.id);

    if (deleteError) {
      console.error('Delete registration error:', deleteError);
      return res.status(500).json({ success: false, message: 'Failed to remove attendee.' });
    }

    const { data: event } = await supabase
      .from('events')
      .select('registered_count')
      .eq('id', registration.event_id)
      .single();

    await supabase
      .from('events')
      .update({ registered_count: Math.max(0, Number(event?.registered_count || 1) - 1) })
      .eq('id', registration.event_id);

    return res.json({ success: true, message: 'Attendee removed successfully.' });
  } catch (err) {
    console.error('Delete event registration error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/events/register/:id
router.post('/register/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    if (event.registered_count >= event.total_spots) {
      return res.status(400).json({ success: false, message: 'Sorry, this event is full.' });
    }

    const { data: existing } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('event_id', id)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, message: 'You are already registered for this event.' });
    }

    const { error: regError } = await supabase
      .from('event_registrations')
      .insert({ user_id: req.user.id, event_id: id });

    if (regError) {
      console.error('Event registration error:', regError);
      return res.status(500).json({ success: false, message: 'Failed to register. Please try again.' });
    }

    await supabase
      .from('events')
      .update({ registered_count: event.registered_count + 1 })
      .eq('id', id);

    const spotsLeft = event.total_spots - event.registered_count - 1;

    return res.status(201).json({
      success:    true,
      message:    `✅ You're registered for ${event.title}! ${spotsLeft} spots remaining.`,
      spotsLeft
    });

  } catch (err) {
    console.error('Register for event error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
