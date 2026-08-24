import { z } from "zod";

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["org_admin", "member"]).default("member"),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.enum(["org_admin", "member"]),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
