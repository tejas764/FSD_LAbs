import { Transform } from "class-transformer";
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateFieldMessageDto {
  @ApiProperty({ type: String, format: "uuid", description: "Client-generated stable message ID, reused on retry" })
  @IsUUID()
  id!: string;

  @ApiProperty({ type: String, format: "uuid", description: "Anonymous device identifier; keep private" })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(1, 2000)
  content!: string;

  @ApiProperty({ type: String, enum: ["TEXT", "SOS"] })
  @IsIn(["TEXT", "SOS"])
  type!: "TEXT" | "SOS";

  @ApiProperty({ type: String, format: "date-time", description: "Original client collection time" })
  @IsISO8601({ strict: true })
  @Matches(/T/, { message: "createdAt must include a time" })
  createdAt!: string;

  @ApiPropertyOptional({ type: Number, minimum: -90, maximum: 90, description: "Must be supplied with longitude" })
  @ValidateIf((message: CreateFieldMessageDto) => message.latitude !== undefined || message.longitude !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: Number, minimum: -180, maximum: 180, description: "Must be supplied with latitude" })
  @ValidateIf((message: CreateFieldMessageDto) => message.latitude !== undefined || message.longitude !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class FieldMessageDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  deviceId!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String, enum: ["TEXT", "SOS"] })
  type!: "TEXT" | "SOS";

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  receivedAt!: Date;

  @ApiProperty({ type: Number, nullable: true })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  longitude!: number | null;
}

export class FieldMessageResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: FieldMessageDto })
  data!: FieldMessageDto;
}

export class FieldMessagesResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: FieldMessageDto, isArray: true })
  data!: FieldMessageDto[];
}
