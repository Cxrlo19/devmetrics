import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getSupabase } from '../db/supabase';
import { incrementScore } from '../services/redis';
import { io } from '../index';

const router = Router();

// Score values for different event types
const SCORES = {
    commit: 10,
    pull_request: 25,
    issue: 15,
    review: 20,
};

// Verify the webhook came from GitHub
// GitHub signs every request with your secret using HMAC-SHA256
function verifyGithubSignature(payload: string, signature: string): boolean {
    const secret = process.env.GITHUB_WEBHOOK_SECRET!;
    const expected = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')}`;
    // Use timingSafeEqual to prevent timing attacks
    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
    );
}

// POST /webhooks/github/:teamId
router.post('/github/:teamId', async (req: Request, res: Response) => {
    const teamId = req.params.teamId as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;

    // Verify signature
    if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
    }

    const rawBody = JSON.stringify(req.body);
    if (!verifyGithubSignature(rawBody, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse the event
    try {
        let eventType: keyof typeof SCORES | null = null;
        let userId: string | null = null;
        let metadata: object = {};

        if (event === 'push') {
            eventType = 'commit';
            const commits = req.body.commits || [];
            metadata = {
                commits: commits.length,
                branch: req.body.ref,
                repo: req.body.repository?.name,
            };

            // Find the user by GitHub email
            const pusherEmail = req.body.pusher?.email;
            if (pusherEmail) {
                const { data: user } = await getSupabase()
                    .from('users')
                    .select('id')
                    .eq('email', pusherEmail)
                    .single();
                userId = user?.id ?? null;
            }
        } else if (event === 'pull_request') {
            eventType = 'pull_request';
            metadata = {
                title: req.body.pull_request?.title,
                action: req.body.action,
                repo: req.body.repository?.name,
            };

            const prEmail = req.body.pull_request?.user?.login;
            if (prEmail) {
                const { data: user } = await getSupabase()
                    .from('users')
                    .select('id')
                    .eq('email', prEmail)
                    .single();
                userId = user?.id ?? null;
            }
        } else if (event === 'issues') {
            eventType = 'issue';
            metadata = {
                title: req.body.issue?.title,
                action: req.body.action,
                repo: req.body.repository?.name,
            };
        }

        // Store the event
        if (eventType) {
            const { data: newEvent } = await getSupabase()
                .from('events')
                .insert({
                    user_id: userId,
                    team_id: teamId,
                    type: eventType,
                    metadata,
                })
                .select()
                .single();

            // Update Redis leaderboard if we know the user
            if (userId) {
                await incrementScore(teamId, userId, SCORES[eventType]);
            }

            // Broadcast to all dashboard clients in real time
            io.to(`team:${teamId}`).emit('event:new', {
                event: newEvent,
                type: eventType,
                score: userId ? SCORES[eventType] : 0,
            });

            console.log(`GitHub ${event} event processed for team ${teamId}`);
        }

        // Always return 200 to GitHub quickly
        return res.json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ error: 'Webhook processing failed' });
    }
});

export default router;