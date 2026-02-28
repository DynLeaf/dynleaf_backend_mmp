import nodemailer from 'nodemailer';

const getTransporter = () => {
    const email = process.env.EMAIL;
    const pass = process.env.PASS;

    if (!email || !pass) {
        throw new Error('EMAIL and PASS environment variables are required for email service');
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: email,
            pass: pass,
        },
    });
};

const getRecipientEmail = (): string => {
    const sentEmail = process.env.sentEmail;
    if (!sentEmail) {
        throw new Error('sentEmail environment variable is required');
    }
    return sentEmail;
};

const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
    }).format(date) + ' IST';
};

const buildEmailHtml = (
    type: 'Brand' | 'Outlet',
    name: string,
    brandName: string | null,
    createdAt: Date,
    createdBy: string,
    adminPanelLink: string
): string => {
    const emoji = type === 'Brand' ? '🏪' : '🍽️';
    const color = type === 'Brand' ? '#6366f1' : '#f59e0b';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New ${type} Onboarding Request</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:${color};padding:32px 40px;text-align:center;">
              <div style="font-size:48px;margin-bottom:12px;">${emoji}</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                New ${type} Onboarding Request
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Action required — review in admin panel
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                A new <strong>${type.toLowerCase()}</strong> has been submitted and is <strong>waiting for your approval</strong>.
              </p>

              <!-- Details table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${type === 'Outlet' && brandName ? `
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:140px;">Brand</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${brandName}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:140px;">${type} Name</td>
                        <td style="padding:8px 0;color:#111827;font-size:15px;font-weight:600;">${name}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</td>
                        <td style="padding:8px 0;">
                          <span style="background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;">Waiting for Approval</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Submitted By</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;">${createdBy}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Date</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;">${formatDate(createdAt)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${adminPanelLink}"
                       style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;letter-spacing:0.2px;">
                      Review in Admin Panel →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This is an automated notification from DynLeaf Admin System.<br/>
                Do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Send email notification when a new Brand is onboarded
 */
export const sendBrandOnboardingEmail = async (
    brandName: string,
    createdAt: Date,
    createdBy: string
): Promise<void> => {
    try {
        const transporter = getTransporter();
        const recipient = getRecipientEmail();
        const adminLink = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5174'}/brands`;

        await transporter.sendMail({
            from: `"DynLeaf Admin" <${process.env.EMAIL}>`,
            to: recipient,
            subject: `🏪 New Brand Onboarding Request — ${brandName}`,
            html: buildEmailHtml('Brand', brandName, null, createdAt, createdBy, adminLink),
        });

        console.log(`[EmailService] Brand onboarding email sent for "${brandName}" to ${recipient}`);
    } catch (error: any) {
        // Non-fatal — log and continue, never block onboarding
        console.error('[EmailService] Failed to send brand onboarding email:', error.message);
    }
};

/**
 * Send email notification when a new Outlet is onboarded
 */
export const sendOutletOnboardingEmail = async (
    outletName: string,
    brandName: string,
    createdAt: Date,
    createdBy: string
): Promise<void> => {
    try {
        const transporter = getTransporter();
        const recipient = getRecipientEmail();
        const adminLink = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5174'}/onboarding-requests`;

        await transporter.sendMail({
            from: `"DynLeaf Admin" <${process.env.EMAIL}>`,
            to: recipient,
            subject: `🍽️ New Outlet Onboarding Request — ${outletName}`,
            html: buildEmailHtml('Outlet', outletName, brandName, createdAt, createdBy, adminLink),
        });

        console.log(`[EmailService] Outlet onboarding email sent for "${outletName}" to ${recipient}`);
    } catch (error: any) {
        console.error('[EmailService] Failed to send outlet onboarding email:', error.message);
    }
};
