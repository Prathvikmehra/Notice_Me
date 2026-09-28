import { createClient } from '@supabase/supabase-js';
import { getDb } from '../services/db.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

export async function requireAuth(req, res, next) {
  if (req.user) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: { message: 'Missing authorization token.' } });
  const token = header.slice(7);
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return res.status(401).json({ error: { message: 'Invalid or expired token.' } });
    const db = typeof req.db === 'function' ? req.db() : getDb();
    const dbUser = await db.user.upsert({
      where: { id: user.id },
      update: { email: user.email },
      create: { id: user.id, email: user.email, name: user.user_metadata?.name || null },
    });
    req.user = dbUser;
    next();
  } catch {
    return res.status(401).json({ error: { message: 'Authentication failed.' } });
  }
}
