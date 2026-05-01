import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth';
import teamsRoutes from './routes/teams';
import webhooksRoutes from './routes/webhooks';
import { startJobs } from './services/jobs';
import { globalLimiter, authLimiter, webhookLimiter } from './middleware/rateLimits';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.io needs the raw HTTP server, not just Express
export const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());
app.use(globalLimiter);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));


// Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/webhooks', webhookLimiter, webhooksRoutes);
app.use('/teams', teamsRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join:team', (teamId: string) => {
        socket.join(`team:${teamId}`);
        console.log(`${socket.id} joined team:${teamId}`);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});




const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`DevMetrics running on port ${PORT}`));

// Starts background jobs
startJobs();
