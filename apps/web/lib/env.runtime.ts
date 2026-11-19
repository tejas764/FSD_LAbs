import {
  DEFAULT_MAX_PHOTO_SIZE_MB,
  DEFAULT_OFFLINE_MAX_ATTEMPTS,
} from "./env.defaults";

interface RuntimeConfig {
  MAX_PHOTO_SIZE_MB: number;
  OFFLINE_MAX_ATTEMPTS: number;
}

type RuntimeRawEnv = Record<string, string | undefined>;

export function getRuntimeConfig(
  rawEnv: RuntimeRawEnv = process.env,
): RuntimeConfig {
  const parsedMaxPhotoSizeMb = rawEnv.MAX_PHOTO_SIZE_MB
    ? Number(rawEnv.MAX_PHOTO_SIZE_MB)
    : NaN;
  const parsedOfflineMaxAttempts = rawEnv.NEXT_PUBLIC_OFFLINE_MAX_ATTEMPTS
    ? Number(rawEnv.NEXT_PUBLIC_OFFLINE_MAX_ATTEMPTS)
    : NaN;

  return {
    MAX_PHOTO_SIZE_MB:
      Number.isFinite(parsedMaxPhotoSizeMb) && parsedMaxPhotoSizeMb > 0
        ? parsedMaxPhotoSizeMb
        : DEFAULT_MAX_PHOTO_SIZE_MB,
    OFFLINE_MAX_ATTEMPTS:
      Number.isFinite(parsedOfflineMaxAttempts) && parsedOfflineMaxAttempts > 0
        ? parsedOfflineMaxAttempts
        : DEFAULT_OFFLINE_MAX_ATTEMPTS,
  };
}
