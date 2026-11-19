import "vitest";

// @ts-expect-error - jest-axe package.json does not export types, but we declare them here
declare module "jest-axe" {
  export interface AxeResults {
    violations: unknown[];
  }

  export function axe(
    container: Element | DocumentFragment,
    options?: unknown,
  ): Promise<AxeResults>;

  export function configureAxe(
    options?: unknown,
  ): (container: Element | DocumentFragment, options?: unknown) => Promise<AxeResults>;

  export const toHaveNoViolations: {
    toHaveNoViolations(results: AxeResults): {
      pass: boolean;
      message: () => string;
    };
  };
}

declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }

  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
