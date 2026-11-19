import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { FieldMessagesController } from "./field-messages.controller";
import { FieldMessagesService } from "./field-messages.service";

describe("field message HTTP contract", () => {
  let app: INestApplication;
  const deviceId = "550e8400-e29b-41d4-a716-446655440001";
  const service = { list: jest.fn(), save: jest.fn() };

  beforeAll(async () => {
    // The dev server runs under tsx, which does not emit method parameter type
    // metadata. Route-level expectedType must still enforce DTO validation.
    Reflect.defineMetadata("design:paramtypes", [Object], FieldMessagesController.prototype, "create");
    const module = await Test.createTestingModule({
      controllers: [FieldMessagesController],
      providers: [{ provide: FieldMessagesService, useValue: service }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it("requires a valid device ID before reading any messages", async () => {
    await request(app.getHttpServer()).get("/api/v1/field-messages").expect(400);
    await request(app.getHttpServer()).get("/api/v1/field-messages?deviceId=anyone").expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("wraps only the requested device's messages in the shared envelope", async () => {
    service.list.mockResolvedValue([{ id: "message", deviceId }]);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/field-messages?deviceId=${deviceId}`).expect(200);
    expect(response.body).toEqual({ success: true, data: [{ id: "message", deviceId }] });
    expect(service.list).toHaveBeenCalledWith(deviceId);
  });

  it("validates and trims a POST before persisting, excluding unknown fields", async () => {
    const body = {
      id: "550e8400-e29b-41d4-a716-446655440000", deviceId,
      content: "  Need water  ", type: "SOS", createdAt: "2026-11-18T10:00:00.000Z",
      injectedField: "not persisted",
    };
    service.save.mockImplementation(async (message) => message);
    const response = await request(app.getHttpServer())
      .post("/api/v1/field-messages").send(body).expect(201);
    expect(response.body).toEqual({
      success: true,
      data: { id: body.id, deviceId, content: "Need water", type: "SOS", createdAt: body.createdAt },
    });
  });

  it("rejects partial coordinates without invoking persistence", async () => {
    await request(app.getHttpServer()).post("/api/v1/field-messages").send({
      id: "550e8400-e29b-41d4-a716-446655440000", deviceId,
      content: "Need water", type: "SOS", createdAt: "2026-11-18T10:00:00.000Z", latitude: 10,
    }).expect(400);
    expect(service.save).not.toHaveBeenCalled();
  });
});
