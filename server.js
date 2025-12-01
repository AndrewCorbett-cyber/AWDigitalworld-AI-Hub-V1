const express = require('express');
const path = require('path');
const cors = require('cors');
const expressWs = require('express-ws');
const compression = require('compression');

const { config } = require('./config/config');
const { createLogger } = require('./utils/logger');
const {
    createRateLimiter,
    createApiRateLimiter,
    securityHeaders,
    sanitizeInput
} = require('./middleware/security');

const configRoutes = require('./routes/config');
const systemRoutes = require('./routes/system');
const healthRoutes = require('./routes/health');
const proxyRoutes = require('./routes/proxy');

const logger = createLogger(config.logging);
const app = express();
expressWs(app);

// Middleware
app.use(securityHeaders());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(logger.requestLogger());
app.use(sanitizeInput);
app.use(createRateLimiter(config.security.rateLimit));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/config', createApiRateLimiter(), configRoutes);
app.use('/api/system', createApiRateLimiter(), systemRoutes);
app.use('/comfyui', proxyRoutes.createHttpProxy(config.comfyui, logger));
app.ws('/comfyui/ws', proxyRoutes.createWsProxy(config.comfyui, logger));

// Static pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, next) => {
    logger.error('Server error', { error: err.message });
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
    console.log('\n' + '='.repeat(60));
    logger.info(`🎨 AWDigitalworld AI Hub Pro V${config.server.version} - Ready`);
    console.log('='.repeat(60));
    logger.info(`🚀 Server:  http://${config.server.host}:${config.server.port}`);
    logger.info(`🎨 ComfyUI: ${config.comfyui.url}`);
    logger.info('✅ Security enabled | ✅ Logging active | ✅ WebSocket ready');
    console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
const shutdown = require('./utils/shutdown');
shutdown.registerHandlers(server, logger);

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message });
    shutdown.gracefulShutdown(1, server, logger);
});

module.exports = app;
