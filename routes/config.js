const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { validators, handleValidationErrors } = require('../middleware/security');
const { getLogger } = require('../utils/logger');
const { config } = require('../config/config');

const logger = getLogger();
const CONFIG_FILE = path.join(config.paths.data, 'config.json');

const DEFAULT_CONFIG = {
    comfyuiUrl: config.comfyui.url,
    backendUrl: null,
    autoConnect: true,
    lastUpdated: new Date().toISOString()
};

async function loadConfig() {
    try {
        await fs.mkdir(config.paths.data, { recursive: true });
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await saveConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }
        throw error;
    }
}

async function saveConfig(configData) {
    const dataToSave = {
        ...configData,
        lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
}

router.get('/', async (req, res, next) => {
    try {
        const currentConfig = await loadConfig();
        res.json({ success: true, config: currentConfig });
    } catch (error) {
        logger.error('Failed to load config', { error: error.message });
        next(error);
    }
});

router.post('/', validators.config, handleValidationErrors, async (req, res, next) => {
    try {
        const { comfyuiUrl, backendUrl, autoConnect } = req.body;
        const newConfig = {
            comfyuiUrl,
            backendUrl: backendUrl || null,
            autoConnect: autoConnect !== false
        };
        await saveConfig(newConfig);
        res.json({ success: true, config: newConfig });
    } catch (error) {
        logger.error('Failed to save config', { error: error.message });
        next(error);
    }
});

module.exports = router;
