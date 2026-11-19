import { API_ENV_FILE_PATHS } from "./config/env-file-paths";

describe("API env file paths", () => {
  it("uses .env.local only", () => {
    expect(API_ENV_FILE_PATHS).toEqual([".env.local"]);
  });
});