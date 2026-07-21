// requireAuth pins the authenticated user id here; controllers read it to scope
// queries. Optional because it's a global augmentation, set only on protected routes.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
