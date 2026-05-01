import { Router, Request, Response } from 'express';
import { getSupabase } from '../db/supabase';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getLeaderboard, getOnlineUsers } from '../services/redis';

const router = Router();

// POST /teams create a team
// Only admins and developers can create teams
router.post('/', authenticate, requireRole('admin', 'developer'), async (req: Request, res: Response) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Team name is required' });
    }

    try {
        // Step 1: Create the team
        const { data: team, error } = await getSupabase()
            .from('teams')
            .insert({
                name,
                owner_id: req.user!.userId,
            })
            .select()
            .single();

        if (error) throw error;

        // Step 2: Add the creator as an admin member
        await getSupabase()
            .from('team_members')
            .insert({
                team_id: team.id,
                user_id: req.user!.userId,
                role: 'admin',
            });

        return res.status(201).json({ team });
    } catch (err) {
        console.error('Create team error:', err);
        return res.status(500).json({ error: 'Failed to create team' });
    }
});

// GET /teams — get all teams the user belongs to
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const { data, error } = await getSupabase()
            .from('team_members')
            .select(`
                role,
                teams (
                    id,
                    name,
                    owner_id,
                    created_at
                )
            `)
            .eq('user_id', req.user!.userId);

        if (error) throw error;

        return res.json({ teams: data });
    } catch (err) {
        console.error('Get teams error:', err);
        return res.status(500).json({ error: 'Failed to get teams' });
    }
});

// POST /teams/:id/invite — invite a user to a team
// Only admins can invite
router.post('/:id/invite', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    const teamId = req.params.id as string;
    const { email, role } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        // Step 1: Find the user by email
        const { data: user, error: userError } = await getSupabase()
            .from('users')
            .select('id, name, email')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Step 2: Check they're not already a member
        const { data: existing } = await getSupabase()
            .from('team_members')
            .select('id')
            .eq('team_id', teamId)
            .eq('user_id', user.id)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'User is already a team member' });
        }

        // Step 3: Add them to the team
        await getSupabase()
            .from('team_members')
            .insert({
                team_id: teamId,
                user_id: user.id,
                role: role || 'developer',
            });

        return res.json({ message: `${user.name} added to team` });
    } catch (err) {
        console.error('Invite error:', err);
        return res.status(500).json({ error: 'Failed to invite user' });
    }
});

// GET /teams/:id/leaderboard — get top developers by score
router.get('/:id/leaderboard', authenticate, async (req: Request, res: Response) => {
    const teamId = req.params.id as string;

    try {
        // Step 1: Get scores from Redis
        const leaderboard = await getLeaderboard(teamId);

        if (leaderboard.length === 0) {
            return res.json({ leaderboard: [] });
        }

        // Step 2: Enrich with user names from Supabase
        const userIds = leaderboard.map(entry => entry.userId);
        const { data: users } = await getSupabase()
            .from('users')
            .select('id, name, email')
            .in('id', userIds);

        const enriched = leaderboard.map(entry => {
            const user = users?.find(u => u.id === entry.userId);
            return {
                user: user ? { id: user.id, name: user.name, email: user.email } : null,
                score: entry.score,
            };
        });

        return res.json({ leaderboard: enriched });
    } catch (err) {
        console.error('Leaderboard error:', err);
        return res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// GET /teams/:id/activity — recent events with pagination
router.get('/:id/activity', authenticate, async (req: Request, res: Response) => {
    const teamId = req.params.id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    try {
        const { data, error, count } = await getSupabase()
            .from('events')
            .select(`
                *,
                users (id, name, email)
            `, { count: 'exact' })
            .eq('team_id', teamId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return res.json({
            events: data,
            pagination: {
                page,
                limit,
                total: count,
                pages: Math.ceil((count || 0) / limit)
            }
        });
    } catch (err) {
        console.error('Activity error:', err);
        return res.status(500).json({ error: 'Failed to get activity' });
    }
});

// GET /teams/:id/presence — who's online right now
router.get('/:id/presence', authenticate, async (req: Request, res: Response) => {
    const teamId = req.params.id as string;

    try {
        const onlineUserIds = await getOnlineUsers(teamId);

        if (onlineUserIds.length === 0) {
            return res.json({ online: [] });
        }

        const { data: users } = await getSupabase()
            .from('users')
            .select('id, name, email')
            .in('id', onlineUserIds);

        return res.json({ online: users });
    } catch (err) {
        console.error('Presence error:', err);
        return res.status(500).json({ error: 'Failed to get presence' });
    }
});

export default router;