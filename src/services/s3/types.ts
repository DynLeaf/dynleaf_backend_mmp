export interface S3Config {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketName: string;
    cdnUrl?: string;
}

export interface PresignedUrlResponse {
    uploadUrl: string;
    fields: Record<string, string>;
    s3Key: string;
    bucketName: string;
}

export interface UploadedFileInfo {
    key: string;
    url: string;
    size: number;
    mimeType: string;
}
