import * as nodemailer from "nodemailer";

export interface MailerConfig {
  smtpHost: string;
  smtpPort: number;
  from: string;
}

/**
 * Fire-and-forget. Never throws so it cannot block the auth response.
 */
export async function sendResetPasswordEmail(
  to: string,
  resetUrl: string,
  config: MailerConfig,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
  });
  try {
    await transporter.sendMail({
      from: config.from,
      to,
      subject: "Reset your CrisisMap password",
      text: `Click the link to reset your password:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Click the link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  } catch {
    // swallow — fire-and-forget to prevent timing attacks
  }
}
