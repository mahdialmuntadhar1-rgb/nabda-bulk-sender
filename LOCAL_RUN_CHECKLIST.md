# Local Run Checklist - Nabda Bulk Sender

## Setup Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build the project**
   ```bash
   npm run build
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env` (if not exists)
   - Fill in required Nabda credentials (see below)

## Required Environment Variables

Edit `.env` file and fill these values:

- **NABDA_API_URL**: Your Nabda API base URL (default: `https://api.nabdaotp.com`)
- **NABDA_INSTANCE_ID**: Your Nabda instance ID (get from Nabda dashboard)
- **NABDA_API_TOKEN**: Your Nabda API token (get from Nabda dashboard)
- **WEBHOOK_PORT**: Port for webhook server (default: `3000`)

## CSV Format Requirements

**Required columns:**
- `phone`: Phone number (any Iraqi format, will be normalized)
- `opt_in`: Must be `true`, `1`, or `yes` to send (others skipped)

**Optional columns (for template variables):**
- `name`: Recipient name
- `governorate`: Governorate/region
- `category`: Business category

**Accepted Iraqi phone formats:**
- `+9647701234567` (with country code and plus)
- `07701234567` (with leading 0)
- `7701234567` (without leading 0)
- `9647701234567` (without plus)

All formats are normalized to `+9647701234567` before sending.

## Template Format

**Named variables:**
- `{{name}}` - Recipient name
- `{{governorate}}` - Governorate/region
- `{{category}}` - Business category
- `{{phone}}` - Phone number

**Numeric variables:**
- `{{1}}` - Same as `{{name}}`
- `{{2}}` - Same as `{{governorate}}`
- `{{3}}` - Same as `{{category}}`
- `{{4}}` - Same as `{{phone}}`

Example:
```
Hello {{name}},

Thank you for your interest in our {{category}} services in {{governorate}}.

To opt out, reply STOP.
```

## Dry Run Command (Test without sending)

```bash
npm run dev -- send --csv examples/recipients.csv --template examples/message.txt --dry-run
```

## Real Send Command (After dry run succeeds)

```bash
npm run dev -- send --csv examples/recipients.csv --template examples/message.txt
```

**With options:**
```bash
npm run dev -- send \
  --csv examples/recipients.csv \
  --template examples/message.txt \
  --limit 50 \
  --concurrency 1 \
  --batch-size 10 \
  --batch-delay-ms 2000 \
  --resume \
  --log ./campaign-log.jsonl
```

## Webhook Server (Opt-out Processing)

```bash
npm run dev -- webhook
```

Configure your Nabda dashboard webhook URL to point to:
```
http://YOUR_IP:3000/
```

The webhook automatically:
- Listens for incoming messages
- Detects "STOP" or "UNSUBSCRIBE" replies
- Adds phone numbers to `opt-outs.json`
- Skips opted-out numbers in future sends

## Common Failure Points

1. **Missing env vars**: Ensure `NABDA_INSTANCE_ID` and `NABDA_API_TOKEN` are set in `.env`
2. **Invalid phone numbers**: Check CSV phone column - must be Iraqi format
3. **No opt-in**: Recipients with `opt_in=false` are skipped
4. **API errors**: Check Nabda credentials and API URL
5. **Rate limiting**: Use default delays (2s between batches) to avoid bans

## Log Files

- **Send log**: `./send-log.jsonl` (default) or custom log path with `--log`
- **Opt-out log**: `./opt-outs.json` (auto-created by webhook)

Each log entry includes:
- Timestamp
- Phone number (input, normalized, sent)
- Template hash
- Message preview
- Status (sent/failed/skipped_*)
- HTTP status (if applicable)
- Error message (if failed)
- Retry count

## Success Criteria

✅ Dependencies installed cleanly
✅ Build succeeds
✅ Dry run shows preview messages
✅ CSV phone numbers normalize correctly
✅ Template variables render correctly
✅ Real send command executes (requires valid Nabda credentials)
