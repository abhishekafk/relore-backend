const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase JWT auth middleware.
 * Verifies "Authorization: Bearer <jwt>" header using Supabase Auth.
 * Attaches req.user to the request on success.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid authorization header' });
  }

  const token = authHeader.slice(7).trim();

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[AUTH] Missing SUPABASE_URL or auth key in environment');
      return res.status(500).json({ error: 'server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      console.error('[AUTH] Token verification failed:', error?.message || 'no user');
      return res.status(401).json({ error: 'invalid or expired token' });
    }

    req.user = data.user;
    req.token = token;
    next();
  } catch (err) {
    console.error('[AUTH] Unexpected error:', err.message);
    return res.status(401).json({ error: 'authentication failed' });
  }
}

module.exports = { requireAuth };
