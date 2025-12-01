const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');

function createRateLimiter(config = {}) {
    const { windowMs = 15 * 60 * 1000, max = 100 } = config;
    return rateLimit({
        windowMs,
        max,
        message: { error: 'Too many requests, please try again later' },
        standardHeaders: true,
        legacyHeaders: false
    });
}

function createApiRateLimiter() {
    return createRateLimiter({
        windowMs: 1 * 60 * 1000,
        max: 30
    });
}

function securityHeaders() {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"]
            }
        }
    });
}

const validators = {
    config: [
        body('comfyuiUrl')
            .trim()
            .notEmpty()
            .withMessage('ComfyUI URL is required')
            .isURL({ protocols: ['http', 'https'], require_protocol: true })
            .withMessage('Invalid ComfyUI URL format'),
        
        body('autoConnect')
            .optional()
            .isBoolean()
            .withMessage('autoConnect must be a boolean')
    ]
};

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(err => ({
                field: err.param,
                message: err.msg
            }))
        });
    }
    next();
}

function sanitizeInput(req, res, next) {
    const sanitize = (obj) => {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = obj[key]
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/on\w+\s*=/gi, '');
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                sanitize(obj[key]);
            }
        }
    };

    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
}

module.exports = {
    createRateLimiter,
    createApiRateLimiter,
    securityHeaders,
    validators,
    handleValidationErrors,
    sanitizeInput
};
