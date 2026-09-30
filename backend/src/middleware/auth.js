import { createClient } from '@supabase/supabase-js';
import { getDb } from '../services/db.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

let sharedSupabase = null;
function getSupabase() {
  if (!sharedSupabase && supabaseUrl && supabaseKey) {
    sharedSupabase = createClient(supabaseUrl, supabaseKey);
  }
  return sharedSupabase;
}

// User memory cache: token -> { user, expiresAt }
const userCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function requireAuth(req, res, next) {
  if (req.user) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: { message: 'Missing authorization token.' } });
  const token = header.slice(7);

  // Check in-memory session cache
  const cached = userCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    return next();
  }

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

    userCache.set(token, { user: dbUser, expiresAt: Date.now() + CACHE_TTL_MS });

    // Evict expired entries when cache exceeds threshold
    if (userCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of userCache) {
        if (v.expiresAt <= now) userCache.delete(k);
      }
    }

    req.user = dbUser;
    next();
  } catch {
    return res.status(401).json({ error: { message: 'Authentication failed.' } });
  }
}

export function clearUserCache() {
  userCache.clear();
}
