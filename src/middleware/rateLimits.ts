import rateLimit from 'express-rate-limit';

//Adding a global rate limiter, applies to all routes
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests, please try again later'
    },
    handler: (req, res, next, options) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json(options.message)
    }
});

//stricter limit for auth routes
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, //15 minutes 
    max: 3, //50 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests, please try again later'
    },
    handler: (req, res, next, options) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json(options.message)
    }
});

//Webhooks limiter, Github sends a lot of events

export const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, //15 minutes 
    max: 1000, //1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests, please try again later'
    }
});