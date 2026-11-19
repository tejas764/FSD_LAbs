import { ConflictException, ValidationPipe } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FieldMessagesService } from "./field-messages.service";
import { CreateFieldMessageDto } from "./field-messages.dto";
import { PrismaService } from "../prisma/prisma.service";

const input = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  deviceId: "550e8400-e29b-41d4-a716-446655440001",
  content: "Need drinking water",
  type: "TEXT" as const,
  createdAt: "2026-11-18T10:00:00.000Z",
};

describe("field message validation", () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: "body", metatype: CreateFieldMessageDto });

  it("trims content and accepts paired coordinates including zero", async () => {
    await expect(validate({ ...input, content: "  Water  ", latitude: 0, longitude: 0 }))
      .resolves.toMatchObject({ content: "Water", latitude: 0, longitude: 0 });
  });

  it.each([
    { content: "   " },
    { content: "a".repeat(2001) },
    { id: "not-a-uuid" },
    { deviceId: "not-a-device" },
    { type: "emergency" },
    { createdAt: "yesterday" },
    { createdAt: "2026-11-18" },
    { latitude: 10 },
    { longitude: 10 },
    { latitude: 91, longitude: 10 },
    { latitude: 10, longitude: -181 },
    { latitude: "10", longitude: 10 },
    { latitude: null, longitude: null },
  ])("rejects invalid fields %j", async (patch) => {
    await expect(validate({ ...input, ...patch })).rejects.toThrow();
  });
});

describe("FieldMessagesService", () => {
  function setup() {
    const stored = {
      ...input,
      createdAt: new Date(input.createdAt),
      receivedAt: new Date("2026-11-18T10:01:00.000Z"),
      latitude: null,
      longitude: null,
    };
    const fieldMessage = {
      upsert: jest.fn().mockResolvedValue(stored),
      findMany: jest.fn().mockResolvedValue([stored]),
      findUnique: jest.fn().mockResolvedValue(stored),
    };
    const service = new FieldMessagesService({ fieldMessage } as unknown as PrismaService);
    return { service, fieldMessage, stored };
  }

  it("atomically replays a message without replacing the original payload", async () => {
    const { service, fieldMessage, stored } = setup();
    await expect(service.save(input)).resolves.toEqual(stored);
    await expect(service.save({ ...input, content: "Changed after retry" })).resolves.toEqual(stored);
    expect(fieldMessage.upsert).toHaveBeenLastCalledWith({
      where: { id: input.id },
      create: expect.objectContaining({ ...input, content: "Changed after retry", createdAt: new Date(input.createdAt) }),
      update: {},
    });
  });

  it("rejects UUID replay under another device identity", async () => {
    const { service } = setup();
    await expect(service.save({ ...input, deviceId: "550e8400-e29b-41d4-a716-446655440002" }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("recovers an idempotent concurrent create collision", async () => {
    const { service, fieldMessage, stored } = setup();
    fieldMessage.upsert.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002", clientVersion: "7.8.0",
    }));
    await expect(service.save(input)).resolves.toEqual(stored);
    expect(fieldMessage.findUnique).toHaveBeenCalledWith({ where: { id: input.id } });
  });

  it("propagates storage failures instead of acknowledging an unsaved message", async () => {
    const { service, fieldMessage } = setup();
    fieldMessage.upsert.mockRejectedValue(new Error("Database unavailable"));
    await expect(service.save(input)).rejects.toThrow("Database unavailable");
  });

  it("compares UUID identity without case sensitivity", async () => {
    const { service, stored } = setup();
    await expect(service.save({ ...input, deviceId: input.deviceId.toUpperCase() })).resolves.toEqual(stored);
  });

  it("lists only the requested device with a stable bounded order", async () => {
    const { service, fieldMessage, stored } = setup();
    await expect(service.list(input.deviceId)).resolves.toEqual([stored]);
    expect(fieldMessage.findMany).toHaveBeenCalledWith({
      where: { deviceId: input.deviceId },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 200,
    });
  });
});
