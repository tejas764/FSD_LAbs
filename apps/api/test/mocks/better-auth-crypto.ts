export async function hashPassword(password: string): Promise<string> {
  return `mock-hash:${password}`;
}

export async function verifyPassword(input: {
  password: string;
  hash: string;
}): Promise<boolean> {
  return input.hash === `mock-hash:${input.password}`;
}
