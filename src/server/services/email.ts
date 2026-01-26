/**
 * Email service with AWS SES support and mock mode for local development
 */

const MOCK_EMAIL = process.env.MOCK_EMAIL === 'true' || process.env.ALLOW_INSECURE === 'true';
const SETUP_BASE_URL = process.env.SETUP_BASE_URL || 'https://washcontrol.io/setup';

export interface SendEmailResult {
  mockUrl?: string; // Only present in mock mode
}

/**
 * Send invite email to new viewer
 * In mock mode, logs the URL and returns it for display in UI
 */
export async function sendInviteEmail(
  email: string,
  token: string,
  accountExpiresAt: number
): Promise<SendEmailResult> {
  const setupUrl = `${SETUP_BASE_URL}?token=${token}`;
  const expiryDate = new Date(accountExpiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (MOCK_EMAIL) {
    console.log(`\n[email-mock] ========================================`);
    console.log(`[email-mock] Invite email for: ${email}`);
    console.log(`[email-mock] Setup URL: ${setupUrl}`);
    console.log(`[email-mock] Account expires: ${expiryDate}`);
    console.log(`[email-mock] ========================================\n`);
    return { mockUrl: setupUrl };
  }

  // Real SES implementation
  // Lazy import to avoid requiring AWS SDK in mock mode
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

  const region = process.env.AWS_SES_REGION || 'eu-west-1';
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@washcontrol.io';

  const ses = new SESClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || '',
    },
  });

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #2563eb;">Welcome to WashControl</h2>
  <p>You've been invited to view the WashControl laundromat management system.</p>
  <p>
    <a href="${setupUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
      Set Up Your Account
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">
    This link expires in 7 days. Your account access will be valid until ${expiryDate}.
  </p>
  <p style="color: #999; font-size: 12px; margin-top: 30px;">
    If you didn't expect this email, you can safely ignore it.
  </p>
</body>
</html>
`;

  const textBody = `Welcome to WashControl

You've been invited to view the WashControl laundromat management system.

Set up your account here: ${setupUrl}

This link expires in 7 days. Your account access will be valid until ${expiryDate}.

If you didn't expect this email, you can safely ignore it.`;

  await ses.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Your WashControl Viewer Invitation' },
      Body: {
        Html: { Data: htmlBody },
        Text: { Data: textBody },
      },
    },
  }));

  return {};
}
