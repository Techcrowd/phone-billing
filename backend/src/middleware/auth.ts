import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL;

if (!CLIENT_ID) throw new Error('Missing GOOGLE_CLIENT_ID environment variable');
if (!ALLOWED_EMAIL) throw new Error('Missing ALLOWED_EMAIL environment variable');

const client = new OAuth2Client(CLIENT_ID);

function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Automatizační přístup (Gmail watcher) přes API klíč
  const apiKey = req.headers['x-api-key'];
  const automationKey = process.env.AUTOMATION_API_KEY;
  if (typeof apiKey === 'string' && automationKey) {
    if (timingSafeEqual(apiKey, automationKey)) return next();
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email.toLowerCase() !== ALLOWED_EMAIL!.toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden — přístup povolen pouze pro ' + ALLOWED_EMAIL });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
