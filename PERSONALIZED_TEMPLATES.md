# Personalized Message Templates

These templates leverage your Supabase contact data for creative, personalized outreach.

## Template 1: Personal Greeting with Location

**Use case:** Warm, personalized introduction
**CTA Type:** Reply INFO

```
Hello {{name}},

Hope you're doing well in {{governorate}}!

We have something special for you. Reply "INFO" to learn more.

Best regards
```

## Template 2: Category-Specific Offer

**Use case:** Targeted promotional message based on business type
**CTA Type:** Link Click

```
Hi {{name}},

Special offer for {{category}} businesses in {{governorate}}!

Get 20% off our premium services: https://yourwebsite.com/offer

Limited time only. Reply STOP to opt out.
```

## Template 3: Event Invitation

**Use case:** Local event or meetup invitation
**CTA Type:** Event RSVP

```
Hello {{name}},

You're invited to our exclusive event in {{governorate}}!

Join other {{category}} professionals for networking and growth.
Date: This Saturday at 6 PM

Reply "YES" to confirm your spot.
```

## Template 4: Follow-Up Call

**Use case:** Post-meeting or post-interaction follow-up
**CTA Type:** Call Now

```
Hi {{name}},

Great connecting with you about {{category}}!

Let's continue our conversation. Call me anytime: +9647701234567

Looking forward to hearing from you!
```

## Template 5: Limited Time Flash Sale

**Use case:** Urgent promotional campaign
**CTA Type:** Limited Offer

```
🎉 Flash Sale for {{category}} in {{governorate}}!

50% OFF for the next 24 hours only.
Use code: {{governorate}}50

Shop now: https://yourwebsite.com/flash-sale

Reply STOP to opt out.
```

## Template 6: Personalized Welcome

**Use case:** New customer onboarding
**CTA Type:** Link Click

```
Welcome aboard, {{name}}!

We're excited to have you as part of our {{category}} community in {{governorate}}.

Get started here: https://yourwebsite.com/get-started

Reply anytime if you need help!
```

## Template 7: Simple Personal Check-In

**Use case:** Relationship building
**CTA Type:** Reply YES

```
Hi {{name}},

Just checking in to see how things are going with your {{category}} business in {{governorate}}.

Everything going well? Reply "YES" if you'd like to catch up!

```

## How to Use These Templates

1. **Select a template** that matches your campaign goal
2. **Copy the template** to the message editor in the web UI
3. **Choose the CTA type** that matches the template
4. **Select "Supabase Database"** as contact source
5. **Load contacts** from your Supabase
6. **Send** and track responses

## Customizing Templates

You can use any field from your Supabase contact table:
- `{{name}}` - Contact name
- `{{governorate}}` - Location
- `{{category}}` - Business type
- `{{phone}}` - Phone number
- Any other custom field from your database

## Best Practices

- **Personalize** - Use the recipient's name
- **Be specific** - Mention their location or category
- **Clear CTA** - Tell them exactly what to do
- **Include opt-out** - Always add "Reply STOP to opt out"
- **Test first** - Send to a small group first
