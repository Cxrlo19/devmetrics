import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getSupabase } from '../db/supabase';
import { signToken } from '../services/jwt';
import crypto from 'crypto';

const router = Router();

// Helper to generate API keys like: dm_live_abc123xyz
function generateApiKey(): string {
    const random = crypto.randomBytes(24).toString('hex');
    return `dm_live_${random}`;
}

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate API key
        const apiKey = generateApiKey();

        // Store user in database
        const { data: user, error } = await getSupabase()
            .from('users')
            .insert({
                name,
                email,
                password: hashedPassword,
                role: role || 'developer',
                api_key: apiKey,
            })
            .select('id, name, email, role, api_key')
            .single();

        if (error) {
            // Postgres unique constraint violation
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Email already exists' });
            }
            throw error;
        }

        // Sign a JWT with the user's info
        const token = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        // Return everything the client needs
        return res.status(201).json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                apiKey: user.api_key,
            },
            token,
        });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Find the user
        const { data: user, error } = await getSupabase()
            .from('users')
            .select('id, name, email, password, role, api_key')
            .eq('email', email)
            .single();

        if (error || !user) {
            // Return same error for security
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare password with hash
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Sign a fresh JWT
        const token = signToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        return res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                apiKey: user.api_key,
            },
            token,
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
});

export default router;