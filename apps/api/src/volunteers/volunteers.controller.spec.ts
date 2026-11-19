import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";

// Test-only guard supplies a session identity; actual runtime uses Better Auth cookies.
jest.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class {
    canActivate(context: { switchToHttp(): { getRequest(): { headers: Record<string, string>; user?: { id: string; role: string } } } }) {
      const req = context.switchToHttp().getRequest();
      if (!req.headers["x-test-user"]) {
        const { UnauthorizedException } = require("@nestjs/common") as typeof import("@nestjs/common");
        throw new UnauthorizedException();
      }
      req.user = { id: req.headers["x-test-user"], role: req.headers["x-test-role"] || "user" };
      return true;
    }
  },
}));

import { VolunteersController } from "./volunteers.controller";
import { VolunteersService } from "./volunteers.service";

describe("volunteer HTTP authorization and input contract", () => {
  let app: INestApplication;
  const uuid = "550e8400-e29b-41d4-a716-446655440001";
  const service = { enroll: jest.fn(), me: jest.fn(), updateProfile: jest.fn(), setAvailability: jest.fn(), eligibleTasks: jest.fn(), acceptTask: jest.fn(), respond: jest.fn(), progress: jest.fn(), complete: jest.fn(), checkIn: jest.fn(), adminOverview: jest.fn(), verify: jest.fn(), createTask: jest.fn(), assign: jest.fn(), review: jest.fn(), createShift: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [VolunteersController], providers: [{ provide: VolunteersService, useValue: service }] }).overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it("requires authentication for private profiles and enrollment", async () => {
    await request(app.getHttpServer()).get("/api/v1/volunteers/me").expect(401);
    await request(app.getHttpServer()).post("/api/v1/volunteers/enroll").send({ phone: "123", location: "City", skills: [] }).expect(401);
    expect(service.enroll).not.toHaveBeenCalled();
    expect(service.me).not.toHaveBeenCalled();
  });

  it("loads only the authenticated identity's workspace", async () => {
    service.me.mockResolvedValue({ profile: { id: uuid } });
    const response = await request(app.getHttpServer()).get("/api/v1/volunteers/me?userId=someone-else").set("x-test-user", "current-user").expect(200);
    expect(service.me).toHaveBeenCalledWith("current-user");
    expect(response.body).toEqual({ success: true, data: { profile: { id: uuid } } });
  });

  it("refuses volunteer attempts to access every coordinator write route", async () => {
    await request(app.getHttpServer()).get("/api/v1/volunteers/admin/overview").set("x-test-user", "volunteer").expect(403);
    for (const [method, path] of [["post", "tasks"], ["post", `tasks/${uuid}/assign`], ["post", `assignments/${uuid}/review`], ["post", "shifts"], ["patch", `profiles/${uuid}/verification`]] as const) {
      await request(app.getHttpServer())[method](`/api/v1/volunteers/admin/${path}`).set("x-test-user", "volunteer").send({}).expect(403);
    }
    expect(service.adminOverview).not.toHaveBeenCalled();
    expect(service.verify).not.toHaveBeenCalled();
    expect(service.createTask).not.toHaveBeenCalled();
    expect(service.review).not.toHaveBeenCalled();
  });

  it("allows an administrator to inspect the coordinator overview", async () => {
    service.adminOverview.mockResolvedValue({ profiles: [], tasks: [] });
    await request(app.getHttpServer()).get("/api/v1/volunteers/admin/overview").set("x-test-user", "coordinator").set("x-test-role", "admin").expect(200);
    expect(service.adminOverview).toHaveBeenCalledTimes(1);
  });

  it("rejects verification/identity injection rather than silently accepting it", async () => {
    await request(app.getHttpServer()).post("/api/v1/volunteers/enroll").set("x-test-user", "current-user").send({ phone: "+91 9999999999", location: "City", skills: [], verificationStatus: "VERIFIED", userId: "someone-else" }).expect(400);
    await request(app.getHttpServer()).patch("/api/v1/volunteers/me").set("x-test-user", "current-user").send({ verifiedHours: 100 }).expect(400);
    expect(service.enroll).not.toHaveBeenCalled();
    expect(service.updateProfile).not.toHaveBeenCalled();
  });

  it("normalizes skill names and supplies safe enrollment defaults", async () => {
    service.enroll.mockImplementation(async (_user, data) => data);
    const response = await request(app.getHttpServer()).post("/api/v1/volunteers/enroll").set("x-test-user", "current-user").send({ phone: "+91 9999999999", location: " City ", skills: [" Logistics ", "logistics"] }).expect(201);
    expect(response.body.data).toMatchObject({ location: "City", skills: ["logistics"], bio: "", emergencyContactName: "", emergencyContactPhone: "" });
  });

  it("rejects malformed IDs, partial check-in coordinates, and unsupported availability", async () => {
    await request(app.getHttpServer()).post("/api/v1/volunteers/tasks/not-a-uuid/accept").set("x-test-user", "volunteer").expect(400);
    await request(app.getHttpServer()).post("/api/v1/volunteers/check-ins").set("x-test-user", "volunteer").send({ status: "SAFE", latitude: 10 }).expect(400);
    await request(app.getHttpServer()).patch("/api/v1/volunteers/availability").set("x-test-user", "volunteer").send({ availability: "VERIFIED" }).expect(400);
    expect(service.acceptTask).not.toHaveBeenCalled();
    expect(service.checkIn).not.toHaveBeenCalled();
  });

  it("never accepts client-supplied verified hours with a completion report", async () => {
    await request(app.getHttpServer()).post(`/api/v1/volunteers/assignments/${uuid}/complete`).set("x-test-user", "volunteer").send({ summary: "Supplies delivered", hours: 2, verifiedHours: 2 }).expect(400);
    expect(service.complete).not.toHaveBeenCalled();
  });
});
