import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directories exist
const ensureDirectories = () => {
    const dirs = [
        UPLOAD_DIR,
        path.join(UPLOAD_DIR, 'brands'),
        path.join(UPLOAD_DIR, 'outlets'),
        path.join(UPLOAD_DIR, 'temp')
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

ensureDirectories();

export interface UploadResult {
    url: string;
    filename: string;
    path: string;
}

/**
 * Save base64 image to local storage
 */
export const saveBase64Image = async (
    base64Data: string,
    folder: 'brands' | 'outlets' | 'temp',
    originalFilename?: string
): Promise<UploadResult> => {
    try {
        // Extract base64 data and mime type
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (!matches || matches.length !== 3) {
            throw new Error('Invalid base64 string');
        }

        const mimeType = matches[1];
        const base64Content = matches[2];
        
        // Determine file extension
        const extension = mimeType.split('/')[1] || 'jpg';
        
        // Generate unique filename
        const filename = `${uuidv4()}.${extension}`;
        const folderPath = path.join(UPLOAD_DIR, folder);
        const filePath = path.join(folderPath, filename);

        // Convert base64 to buffer and save
        const buffer = Buffer.from(base64Content, 'base64');
        fs.writeFileSync(filePath, buffer);

        // Return URL (relative path for serving)
        const url = `/uploads/${folder}/${filename}`;

        return {
            url,
            filename,
            path: filePath
        };
    } catch (error: any) {
        throw new Error(`Failed to save image: ${error.message}`);
    }
};

/**
 * Save uploaded file from multipart form data
 */
export const saveUploadedFile = async (
    file: Express.Multer.File,
    folder: 'brands' | 'outlets' | 'temp'
): Promise<UploadResult> => {
    try {
        const filename = `${uuidv4()}${path.extname(file.originalname)}`;
        const folderPath = path.join(UPLOAD_DIR, folder);
        const filePath = path.join(folderPath, filename);

        // Move file to destination
        fs.renameSync(file.path, filePath);

        const url = `/uploads/${folder}/${filename}`;

        return {
            url,
            filename,
            path: filePath
        };
    } catch (error: any) {
        throw new Error(`Failed to save file: ${error.message}`);
    }
};

/**
 * Delete file from local storage
 */
export const deleteFile = async (filePath: string): Promise<void> => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error: any) {
        console.error(`Failed to delete file: ${error.message}`);
    }
};

/**
 * Extract filename from URL
 */
export const getFilenameFromUrl = (url: string): string | null => {
    const matches = url.match(/\/uploads\/[^\/]+\/(.+)$/);
    return matches ? matches[1] : null;
};
