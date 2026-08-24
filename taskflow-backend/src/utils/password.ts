import bcrypt from "bcrypt";
import { config } from "../config/env";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptCostFactor);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
