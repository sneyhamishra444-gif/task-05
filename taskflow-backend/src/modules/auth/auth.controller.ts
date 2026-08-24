import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from "./auth.validation";

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input, req.ip);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input, req.ip);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const input = refreshSchema.parse(req.body);
    const result = await authService.refresh(input.refreshToken, req.ip);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const input = logoutSchema.parse(req.body);
    await authService.logout(input.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/** Bonus: logout all devices. Requires an authenticated access token. */
export async function logoutAllHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await authService.logoutAll(req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response) {
  res.status(200).json({ user: req.user });
}
