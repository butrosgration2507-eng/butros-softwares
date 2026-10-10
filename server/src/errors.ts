export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found.`);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
