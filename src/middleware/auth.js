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
    // Use anon key for token verification (not service key)
    const supabaseAnon = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabaseAnon.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'invalid or expired token' });
    }

    req.user = data.user;
    req.token = token;
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({ error: 'authentication failed' });
  }
}

module.exports = { requireAuth };
