import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import { authMiddleware } from './middleware/auth.js';
import groupsRouter from './routes/groups.js';
import invoicesRouter from './routes/invoices.js';
import paymentsRouter from './routes/payments.js';
import servicesRouter from './routes/services.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 4250;

// FINDING-005: Security headers (X-Powered-By, HSTS, X-Frame-Options, CSP, etc.)
// crossOriginOpenerPolicy disabled — Google Sign-In popup requires unrestricted
// window.postMessage between popup and parent (Google's own COOP is same-origin)
app.use(helmet({
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: false
}));

// FINDING-002: Restrict CORS to frontend origin only (no wildcard)
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4251',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition']
}));

app.use(express.json());

// FINDING-008: Rate limiting on API routes
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Příliš mnoho požadavků, zkuste to později' }
}));

// FINDING-004: Uploaded PDFs require authentication
app.use('/uploads', authMiddleware, express.static(path.join(__dirname, '..', 'uploads')));

// Public endpoints (no auth)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// FINDING-003: Authorization is handled at auth level — single-user app (ALLOWED_EMAIL).
// If multi-user support is added in the future, implement RBAC/ownership model.
app.use('/api', authMiddleware);

// Routes
app.use('/api/groups', groupsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/services', servicesRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Serve frontend (production: built Angular app in ../public)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Initialize DB then start (skip in test environment)
if (!process.env.VITEST) {
  initDB().then(() => {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Phone Bills API running on http://0.0.0.0:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

export { app };
