import { Body, Controller, Get, Inject, ParseUUIDPipe, Post, Query, UseGuards, ValidationPipe } from "@nestjs/common";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiTooManyRequestsResponse } from "@nestjs/swagger";
import { CreateFieldMessageDto, FieldMessageResponseDto, FieldMessagesResponseDto } from "./field-messages.dto";
import { FieldMessagesService } from "./field-messages.service";

@ApiTags("field-messages")
@Controller("field-messages")
@UseGuards(ThrottlerGuard)
@SkipThrottle({ "crisis-write": true })
export class FieldMessagesController {
  constructor(@Inject(FieldMessagesService) private readonly messages: FieldMessagesService) {}

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Store a field note or SOS, replaying the same message ID safely" })
  @ApiBody({ type: CreateFieldMessageDto })
  @ApiCreatedResponse({ type: FieldMessageResponseDto })
  @ApiBadRequestResponse({ description: "Invalid message or unpaired coordinates" })
  @ApiConflictResponse({ description: "Message ID already belongs to another device" })
  @ApiTooManyRequestsResponse({ description: "Retry later; retain the original message ID" })
  async create(@Body(new ValidationPipe({ transform: true, whitelist: true, expectedType: CreateFieldMessageDto })) body: CreateFieldMessageDto) {
    return { success: true, data: await this.messages.save(body) };
  }

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: "Read this anonymous device's latest 200 stored messages" })
  @ApiQuery({ name: "deviceId", type: String, format: "uuid", required: true })
  @ApiOkResponse({ type: FieldMessagesResponseDto })
  @ApiBadRequestResponse({ description: "A valid deviceId UUID is required" })
  async list(@Query("deviceId", new ParseUUIDPipe()) deviceId: string) {
    return { success: true, data: await this.messages.list(deviceId) };
  }
}
