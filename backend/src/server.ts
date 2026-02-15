import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

// Serve uploaded PDFs
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Public endpoints (no auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// Auth middleware for all API routes
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
