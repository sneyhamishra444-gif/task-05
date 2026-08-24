import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"), // bcrypt limit
  name: z.string().trim().min(1, "Name is required").max(255),
  organizationName: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(255),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Must be a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});
export type LogoutInput = z.infer<typeof logoutSchema>;
