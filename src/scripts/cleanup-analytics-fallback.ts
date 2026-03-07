/**
 * Cleanup Script for Analytics Fallback Files
 * Removes old processed analytics files
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_DIR = path.resolve(__dirname, '../../analytics_fallback');

async function cleanup() {
    try {

        const dirs = ['pending', 'processed', 'failed'];
        let totalDeleted = 0;

        for (const dir of dirs) {
            const dirPath = path.join(FALLBACK_DIR, dir);

            try {
                const files = await fs.readdir(dirPath);

                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    await fs.unlink(filePath);
                    totalDeleted++;
                }

            } catch (error: any) {
                if (error.code !== 'ENOENT') {
                    console.error(`Error cleaning ${dir}:`, error.message);
                }
            }
        }



    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        throw error;
    }
}

cleanup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
