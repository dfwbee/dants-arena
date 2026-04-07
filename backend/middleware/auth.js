const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', decoded.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Your account could not be verified. Please log in again.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role || 'user'
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token. Please log in again.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };


