import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import createTopicsRouter from './routes/topics.js';
import createTimelineRouter from './routes/timeline.js';
import createUserRouter from './routes/user.js';
import { startCronScheduler } from './services/cronService.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(db, { auth } = {}) {
  const app = express();
  const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim());
  app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '32kb' }));
  if (auth) app.use(auth);
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/user', createUserRouter(db));
  app.use('/api/topics', createTopicsRouter(db));
  app.use('/api/topics', createTimelineRouter(db));
  app.use(errorHandler);
  return app;
}

const app = createApp();
const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry && process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => {
    console.log(`Backend server running at http://${host}:${port}`);
    startCronScheduler(null);
  });
}

export default app;
