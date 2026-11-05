import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Presigned GET — generated on every request, never stored. Expires in 300s (CLAUDE.md).
// Omit contentType to let R2 serve the type stored at upload time (PDFs for docs,
// image/* for photos). Only override when you truly need to force a type.
export async function generatePresignedGetUrl(
  r2Key: string,
  expiresInSeconds = 300,
  contentType?: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: r2Key,
    ResponseContentDisposition: 'inline', // Render in browser, not download
    ...(contentType ? { ResponseContentType: contentType } : {}),
  });
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}

// Presigned PUT — client uploads a file (e.g. inspection photo) straight to R2.
// Expires in 300s. The client must send the same Content-Type when uploading.
export async function generatePresignedPutUrl(
  r2Key: string,
  contentType = 'image/jpeg',
  expiresInSeconds = 300,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: r2Key,
    ContentType: contentType,
  });
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}

// Upload straight from the API (memoryStorage buffer → R2). No browser-side R2 creds.
export async function putObject(
  r2Key: string,
  body: Buffer,
  contentType = 'application/pdf',
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: r2Key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
