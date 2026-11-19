import { Module } from "@nestjs/common";
import { FieldMessagesController } from "./field-messages.controller";
import { FieldMessagesService } from "./field-messages.service";

@Module({
  controllers: [FieldMessagesController],
  providers: [FieldMessagesService],
})
export class FieldMessagesModule {}
