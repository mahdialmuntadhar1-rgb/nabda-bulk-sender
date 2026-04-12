# Cloud Co-Work Prompt for nabda-bulk-sender Project

## Project Overview
This is a compliant bulk WhatsApp messaging application for Nabda Gateway. The application has a web interface for managing contacts and sending messages in bulk.

## Current State
- **Location:** `c:\Users\HB LAPTOP STORE\Documents\winsurf\nabda-bulk-sender`
- **GitHub Repository:** https://github.com/mahdialmuntadhar1-rgb/nabda-bulk-sender
- **Deployment Platform:** Railway (https://railway.app)
- **Current Deployment Status:** Crashing due to wrong start command

## Your Task
You are a senior DevOps and full-stack engineer. Your goal is to:

1. **Audit and fix the entire project** - review all code, configuration, and deployment setup
2. **Fix Railway deployment** - ensure the application deploys successfully
3. **Verify database setup** - ensure Supabase tables are correctly configured
4. **Test the complete workflow** - verify the application works end-to-end
5. **Optimize for efficiency** - be concise and minimize token usage while being thorough

## Critical Requirements

### Token Usage Efficiency
- Be concise in your responses
- Use batch operations when possible
- Read multiple files in parallel instead of sequentially
- Avoid verbose explanations unless necessary
- Focus on actionable results

### Areas to Audit and Fix

#### 1. Code and Configuration
- Review `server.js` for any issues
- Review `api/index.js` for any issues
- Review `package.json` for correct dependencies and scripts
- Review `.env.example` for all required environment variables
- Review `railway.json` for correct deployment configuration

#### 2. Database (Supabase)
- **Contacts table:** Ensure it has the correct schema with columns: id, phone, name, whatsapp, city, governorate, category, opt_in, created_at
- **Message_logs table:** Ensure it has columns: phone, message, cta_type, sent_at, status, error_reason, normalized_phone, campaign_key, attempted_at
- **Staging_businesses table:** Ensure it's properly configured for data import
- **RLS policies:** Ensure they are set correctly for security (not overly permissive)
- **Indexes:** Ensure phone and other critical columns are indexed

#### 3. Deployment (Railway)
- **Start command:** Must be `node server.js` (NOT `npm run build && npm run send`)
- **Environment variables:** Ensure all are set correctly:
  - NABDA_BASE_URL=https://api.nabdaotp.com
  - NABDA_API_TOKEN=your_actual_token
  - SUPABASE_URL=https://ujdsxzvvgaugypwtugdl.supabase.co
  - SUPABASE_ANON_KEY=your_actual_key
  - WEBHOOK_PORT=3001
  - PORT=3001
- **Port:** Must be 3001
- **Health check:** Should be `/`

#### 4. Data Quality
- Review contacts table for:
  - Null names or phones
  - Duplicate phones
  - Invalid Iraqi phone formats
  - Multiple phones in one field
- Run cleanup scripts if needed

#### 5. Send Pipeline Safety
- Verify phone normalization works correctly
- Verify cross-run duplicate prevention works
- Verify server-side filtering works (city, category)
- Verify logging works with all fields
- Verify error handling works

## Step-by-Step Instructions

### Phase 1: Audit and Analysis
1. Read all critical files in parallel:
   - `package.json`
   - `server.js`
   - `api/index.js`
   - `.env.example`
   - `railway.json`
   - `supabase-schema.sql`

2. Identify all issues and create a prioritized list

3. Check current deployment status on Railway

### Phase 2: Fix Critical Issues
1. Fix Railway deployment (start command, environment variables)
2. Fix any database schema issues
3. Fix any code issues
4. Push all fixes to GitHub

### Phase 3: Verification
1. Trigger Railway redeploy
2. Verify deployment succeeds
3. Test web interface loads
4. Test loading contacts from Supabase
5. Test sending a single message
6. Test sending bulk messages
7. Verify all logging works correctly

### Phase 4: Documentation
1. Document all changes made
2. Provide final deployment URL
3. Provide any remaining issues or risks
4. Provide recommendations for production use

## Important Notes

### Security
- Do not expose API keys or secrets in code
- Use environment variables for all sensitive data
- Ensure RLS policies are not overly permissive
- The current policy `CREATE POLICY "Public access to contacts" ON public.contacts FOR ALL USING (true) WITH CHECK (true);` is too open and should be replaced with least-privilege access

### Phone Validation
- Iraqi mobile format: `^\+9647\d{9}$` (exact 9 digits after +9647)
- Normalization should convert: `07XXXXXXXXX` → `+9647XXXXXXXXX`
- Reject commas and multi-number strings

### Duplicate Prevention
- In-batch deduplication: Use Set to track phones in current batch
- Cross-run deduplication: Check message_logs for same normalized_phone + campaign_id
- Use explicit campaign_id instead of first 50 chars of message

### Logging
- All sends must log: phone, normalized_phone, message, cta_type, status, error_reason, campaign_key, sent_at, attempted_at
- Status values: 'sent', 'failed', 'skipped'
- Skipped reasons: 'invalid_phone', 'duplicate_same_run', 'duplicate_previous_run'

## Expected Output

Provide a comprehensive report with:

1. **Issues Found:** List all issues discovered during audit
2. **Fixes Applied:** List all fixes made with file paths and line numbers
3. **Files Changed:** Exact list of files modified
4. **SQL Changes:** Any database schema changes needed
5. **Deployment Status:** Current Railway deployment status
6. **Test Results:** Results of all tests performed
7. **Final URL:** Railway deployment URL
8. **Remaining Issues:** Any issues that still need to be addressed
9. **Production Readiness:** Go/no-go for production use
10. **Recommendations:** Any recommendations for improvement

## Communication Style
- Be concise and direct
- Use bullet points for lists
- Bold critical information
- Provide copy-pastable commands when needed
- Focus on actionable results
- Minimize verbose explanations

## Starting Point
Begin by reading all critical files in parallel to understand the current state, then proceed with the audit and fixes.
