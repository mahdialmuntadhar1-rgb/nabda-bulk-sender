# Bulk Messaging Guide - Baby Steps

## Step 1: Prepare Your Recipients CSV

Create a CSV file with your recipients. Example `my-recipients.csv`:

```csv
phone,name,governorate,category,opt_in
+9647701234567,Ahmed Ali,Baghdad,Restaurant,true
+9647701234568,Sara Mohammed,Erbil,Shop,true
+9647701234569,Mohammed Hassan,Basra,Cafe,true
```

**Required columns:**
- `phone`: Phone number with + prefix (e.g., +9647701234567)
- `opt_in`: Must be `true` to send messages

**Optional columns (for templates):**
- `name`: Recipient's name
- `governorate`: Location
- `category`: Business type
- Any other custom fields

## Step 2: Create Your Message Template

Create a text file with your message. Example `my-message.txt`:

```
Hello {{name}},

Thank you for your interest in our {{category}} services in {{governorate}}!

We have exciting updates for you. Click the link below to learn more:
https://yourwebsite.com

To opt out, reply STOP.

Best regards,
Your Business Name
```

**Available variables:**
- `{{name}}` - Recipient name
- `{{governorate}}` - Location
- `{{category}}` - Business type
- `{{phone}}` - Phone number
- `{{1}}` through `{{4}}` - Same as above (numeric format)

## Step 3: Test with Dry Run

Always test before sending to real recipients:

```bash
npm run dev -- send --csv my-recipients.csv --template my-message.txt --dry-run
```

This shows you what messages will be sent without actually sending them.

## Step 4: Send Bulk Messages

After dry run looks good, send for real:

```bash
npm run dev -- send --csv my-recipients.csv --template my-message.txt
```

**With rate limiting (recommended for large lists):**
```bash
npm run dev -- send \
  --csv my-recipients.csv \
  --template my-message.txt \
  --limit 50 \
  --concurrency 1 \
  --batch-size 10 \
  --batch-delay-ms 2000 \
  --log ./my-campaign-log.jsonl
```

## Step 5: Check Results

After sending, check the log file:
```bash
Get-Content ./send-log.jsonl
```

Each line shows:
- Timestamp
- Phone number
- Status (sent/failed)
- Error message (if failed)

## Different CTAs (Call to Actions)

### CTA 1: Visit Website
```
Hello {{name}},

Check out our new collection: https://yourwebsite.com/{{category}}

Reply STOP to opt out.
```

### CTA 2: Call Now
```
Hello {{name}},

Call us now for special offers: +9647701234567

Reply STOP to opt out.
```

### CTA 3: Reply for Info
```
Hello {{name}},

Reply "INFO" for more details about our {{category}} services.

Reply STOP to opt out.
```

### CTA 4: Limited Time Offer
```
Hello {{name},

🎉 Limited time offer! 20% off all {{category}} services.
Use code: SAVE20

Offer ends in 48 hours. Reply STOP to opt out.
```

### CTA 5: Event Invitation
```
Hello {{name}},

You're invited to our event in {{governorate}}!
Date: This Saturday
Time: 6 PM

Reply "YES" to confirm attendance.
Reply STOP to opt out.
```

## Best Practices

1. **Always use dry run first** - Verify messages before sending
2. **Use rate limiting** - Don't send too fast (use --batch-delay-ms 2000)
3. **Include opt-out** - Always include "Reply STOP to opt out"
4. **Keep messages short** - Under 160 characters is ideal
5. **Personalize** - Use {{name}} and other variables
6. **Test with small batches** - Send to 5-10 people first
7. **Check logs** - Review send-log.jsonl after each campaign

## Common CSV Issues

**Wrong phone format:**
- ❌ `07701234567` (missing +)
- ❌ `9647701234567` (missing +)
- ✅ `+9647701234567`

**Missing opt_in:**
- ❌ `opt_in=false` (won't send)
- ✅ `opt_in=true` (will send)

## Example Workflow

```bash
# 1. Create your CSV (my-recipients.csv)
# 2. Create your template (my-message.txt)

# 3. Test dry run
npm run dev -- send --csv my-recipients.csv --template my-message.txt --dry-run

# 4. Send to first 10 people (test batch)
npm run dev -- send --csv my-recipients.csv --template my-message.txt --limit 10

# 5. If test batch successful, send to all
npm run dev -- send --csv my-recipients.csv --template my-message.txt

# 6. Check results
Get-Content ./send-log.jsonl
```

## Troubleshooting

**Messages not sending:**
- Check .env has correct NABDA_API_TOKEN
- Verify phone numbers have + prefix
- Check CSV has opt_in=true

**Rate limiting errors:**
- Increase --batch-delay-ms to 3000 or 5000
- Decrease --concurrency to 1
- Decrease --batch-size to 5

**Phone number errors:**
- Ensure all phones have +964 prefix
- Check CSV for empty phone fields
