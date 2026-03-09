const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

/**
 * Storage Engine
 * Implementation of an ACID-like local JSON file storage with 
 * Write-Ahead-Log (Temp file rename) to guarantee file integrity and
 * an async write queue for concurrent safety in NodeJS.
 */
class SynapseStorage {
    /**
     * @param {string} filePath - Path to the JSON file
     * @param {object} defaultData - Default structure if missing
     */
    constructor(filePath, defaultData = {}) {
        this.filePath = filePath;
        this.defaultData = defaultData;
        this.writeQueue = Promise.resolve();
        this.ensureFileExists();
    }

    ensureFileExists() {
        // Ensure directory exists
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Ensure file exists with default data if missing
        if (!fs.existsSync(this.filePath)) {
            this.writeSync(this.defaultData);
        }
    }

    /**
     * Sync read is suitable for initialization where it blocks gracefully
     */
    readSync() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            return JSON.parse(raw);
        } catch (e) {
            console.error(`[Storage] Read error for ${this.filePath}: ${e.message}. Using default.`);
            return this.defaultData;
        }
    }

    /**
     * Safely write file synchronously by writing to a .tmp file first, then replacing (Atomic)
     */
    writeSync(data) {
        const tmpFile = `${this.filePath}.tmp`;
        try {
            fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
            fs.renameSync(tmpFile, this.filePath);
        } catch (e) {
            console.error(`[Storage] Atomic save failed for ${this.filePath}:`, e.message);
            // Fallback (e.g. rename failed due to locked file on Windows sometimes)
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
        }
    }

    /**
     * Asynchronous write queue to prevent concurrent corruption in async operations
     */
    async writeAsync(data) {
        // Build promise chain to lock operations linearly
        const previousTask = this.writeQueue;
        
        // Create new tracking promise
        return new Promise((resolve, reject) => {
            this.writeQueue = previousTask.then(async () => {
                const tmpFile = `${this.filePath}.tmp.${Date.now()}`;
                try {
                    await fsPromises.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
                    await fsPromises.rename(tmpFile, this.filePath);
                    resolve(true);
                } catch (e) {
                    console.error(`[Storage] Async atomic save failed for ${this.filePath}:`, e.message);
                    try {
                        // Fallback override
                        await fsPromises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
                        resolve(true);
                    } catch (fatalErr) {
                        reject(fatalErr);
                    }
                } finally {
                    // Try to clear tmp files if they were stranded
                    try {
                        if (fs.existsSync(tmpFile)) {
                            fs.unlinkSync(tmpFile);
                        }
                    } catch(e) {}
                }
            });
        });
    }
}

module.exports = SynapseStorage;
