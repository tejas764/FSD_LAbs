import sharp from "sharp";
import { PhotoProcessingService } from "./photo-processing.service";

describe("PhotoProcessingService", () => {
  it("strips EXIF metadata from uploaded photo", async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: {
            Artist: "crisismap-test",
          },
        },
      })
      .toBuffer();

    const before = await sharp(input).metadata();
    expect(before.exif).toBeDefined();

    const service = new PhotoProcessingService();
    const stripped = await service.stripExif(input);

    const after = await sharp(stripped).metadata();
    expect(after.exif).toBeUndefined();
  });
});
