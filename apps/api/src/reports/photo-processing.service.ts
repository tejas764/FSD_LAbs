import { Injectable } from "@nestjs/common";
import sharp from "sharp";

@Injectable()
export class PhotoProcessingService {
  async stripExif(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer).rotate().jpeg({ quality: 85 }).toBuffer();
  }
}
