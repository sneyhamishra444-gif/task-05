import { Request, Response, NextFunction } from "express";
import * as jobsService from "./jobs.service";

export async function getJobHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await jobsService.getJobStatus(req.user!.id, req.params.jobId as string);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
