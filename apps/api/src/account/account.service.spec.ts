import { BadRequestException } from "@nestjs/common";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { AccountService } from "./account.service";
import { PrismaService } from "../prisma/prisma.service";

jest.mock("better-auth/crypto", () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

describe("AccountService", () => {
  const accountFindFirst = jest.fn();
  const accountUpdate = jest.fn();

  const prisma = {
    account: {
      findFirst: accountFindFirst,
      update: accountUpdate,
    },
  } as unknown as PrismaService;

  const mockedHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
  const mockedVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;

  beforeEach(() => {
    accountFindFirst.mockReset();
    accountUpdate.mockReset();
    mockedHashPassword.mockReset();
    mockedVerifyPassword.mockReset();
  });

  it("throws INVALID_PASSWORD when current password is incorrect", async () => {
    accountFindFirst.mockResolvedValue({ id: "acc-1", password: "stored-hash" });
    mockedVerifyPassword.mockResolvedValue(false);

    const service = new AccountService(prisma);

    await expect(
      service.changePassword("user-1", "wrong-pass", "new-password-123"),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.changePassword("user-1", "wrong-pass", "new-password-123"),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_PASSWORD",
      },
    });
  });

  it("updates account password when current password is valid", async () => {
    accountFindFirst.mockResolvedValue({ id: "acc-1", password: "stored-hash" });
    mockedVerifyPassword.mockResolvedValue(true);
    mockedHashPassword.mockResolvedValue("new-hash");

    const service = new AccountService(prisma);

    await service.changePassword("user-1", "current-pass", "new-password-123");

    expect(mockedVerifyPassword).toHaveBeenCalledWith({
      hash: "stored-hash",
      password: "current-pass",
    });
    expect(accountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { password: "new-hash" },
    });
  });

  it("throws PASSWORD_TOO_SHORT for short new passwords", async () => {
    const service = new AccountService(prisma);

    await expect(
      service.changePassword("user-1", "current-pass", "short"),
    ).rejects.toMatchObject({
      response: {
        code: "PASSWORD_TOO_SHORT",
      },
    });
  });
});
