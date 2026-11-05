export interface PresignedUrlResponse {
  url: string;         // Expires in 300 seconds
  expiresAt: string;   // ISO string
  documentId: string;
  title: string;
}
