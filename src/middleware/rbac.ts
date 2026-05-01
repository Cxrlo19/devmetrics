import { Request, Response, NextFunction } from 'express';

type Role = 'admin' | 'developer' | 'viewer';

// returns a middleware that checks for a specific role
export function requireRole(...roles: Role[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role as Role)) {
            return res.status(403).json({
                error: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }

        return next();
    };
}