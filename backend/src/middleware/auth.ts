import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL;

if (!CLIENT_ID) throw new Error('Missing GOOGLE_CLIENT_ID environment variable');
if (!ALLOWED_EMAIL) throw new Error('Missing ALLOWED_EMAIL environment variable');

const client = new OAuth2Client(CLIENT_ID);

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
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
