import { Injectable } from "@nestjs/common";
import { EventEmitter } from "events";

export type RealtimeReportUpdateEvent = {
  reportId: string;
  crisisId: string;
  submittedAt: string;
  version: number;
  isDuplicate: boolean;
};

export type ExportCompleteEvent = {
  jobId: string;
  crisisId: string;
  downloadUrl: string;
};

@Injectable()
export class RealtimeFeedService {
  private readonly emitter = new EventEmitter();
  private readonly reportUpdatedEvent = "report.updated";
  private readonly exportCompleteEvent = "export.complete";

  subscribe(
    crisisId: string,
    listener: (event: RealtimeReportUpdateEvent) => void,
  ): () => void {
    const wrappedListener = (event: RealtimeReportUpdateEvent) => {
      if (event.crisisId === crisisId) {
        listener(event);
      }
    };

    this.emitter.on(this.reportUpdatedEvent, wrappedListener);

    return () => {
      this.emitter.off(this.reportUpdatedEvent, wrappedListener);
    };
  }

  emitReportUpdate(event: RealtimeReportUpdateEvent): void {
    this.emitter.emit(this.reportUpdatedEvent, event);
  }

  subscribeExportComplete(
    crisisId: string,
    listener: (event: ExportCompleteEvent) => void,
  ): () => void {
    const wrappedListener = (event: ExportCompleteEvent) => {
      if (event.crisisId === crisisId) {
        listener(event);
      }
    };

    this.emitter.on(this.exportCompleteEvent, wrappedListener);

    return () => {
      this.emitter.off(this.exportCompleteEvent, wrappedListener);
    };
  }

  emitExportComplete(event: ExportCompleteEvent): void {
    this.emitter.emit(this.exportCompleteEvent, event);
  }
}
