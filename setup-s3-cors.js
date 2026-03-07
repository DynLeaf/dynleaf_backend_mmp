import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      AllowedOrigins: [
        'http://localhost:5001',
        'http://localhost:8080',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://preview.dynleaf.com',
        'https://dynleaf.com',
        'https://www.dynleaf.com',
        'https://admin.dynleaf.com',
        'https://app.dynleaf.com',
        'https://*.dynleaf.com'
      ],
      ExposeHeaders: ['ETag', 'x-amz-meta-custom-header'],
      MaxAgeSeconds: 3000
    }
  ]
};

const setupCORS = async () => {
  try {

    const command = new PutBucketCorsCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      CORSConfiguration: corsConfiguration
    });

    await s3Client.send(command);

    corsConfiguration.CORSRules[0].AllowedOrigins.forEach(origin => {
    });
  } catch (error) {
    console.error('❌ Error setting up CORS:', error.message);
    process.exit(1);
  }
};

setupCORS();
