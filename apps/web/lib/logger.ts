type Level = "debug" | "info" | "warn" | "error";

interface LoggerOptions {
  env?: string;
  level?: Level;
  dest?: { write(msg: string): void };
}

export interface Logger {
  debug(msg: string): void;
  debug(obj: object, msg: string): void;
  info(msg: string): void;
  info(obj: object, msg: string): void;
  warn(msg: string): void;
  warn(obj: object, msg: string): void;
  error(msg: string): void;
  error(obj: object, msg: string): void;
}

const levelMap: Record<Level, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

function shouldWrite(level: Level, minLevel: Level): boolean {
  return levelMap[level] >= levelMap[minLevel];
}

function createWriter(dest?: { write(msg: string): void }): { write(msg: string): void } {
  return dest ?? process.stdout;
}

function buildRecord(level: Level, msg: string, obj?: object): string {
  return JSON.stringify({
    level: levelMap[level],
    time: Date.now(),
    ...(obj ?? {}),
    msg,
  });
}

function writeRecord(
  writer: { write(msg: string): void },
  minLevel: Level,
  level: Level,
  first: string | object,
  second?: string,
): void {
  if (!shouldWrite(level, minLevel)) {
    return;
  }

  const msg = typeof first === "string" ? first : (second ?? "");
  const obj = typeof first === "string" ? undefined : first;
  writer.write(`${buildRecord(level, msg, obj)}\n`);
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = "info", dest } = options;
  const writer = createWriter(dest);

  return {
    debug(first: string | object, second?: string): void {
      writeRecord(writer, level, "debug", first, second);
    },
    info(first: string | object, second?: string): void {
      writeRecord(writer, level, "info", first, second);
    },
    warn(first: string | object, second?: string): void {
      writeRecord(writer, level, "warn", first, second);
    },
    error(first: string | object, second?: string): void {
      writeRecord(writer, level, "error", first, second);
    },
  };
}

export const logger: Logger = createLogger();
