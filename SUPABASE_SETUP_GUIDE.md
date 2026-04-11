# Supabase Setup Guide

## Overview
This guide will help you set up Supabase for automatic contact management and response tracking in the Nabda Bulk Sender.

## Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click "New Project"
4. Enter project name (e.g., "nabda-bulk-sender")
5. Set database password (save it securely)
6. Select region (choose closest to you)
7. Click "Create new project"

## Step 2: Get Credentials

After project creation:
1. Go to Project Settings → API
2. Copy **Project URL** (e.g., `https://xyz.supabase.co`)
3. Copy **anon/public key** (e.g., `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

## Step 3: Create Database Tables

1. Go to SQL Editor in Supabase
2. Click "New Query"
3. Copy the contents of `supabase-schema.sql` from the project
4. Paste it into the SQL Editor
5. Click "Run"

This will create:
- `contacts` table - stores contact information
- `message_logs` table - tracks sent messages and CTA types
- `responses` table - tracks recipient responses
- Necessary indexes for performance

## Step 4: Configure Environment Variables

Update your `.env` file:

```env
NABDA_BASE_URL=https://api.nabdaotp.com
NABDA_API_TOKEN=sk_e74f2d19f8f84c1ab4ec8fae77a1c620

# Add these Supabase credentials
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

WEBHOOK_PORT=3000
```

## Step 5: Add Contacts to Supabase

### Option A: Use Supabase Dashboard

1. Go to Table Editor in Supabase
2. Select the `contacts` table
3. Click "Insert row"
4. Add contact data:
   - `phone`: +9647701234567 (with + prefix)
   - `name`: Contact name (optional)
   - `governorate`: Location (optional)
   - `category`: Business type (optional)
   - `opt_in`: true (must be true to send)

### Option B: Import from CSV

1. Prepare CSV with columns: phone, name, governorate, category, opt_in
2. Go to Table Editor → contacts
3. Click "Import data"
4. Upload your CSV file

## Step 6: Configure Nabda Webhook

To track responses, configure Nabda webhook:

1. Go to your Nabda dashboard
2. Navigate to your instance settings
3. Add webhook URL: `http://your-domain.com/webhook`
4. Enable webhook for incoming messages

## Step 7: Use the Web UI

1. Start the web server:
   ```bash
   npm run web
   ```

2. Open http://localhost:3001

3. **Select Contact Source:**
   - Choose "Supabase Database" to load contacts from database
   - Or choose "CSV Upload" for one-time CSV import

4. **Select CTA Type:**
   - Link Click - for URL-based CTAs
   - Call Now - for phone call CTAs
   - Reply YES - for confirmation responses
   - Reply INFO - for information requests
   - Event RSVP - for event attendance
   - Limited Offer - for promotional messages

5. **Write Message:**
   - Use variables: {{name}}, {{governorate}}, {{category}}, {{phone}}
   - Include opt-out: "Reply STOP to opt out"

6. **Send Messages:**
   - Click "Send Messages"
   - View results in real-time

7. **Track Responses:**
   - Click "Load Responses" to see recipient replies
   - View response type (reply, click, stop)
   - See timestamps

## Features

### Automatic Contact Management
- Contacts stored in Supabase database
- No need to upload CSV every time
- Easy to add/remove contacts
- Track opt-in status

### Response Tracking
- Automatically logs recipient replies
- Tracks response types (click, reply, stop)
- Links responses to original messages
- View response history

### CTA Tracking
- Track different call-to-action types
- Measure engagement by CTA
- Analyze which CTAs work best

### Dual Mode
- Use Supabase for automatic campaigns
- Use CSV for one-time sends
- Both modes log to database

## Troubleshooting

### Contacts not loading from Supabase
- Check SUPABASE_URL and SUPABASE_ANON_KEY in .env
- Verify database tables were created
- Check opt_in = true for contacts

### Webhook not receiving responses
- Verify webhook URL is correct
- Check Nabda webhook is enabled
- Ensure server is publicly accessible (not localhost)

### Responses not showing
- Check webhook is configured in Nabda
- Verify responses table exists
- Check database permissions

## Security Notes

- Keep your Supabase credentials secure
- Use Row Level Security (RLS) in production
- Don't commit .env file to version control
- Consider using Supabase Auth for user authentication

## Next Steps

1. Set up Supabase project
2. Run the SQL schema
3. Add contacts to database
4. Configure webhook in Nabda
5. Test with a small batch
6. Monitor responses in dashboard

## Support

For issues with:
- **Supabase**: https://supabase.com/docs
- **Nabda API**: https://api.nabdaotp.com/docs
- **This project**: Check GitHub issues
