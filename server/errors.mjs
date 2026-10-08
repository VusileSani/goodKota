export class AppError extends Error {
  constructor(message,{status=400,code="BAD_REQUEST"}={}) { super(message); this.name="AppError"; this.status=status; this.code=code; }
}
export const httpError = error => {
  if (error instanceof AppError) return {status:error.status,code:error.code,message:error.message};
  const message = error?.message || "Request could not be completed.";
  if (/^(You have too many|Too many orders|This spot is very busy)/.test(message)) return {status:429,code:"ORDER_LIMIT",message};
  return {status:400,code:"BAD_REQUEST",message};
};
