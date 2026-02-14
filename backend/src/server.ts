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

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth middleware for all API routes
app.use('/api', authMiddleware);

// Routes
app.use('/api/groups', groupsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/services', servicesRouter);

// Initialize DB then start
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Phone Bills API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

export { app };
