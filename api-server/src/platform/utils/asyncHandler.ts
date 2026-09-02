import { Request, Response, NextFunction } from "express";
import { AppError } from "./AppError";

type AsyncControllerFunction = (
  req: Request,
  res: Response,
  next?: NextFunction
) => Promise<any>;

export const asyncHandler =
  (fn: AsyncControllerFunction) =>
  async (req: Request, res: Response, next?: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (error: unknown) {
      handleError(error, res);
    }
  };

const handleError = (error: unknown, res: Response): void => {
  console.error("[API] Error:", error);

  const errorResponse: { statusCode: number; message: string; reason?: string } = {
    statusCode: 500,
    message: "Internal server error",
  };

  if (error instanceof AppError) {
    errorResponse.statusCode = error.statusCode;
    errorResponse.message = error.message;
    if (error.reason) errorResponse.reason = error.reason;
  } else if (error instanceof Error) {
    errorResponse.message = error.message;
  }

  res.status(errorResponse.statusCode).json(errorResponse);
};
