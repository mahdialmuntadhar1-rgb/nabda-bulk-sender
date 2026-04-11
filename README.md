# Nabda Bulk WhatsApp Sender

A compliant, reliable CLI tool for sending bulk WhatsApp messages via the Nabda Gateway API.

## Features

- **Compliance-first**: Opt-in validation, opt-out handling (STOP/UNSUBSCRIBE)
- **Rate limiting**: Configurable concurrency, batching, and delays
- **Resumable**: Resume interrupted campaigns without duplicates
- **Iraq phone normalization**: Handles +964, 07xxx, 7xxx formats
- **Template variables**: Supports `{{name}}`, `{{governorate}}`, `{{category}}`, `{{phone}}` and `{{1}}` through `{{4}}`
- **Retry logic**: Exponential backoff for transient failures
- **Webhook server**: Process opt-out requests automatically

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your Nabda credentials:
```
NABDA_API_URL=https://api.nabdaotp.com
NABDA_INSTANCE_ID=your_instance_id
NABDA_API_TOKEN=your_api_token
WEBHOOK_PORT=3000
```

## Usage

### Dry Run (Preview)
```bash
npm run dev -- send --csv examples/recipients.csv --template examples/message.txt --dry-run
```

### Send Messages
```bash
npm run dev -- send --csv examples/recipients.csv --template examples/message.txt
```

### With Options
```bash
npm run dev -- send \
  --csv examples/recipients.csv \
  --template examples/message.txt \
  --limit 50 \
  --concurrency 2 \
  --batch-size 5 \
  --batch-delay-ms 3000 \
  --resume \
  --log ./campaign-log.jsonl
```

### Webhook Server (Opt-out Processing)
```bash
npm run dev -- webhook
```

Configure your Nabda dashboard webhook URL to point to `http://YOUR_IP:3000/`

## CSV Format

```csv
phone,name,governorate,category,opt_in
+9647701234567,Ahmed,Baghdad,Restaurant,true
07701234567,Sara,Erbil,Shop,true
9647701234568,Mohammed,Basra,Cafe,false
```

**Required columns:**
- `phone`: Phone number (any format, will be normalized)
- `opt_in`: Must be `true`, `1`, or `yes` to send

**Optional columns:**
- `name`, `governorate`, `category`: For template variables

## Template Format

Create a text file with placeholders:

```
Hello {{name}},

Welcome to our service in {{governorate}}!

Your category: {{category}}

Reply STOP to opt out.
```

Or use numeric placeholders:
```
Hello {{1}}, welcome to {{2}}!
```

Where `{{1}}` = name, `{{2}}` = governorate, `{{3}}` = category, `{{4}}` = phone.

## Throttling Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--concurrency` | 1 | Parallel sends within a batch |
| `--batch-size` | 10 | Recipients per batch |
| `--batch-delay-ms` | 2000 | Pause between batches (ms) |

**Safe defaults explanation:**
- Low concurrency (1) reduces ban risk
- Small batch size (10) limits blast radius
- 2-second delay keeps you under rate limits
- Total rate: ~5 messages/second = ~18,000/hour max

## Logs

Each send attempt creates a JSONL entry:

```json
{"timestamp":"2024-01-15T10:30:00Z","phone_input":"07701234567","phone_normalized":"+9647701234567","phone_sent":"9647701234567","template_hash":"abc123...","message_preview":"Hello Ahmed, welcome...","status":"sent","http_status":200,"message_id":"msg_123","retry_count":0}
```

Status values:
- `sent`: Successfully sent
- `failed`: API error (see `error` field)
- `skipped_optout`: Number is in opt-out list
- `skipped_no_optin`: Missing opt-in flag
- `skipped_invalid_phone`: Could not normalize
- `skipped_already_sent`: Already in log (with `--resume`)

## Security Notes

**⚠️ IMPORTANT:**
- Never commit `.env` files to git
- Rotate your API token immediately if exposed
- This tool uses your actual Nabda instance - charges apply per message
- WhatsApp may block numbers for spam - use responsibly

## Compliance

This tool implements:
1. **Opt-in verification**: Only sends to recipients with `opt_in=true`
2. **Opt-out processing**: Webhook server automatically handles STOP/UNSUBSCRIBE
3. **Rate limiting**: Conservative defaults to reduce ban risk
4. **No spam**: Built for legitimate transactional/commercial messaging with consent

**You must:**
- Have explicit consent from each recipient
- Honor opt-out requests within 24 hours
- Include opt-out instructions in your templates
- Not use for unsolicited bulk messages (violates Nabda ToS and WhatsApp policy)

## Examples

See `examples/` folder for sample CSV and template files.

## License

MIT
