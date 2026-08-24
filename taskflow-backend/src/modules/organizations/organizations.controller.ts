import { Request, Response, NextFunction } from "express";
import * as orgService from "./organizations.service";
import { addMemberSchema, updateMemberRoleSchema } from "./organizations.validation";

export async function listMembersHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const members = await orgService.listMembers(req.org!.id);
    res.status(200).json({ data: members });
  } catch (err) {
    next(err);
  }
}

export async function addMemberHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const input = addMemberSchema.parse(req.body);
    const member = await orgService.addMember(req.org!.id, input);
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
}

export async function updateMemberRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const input = updateMemberRoleSchema.parse(req.body);
    const member = await orgService.updateMemberRole(
      req.org!.id,
      req.params.userId as string,
      input
    );
    res.status(200).json(member);
  } catch (err) {
    next(err);
  }
}

export async function removeMemberHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await orgService.removeMember(req.org!.id, req.params.userId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
