import type { ConfigService } from "@nestjs/config";
import { resolveMailerConfig } from "./mailer-config";

describe("resolveMailerConfig", () => {
  it("reads the from address from SMTP_FROM", () => {
    const values = new Map<string, unknown>([
      ["SMTP_HOST", "mailhog"],
      ["SMTP_PORT", 1025],
      ["SMTP_FROM", "noreply@crisismap.local"],
    ]);

    const configService = {
      get<T>(key: string, defaultValue?: T): T {
        return (values.get(key) as T | undefined) ?? defaultValue!;
      },
    } as ConfigService;

    expect(resolveMailerConfig(configService)).toEqual({
      smtpHost: "mailhog",
      smtpPort: 1025,
      from: "noreply@crisismap.local",
    });
  });
});