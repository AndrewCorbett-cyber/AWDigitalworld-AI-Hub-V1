const WebSocket = require('ws');

const activeConnections = {
    http: new Set(),
    ws: new Map()
};

let isShuttingDown = false;

function trackHttpConnections(server) {
    server.on('connection', (conn) => {
        activeConnections.http.add(conn);
        conn.on('close', () => {
            activeConnections.http.delete(conn);
        });
    });
}

function registerWsConnection(clientId, clientWs, comfyWs) {
    activeConnections.ws.set(clientId, { clientWs, comfyWs });
}

function unregisterWsConnection(clientId) {
    activeConnections.ws.delete(clientId);
}

async function gracefulShutdown(exitCode = 0, server, logger) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('⏸  Initiating graceful shutdown...');

    if (server) {
        server.close(() => logger.info('✔ HTTP server closed'));
    }

    if (activeConnections.ws.size > 0) {
        logger.info(`Closing ${activeConnections.ws.size} WebSocket connections...`);
        activeConnections.ws.forEach((conn, id) => {
            try {
                if (conn.clientWs.readyState === WebSocket.OPEN) {
                    conn.clientWs.close(1001, 'Server shutting down');
                }
                if (conn.comfyWs.readyState === WebSocket.OPEN) {
                    conn.comfyWs.close(1001, 'Server shutting down');
                }
            } catch (error) {
                logger.error(`Error closing WebSocket ${id}`, { error: error.message });
            }
        });
        activeConnections.ws.clear();
    }

    if (activeConnections.http.size > 0) {
        activeConnections.http.forEach((conn) => conn.destroy());
        activeConnections.http.clear();
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    logger.info('✔ Graceful shutdown complete');
    process.exit(exitCode);
}

function registerHandlers(server, logger) {
    trackHttpConnections(server);

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM signal');
        gracefulShutdown(0, server, logger);
    });

    process.on('SIGINT', () => {
        logger.info('Received SIGINT signal');
        gracefulShutdown(0, server, logger);
    });

    const shutdownTimeout = setTimeout(() => {
        logger.error('⚠  Shutdown timeout - forcing exit');
        process.exit(1);
    }, 10000);

    shutdownTimeout.unref();
}

module.exports = {
    registerHandlers,
    gracefulShutdown,
    registerWsConnection,
    unregisterWsConnection,
    activeConnections
};
