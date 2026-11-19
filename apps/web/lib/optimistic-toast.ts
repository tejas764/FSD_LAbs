import { toast } from "sonner";

function extractMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim().length > 0) {
    return record.message;
  }

  return null;
}

function extractErrorMessage(error: unknown): string | null {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as Record<string, unknown>;

  const fromError = extractMessage(record.error);
  if (fromError) return fromError;

  const fromSelf = extractMessage(record);
  if (fromSelf) return fromSelf;

  return null;
}

function extractResultError(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;

  // better-auth style: { error: { message, code } }
  if (record.error) {
    return extractErrorMessage(record.error) ?? "Request failed";
  }

  // generic API style: { success: false, message }
  if (record.success === false) {
    return extractErrorMessage(record) ?? "Request failed";
  }

  return null;
}

interface OptimisticToastMutationOptions<TSnapshot> {
  getSnapshot: () => TSnapshot;
  applyOptimistic: () => void;
  commit: () => Promise<void>;
  rollback: (snapshot: TSnapshot) => void;
  successMessage: string;
  errorMessage: string;
}

export async function runOptimisticToastMutation<TSnapshot>(
  options: OptimisticToastMutationOptions<TSnapshot>,
): Promise<boolean> {
  const snapshot = options.getSnapshot();
  options.applyOptimistic();

  try {
    await options.commit();
    toast.success(options.successMessage);
    return true;
  } catch (error) {
    options.rollback(snapshot);
    toast.error(extractErrorMessage(error) ?? options.errorMessage);
    return false;
  }
}

interface ToastMutationOptions<TResult> {
  commit: () => Promise<TResult>;
  successMessage: string;
  errorMessage: string;
}

export async function runToastMutation<TResult>(
  options: ToastMutationOptions<TResult>,
): Promise<TResult | null> {
  try {
    const result = await options.commit();
    const resultError = extractResultError(result);
    if (resultError) {
      toast.error(resultError);
      return null;
    }
    toast.success(options.successMessage);
    return result;
  } catch (error) {
    toast.error(extractErrorMessage(error) ?? options.errorMessage);
    return null;
  }
}
