import cron from 'node-cron';
import { getSupabase } from '../db/supabase';
import { getRedis } from './redis';

// Score values — same as webhook route
const SCORES = {
    commit: 10,
    pull_request: 25,
    issue: 15,
    review: 20,
};

// Aggregate yesterday's events into daily_stats
async function aggregateDailyStats() {
    console.log('Running daily stats aggregation...');

    try {
        const supabase = getSupabase();

        // Get yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const date = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

        // Get all events from yesterday
        const { data: events, error } = await supabase
            .from('events')
            .select('user_id, team_id, type')
            .gte('created_at', `${date}T00:00:00Z`)
            .lte('created_at', `${date}T23:59:59Z`)
            .not('user_id', 'is', null);

        if (error) throw error;
        if (!events || events.length === 0) {
            console.log('No events to aggregate for', date);
            return;
        }

        // Group events by user + team
        const statsMap = new Map<string, {
            user_id: string;
            team_id: string;
            commits: number;
            prs: number;
            issues: number;
            reviews: number;
            score: number;
        }>();

        for (const event of events) {
            const key = `${event.user_id}:${event.team_id}`;

            if (!statsMap.has(key)) {
                statsMap.set(key, {
                    user_id: event.user_id,
                    team_id: event.team_id,
                    commits: 0,
                    prs: 0,
                    issues: 0,
                    reviews: 0,
                    score: 0,
                });
            }

            const stat = statsMap.get(key)!;

            if (event.type === 'commit') {
                stat.commits++;
                stat.score += SCORES.commit;
            } else if (event.type === 'pull_request') {
                stat.prs++;
                stat.score += SCORES.pull_request;
            } else if (event.type === 'issue') {
                stat.issues++;
                stat.score += SCORES.issue;
            } else if (event.type === 'review') {
                stat.reviews++;
                stat.score += SCORES.review;
            }
        }

        // Upsert daily stats — insert or update if already exists
        const rows = Array.from(statsMap.values()).map(stat => ({
            ...stat,
            date,
        }));

        const { error: upsertError } = await supabase
            .from('daily_stats')
            .upsert(rows, { onConflict: 'user_id,team_id,date' });

        if (upsertError) throw upsertError;

        console.log(`Aggregated ${events.length} events into ${rows.length} stat rows for ${date}`);
    } catch (err) {
        console.error('Aggregation error:', err);
    }
}

// Refresh Redis leaderboards from Supabase
// This keeps Redis in sync if it ever restarts and loses data
async function refreshLeaderboards() {
    console.log('Refreshing Redis leaderboards...');

    try {
        const supabase = getSupabase();
        const redis = getRedis();

        // Get all time scores grouped by user + team
        const { data, error } = await supabase
            .from('events')
            .select('user_id, team_id, type')
            .not('user_id', 'is', null);

        if (error) throw error;
        if (!data) return;

        // Calculate scores
        const scores = new Map<string, { teamId: string; userId: string; score: number }>();

        for (const event of data) {
            const key = `${event.team_id}:${event.user_id}`;
            if (!scores.has(key)) {
                scores.set(key, {
                    teamId: event.team_id,
                    userId: event.user_id,
                    score: 0,
                });
            }
            const entry = scores.get(key)!;
            entry.score += SCORES[event.type as keyof typeof SCORES] || 0;
        }

        // Update Redis
        for (const entry of scores.values()) {
            await redis.zadd(
                `leaderboard:${entry.teamId}`,
                entry.score,
                entry.userId
            );
        }

        console.log(`Refreshed ${scores.size} leaderboard entries`);
    } catch (err) {
        console.error('Leaderboard refresh error:', err);
    }
}

export function startJobs() {
    // Run daily stats aggregation every day at midnight
    cron.schedule('0 0 * * *', aggregateDailyStats);

    // Refresh leaderboards every hour
    cron.schedule('0 * * * *', refreshLeaderboards);

    // Also refresh leaderboards on startup
    // Handles redis restarts gracefully
    refreshLeaderboards();

    console.log('Background jobs started');
}