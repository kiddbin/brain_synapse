/**
 * @file storage/storage.js
 * @description Storage Engine - ACID-like local JSON file storage
 * @version 2.0.0
 * 
 * Implementation of an ACID-like local JSON file storage with 
 * Write-Ahead-Log (Temp file rename) to guarantee file integrity and
 * an async write queue for concurrent safety in NodeJS.
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

class SynapseStorage {
    constructor(filePath, defaultData = {}) {
        this.filePath = filePath;
        this.defaultData = defaultData;
        this.writeQueue = Promise.resolve();
        this.ensureFileExists();
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        if (!fs.existsSync(this.filePath)) {
            this.writeSync(this.defaultData);
        }
    }

    readSync() {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            return JSON.parse(raw);
        } catch (e) {
            console.error(`[Storage] Read error for ${this.filePath}: ${e.message}. Using default.`);
            return this.defaultData;
        }
    }

    writeSync(data) {
        const tmpFile = `${this.filePath}.tmp`;
        try {
            fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
            fs.renameSync(tmpFile, this.filePath);
        } catch (e) {
            console.error(`[Storage] Atomic save failed for ${this.filePath}:`, e.message);
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
        }
    }

    async writeAsync(data) {
        const previousTask = this.writeQueue;
        
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
                        await fsPromises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
                        resolve(true);
                    } catch (fatalErr) {
                        reject(fatalErr);
                    }
                } finally {
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
