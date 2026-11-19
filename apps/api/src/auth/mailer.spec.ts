import { sendResetPasswordEmail, type MailerConfig } from "./mailer";
import * as nodemailer from "nodemailer";

jest.mock("nodemailer");

const testConfig: MailerConfig = {
  smtpHost: "localhost",
  smtpPort: 1025,
  from: "crisismap@undp.local",
};

describe("sendResetPasswordEmail", () => {
  const mockSendMail = jest.fn().mockResolvedValue({ messageId: "test-id" });

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });
  });

  it("sends a reset password email with the reset URL", async () => {
    const url = "http://localhost:3000/reset-password?token=abc123";
    await sendResetPasswordEmail("analyst@undp.org", url, testConfig);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "localhost", port: 1025 }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "analyst@undp.org",
        subject: expect.stringContaining("password"),
        text: expect.stringContaining(url),
      }),
    );
  });

  it("does not throw when sendMail rejects (fire-and-forget)", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP down"));
    await expect(
      sendResetPasswordEmail("analyst@undp.org", "http://localhost:3000/reset-password?token=x", testConfig),
    ).resolves.not.toThrow();
  });
});
