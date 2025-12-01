const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const expressWs = require('express-ws');
const compression = require('compression');
const WebSocket = require('ws');
const { config } = require('./config/config');

const app = express();
const PORT = config.server.port;
const COMFYUI_URL = config.comfyui.url;
const COMFYUI_WS_URL = config.comfyui.wsUrl;

expressWs(app);

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: config.server.version,
        timestamp: new Date().toISOString()
    });
});

// ComfyUI HTTP Proxy
app.use('/comfyui', createProxyMiddleware({
    target: COMFYUI_URL,
    changeOrigin: true,
    pathRewrite: { '^/comfyui': '' },
    onError: (err, req, res) => {
        res.status(502).json({
            error: 'ComfyUI connection failed',
            details: err.message
        });
    }
}));

// WebSocket Proxy
const wsConnections = new Map();

app.ws('/comfyui/ws', (clientWs, req) => {
    const clientId = Date.now() + Math.random();
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const queryString = urlParams.toString() ? `?${urlParams.toString()}` : '';
    const comfyWsUrl = `${COMFYUI_WS_URL}/ws${queryString}`;
    
    const comfyWs = new WebSocket(comfyWsUrl);
    wsConnections.set(clientId, { clientWs, comfyWs });
    
    comfyWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
        }
    });
    
    clientWs.on('message', (data) => {
        if (comfyWs.readyState === WebSocket.OPEN) {
            comfyWs.send(data);
        }
    });
    
    comfyWs.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
        }
        wsConnections.delete(clientId);
    });
    
    clientWs.on('close', () => {
        if (comfyWs.readyState === WebSocket.OPEN) {
            comfyWs.close();
        }
        wsConnections.delete(clientId);
    });
});

// Serve static pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log(`🎨 AWDigitalworld AI Hub Pro V${config.server.version}`);
    console.log('='.repeat(60));
    console.log(`\n🚀 Server:  http://0.0.0.0:${PORT}`);
    console.log(`🎨 ComfyUI: ${COMFYUI_URL}`);
    console.log('\n' + '='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
    console.log('\n⏸  Shutting down...');
    wsConnections.forEach((conn) => {
        conn.clientWs.close();
        conn.comfyWs.close();
    });
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
}

module.exports = app;
