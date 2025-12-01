const fs = require('fs');
const path = require('path');

class Logger {
    constructor(config = {}) {
        this.level = config.level || 'info';
        this.format = config.format || 'simple';
        this.logsDir = config.logsDir || path.join(__dirname, '../logs');
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            debug: 4
        };

        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        
        if (this.format === 'json') {
            return JSON.stringify({ timestamp, level: level.toUpperCase(), message, ...meta });
        }
        
        const emoji = {
            error: '❌',
            warn: '⚠️ ',
            info: 'ℹ️ ',
            http: '🌐',
            debug: '🔍'
        };

        const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
        return `${emoji[level] || '  '} ${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    }

    writeToFile(level, formattedMessage) {
        const filename = `${level}-${new Date().toISOString().split('T')[0]}.log`;
        const filepath = path.join(this.logsDir, filename);
        fs.appendFileSync(filepath, formattedMessage + '\n', 'utf8');
    }

    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;

        const formattedMessage = this.formatMessage(level, message, meta);
        const consoleMethod = level === 'error' ? console.error : console.log;
        consoleMethod(formattedMessage);

        if (level === 'error' || level === 'warn') {
            try {
                this.writeToFile(level, formattedMessage);
            } catch (err) {
                console.error('Failed to write to log file:', err);
            }
        }
    }

    error(message, meta = {}) { this.log('error', message, meta); }
    warn(message, meta = {}) { this.log('warn', message, meta); }
    info(message, meta = {}) { this.log('info', message, meta); }
    http(message, meta = {}) { this.log('http', message, meta); }
    debug(message, meta = {}) { this.log('debug', message, meta); }

    requestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 400 ? 'warn' : 'http';
                this.log(level, `${req.method} ${req.path}`, {
                    status: res.statusCode,
                    duration: `${duration}ms`
                });
            });
            next();
        };
    }
}

let loggerInstance = null;

function createLogger(config) {
    if (!loggerInstance) {
        loggerInstance = new Logger(config);
    }
    return loggerInstance;
}

function getLogger() {
    if (!loggerInstance) {
        loggerInstance = new Logger();
    }
    return loggerInstance;
}

module.exports = { Logger, createLogger, getLogger };
