const fs = require('fs');
const path = require('path');
const SynapseStorage = require('../storage/storage');

describe('SynapseStorage (ACID & Concurrency Tests)', () => {
    const testDir = path.join(__dirname, 'temp_storage_test');
    const testFile = path.join(testDir, 'test_memory.json');

    beforeAll(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
        if (fs.existsSync(testFile + '.tmp')) fs.unlinkSync(testFile + '.tmp');
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    test('should initialize with default data when file is missing', () => {
        const storage = new SynapseStorage(testFile, { hello: 'world' });
        expect(fs.existsSync(testFile)).toBe(true);
        const data = storage.readSync();
        expect(data).toEqual({ hello: 'world' });
    });

    test('should maintain data integrity during concurrent async writes', async () => {
        const storage = new SynapseStorage(testFile, { counter: 0 });
        
        // Fire off 100 concurrent asynchronous writes
        // If there were no internal promise-based lock, the tmp file would get 
        // overwritten concurrently, leading to lost writes or json corruption.
        const promises = [];
        for (let i = 1; i <= 50; i++) {
            promises.push(storage.writeAsync({ counter: i }));
        }
        
        await Promise.all(promises);
        
        // The final value should be whatever finished last, but importantly:
        // the JSON output MUST be structurally well-formed, not corrupted.
        const result = storage.readSync();
        expect(result).toHaveProperty('counter');
        // By Javascript event loop guarantees with the chained promise, it should be exactly 50
        expect(result.counter).toBe(50);
    });

    test('should write synchronously via atomic tmp file rename', () => {
        const storage = new SynapseStorage(testFile, {});
        storage.writeSync({ syncMode: true });
        
        const data = storage.readSync();
        expect(data).toEqual({ syncMode: true });
    });
});
