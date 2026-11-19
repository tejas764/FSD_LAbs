import { Global, Module } from "@nestjs/common";
import { RealtimeFeedService } from "./realtime-feed.service";

/**
 * @Global so that RealtimeFeedService is available everywhere (QueueModule,
 * ReportsModule, etc.) without circular imports.  Import this module once in
 * AppModule and its exported providers are injected automatically.
 */
@Global()
@Module({
  providers: [RealtimeFeedService],
  exports: [RealtimeFeedService],
})
export class RealtimeFeedModule {}
