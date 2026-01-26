/**
 * Email service - currently uses mock mode only (no AWS SES)
 * Magic links are displayed in the UI for admin to share manually
 */

const SETUP_BASE_URL = process.env.SETUP_BASE_URL || 'https://washcontrol.io/setup';

export interface SendEmailResult {
  mockUrl: string; // Always present - the magic link for admin to share
}

/**
 * Generate invite link for new viewer
 * Returns the magic link URL for the admin to share manually
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

  console.log(`\n[invite] ========================================`);
  console.log(`[invite] Viewer invite created for: ${email}`);
  console.log(`[invite] Setup URL: ${setupUrl}`);
  console.log(`[invite] Account expires: ${expiryDate}`);
  console.log(`[invite] ========================================\n`);

  return { mockUrl: setupUrl };
}
