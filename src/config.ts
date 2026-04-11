import 'dotenv/config';

export const CONFIG = {
  NABDA_API_URL: process.env.NABDA_BASE_URL || process.env.NABDA_API_URL || 'https://api.nabdaotp.com',
  NABDA_API_TOKEN: process.env.NABDA_TOKEN || process.env.NABDA_API_TOKEN || '',
  NABDA_EMAIL: process.env.NABDA_EMAIL || '',
  NABDA_PASSWORD: process.env.NABDA_PASSWORD || '',
  NABDA_INSTANCE_ID: process.env.NABDA_INSTANCE_ID || '',
  WEBHOOK_PORT: parseInt(process.env.WEBHOOK_PORT || '3000', 10),
};

export function validateConfig(): void {
  const missing: string[] = [];
  
  if (!CONFIG.NABDA_API_TOKEN) missing.push('NABDA_TOKEN or NABDA_API_TOKEN');
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nPlease set them in .env file or environment.`);
  }
}
