import type { ConfigService } from "@nestjs/config";
import type { MailerConfig } from "./mailer";

export function resolveMailerConfig(
  configService: ConfigService,
): MailerConfig {
  return {
    smtpHost: configService.get<string>("SMTP_HOST", "localhost"),
    smtpPort: configService.get<number>("SMTP_PORT", 1025),
    from: configService.get<string>("SMTP_FROM", "crisismap@undp.local"),
  };
}