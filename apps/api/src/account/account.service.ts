import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 8) {
      throw new BadRequestException({
        message: "Password too short",
        code: "PASSWORD_TOO_SHORT",
      });
    }

    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        providerId: "credential",
      },
      select: {
        id: true,
        password: true,
      },
    });

    if (!account?.password) {
      throw new BadRequestException({
        message: "Credential account not found",
        code: "CREDENTIAL_ACCOUNT_NOT_FOUND",
      });
    }

    const isValidCurrentPassword = await verifyPassword({
      hash: account.password,
      password: currentPassword,
    });

    if (!isValidCurrentPassword) {
      throw new BadRequestException({
        message: "Invalid password",
        code: "INVALID_PASSWORD",
      });
    }

    const nextHash = await hashPassword(newPassword);

    await this.prisma.account.update({
      where: { id: account.id },
      data: { password: nextHash },
    });
  }
}
