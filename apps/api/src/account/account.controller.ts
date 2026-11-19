import { Body, Controller, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";
import { AccountService } from "./account.service";

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

@ApiTags("account")
@Controller("account")
export class AccountController {
  constructor(
    @Inject(AccountService)
    private readonly accountService: AccountService,
  ) {}

  @Post("change-password")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Change password with strict current-password validation" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["currentPassword", "newPassword"],
      properties: {
        currentPassword: { type: "string" },
        newPassword: { type: "string", minLength: 8 },
      },
    },
  })
  async changePassword(
    @Req() req: Request & { user?: { id?: string; sub?: string } },
    @Body() body: ChangePasswordBody,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) {
      return {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        },
      };
    }

    await this.accountService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );

    return { success: true };
  }
}
