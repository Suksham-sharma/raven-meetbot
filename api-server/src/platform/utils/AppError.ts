class AppError extends Error {
  statusCode: number;
  reason?: string;

  constructor(message: string, statusCode: number = 500, reason?: string) {
    super(message);
    this.statusCode = statusCode;
    this.reason = reason;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message: string = "Bad Request") {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized Request") {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden Request", reason?: string) {
    super(message, 403, reason);
  }
}

class NotFoundError extends AppError {
  constructor(message: string = "Resource Not Found") {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message: string = "Conflict") {
    super(message, 409);
  }
}

export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
