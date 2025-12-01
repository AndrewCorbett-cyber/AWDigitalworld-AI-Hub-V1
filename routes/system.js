const express = require('express');
const router = express.Router();
const si = require('systeminformation');
const { exec } = require('child_process');
const util = require('util');
const { getLogger } = require('../utils/logger');

const logger = getLogger();
const execPromise = util.promisify(exec);

const CACHE_TTL = 2000;
let statsCache = { data: null, timestamp: 0 };

async function getGpuStats() {
    try {
        const { stdout } = await execPromise(
            'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits'
        );
        const [gpuUtil, memUsed, memTotal, temp] = stdout.trim().split(',').map(v => parseFloat(v.trim()));
        if (!isNaN(gpuUtil)) {
            return {
                gpu: Math.round(gpuUtil),
                vram: Math.round((memUsed / memTotal) * 100),
                temp: Math.round(temp)
            };
        }
    } catch (error) {
        try {
            const gpuData = await si.graphics();
            if (gpuData.controllers && gpuData.controllers.length > 0) {
                const gpu = gpuData.controllers[0];
                return {
                    gpu: gpu.utilizationGpu || null,
                    vram: gpu.memoryUsed && gpu.memoryTotal
                        ? Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100)
                        : null,
                    temp: gpu.temperatureGpu || null
                };
            }
        } catch (siError) {
            logger.debug('GPU stats unavailable');
        }
    }
    return { gpu: null, vram: null, temp: null };
}

async function collectSystemStats() {
    const [cpuData, memData, gpuStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        getGpuStats()
    ]);

    return {
        cpu: Math.round(cpuData.currentLoad),
        ram: Math.round((memData.used / memData.total) * 100),
        ...gpuStats,
        timestamp: new Date().toISOString()
    };
}

async function getSystemStats(useCache = true) {
    const now = Date.now();
    if (useCache && statsCache.data && (now - statsCache.timestamp) < CACHE_TTL) {
        return { ...statsCache.data, cached: true };
    }
    const stats = await collectSystemStats();
    statsCache = { data: stats, timestamp: now };
    return { ...stats, cached: false };
}

router.get('/stats', async (req, res, next) => {
    try {
        const useCache = req.query.nocache !== 'true';
        const stats = await getSystemStats(useCache);
        res.json({ success: true, stats });
    } catch (error) {
        logger.error('System stats error', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get system stats',
            stats: { cpu: null, ram: null, gpu: null, vram: null, temp: null }
        });
    }
});

module.exports = router;
