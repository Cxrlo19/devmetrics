import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/jwt';
import { getSupabase } from '../db/supabase';

declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                email: string;
                role: string;
                teamId?: string;
            };
        }
    }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const payload = verifyToken(token);
            req.user = {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
            };
            return next();
        }

        const apiKey = req.headers['x-api-key'] as string;
        if (apiKey) {
            const { data: user, error } = await getSupabase()
                .from('users')
                .select('id, email, role')
                .eq('api_key', apiKey)
                .single();

            if (error || !user) {
                return res.status(401).json({ error: 'Invalid API key' });
            }

            req.user = {
                userId: user.id,
                email: user.email,
                role: user.role,
            };
            return next();
        }

        return res.status(401).json({ error: 'Authentication required' });
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}