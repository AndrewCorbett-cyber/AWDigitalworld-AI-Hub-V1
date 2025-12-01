const { createProxyMiddleware } = require('http-proxy-middleware');
const WebSocket = require('ws');
const { registerWsConnection, unregisterWsConnection } = require('../utils/shutdown');

function createHttpProxy(comfyConfig, logger) {
    return createProxyMiddleware({
        target: comfyConfig.url,
        changeOrigin: true,
        pathRewrite: { '^/comfyui': '' },
        onProxyReq: (proxyReq, req, res) => {
            logger.http(`Proxying to ComfyUI: ${req.method} ${req.path.replace('/comfyui', '')}`);
        },
        onError: (err, req, res) => {
            logger.error('ComfyUI proxy error', { error: err.message });
            res.status(502).json({
                error: 'ComfyUI connection failed',
                details: err.message
            });
        },
        onProxyRes: (proxyRes, req, res) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        }
    });
}

function createWsProxy(comfyConfig, logger) {
    return (clientWs, req) => {
        const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        logger.info(`WebSocket connected: ${clientId}`);

        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const queryString = urlParams.toString() ? `?${urlParams.toString()}` : '';
        const comfyWsUrl = `${comfyConfig.wsUrl}/ws${queryString}`;

        const comfyWs = new WebSocket(comfyWsUrl);
        registerWsConnection(clientId, clientWs, comfyWs);

        comfyWs.on('open', () => logger.info(`ComfyUI WebSocket connected: ${clientId}`));
        comfyWs.on('message', (data) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
        });
        comfyWs.on('close', () => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
            unregisterWsConnection(clientId);
        });

        clientWs.on('message', (data) => {
            if (comfyWs.readyState === WebSocket.OPEN) comfyWs.send(data);
        });
        clientWs.on('close', () => {
            if (comfyWs.readyState === WebSocket.OPEN) comfyWs.close();
            unregisterWsConnection(clientId);
        });
    };
}

module.exports = { createHttpProxy, createWsProxy };
