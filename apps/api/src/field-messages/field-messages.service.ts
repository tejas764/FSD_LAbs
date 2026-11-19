import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFieldMessageDto } from "./field-messages.dto";

@Injectable()
export class FieldMessagesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(message: CreateFieldMessageDto) {
    // An atomic upsert preserves the first accepted payload even when multiple
    // tabs or a reconnect replay the same message concurrently.
    const saved = await this.prisma.fieldMessage.upsert({
      where: { id: message.id },
      create: { ...message, createdAt: new Date(message.createdAt) },
      update: {},
    }).catch(async (error: unknown) => {
      // Some Prisma query shapes emulate upsert with a read then insert. If
      // another tab wins that race, return its durable record rather than fail
      // a safe replay. Other persistence errors still propagate unchanged.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.fieldMessage.findUnique({ where: { id: message.id } });
        if (existing) return existing;
      }
      throw error;
    });

    if (saved.deviceId.toLowerCase() !== message.deviceId.toLowerCase()) {
      throw new ConflictException("Message ID belongs to another device");
    }
    return saved;
  }

  async list(deviceId: string) {
    return this.prisma.fieldMessage.findMany({
      where: { deviceId },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 200,
    });
  }
}
