import { randomUUID } from "node:crypto";
export const requestIdFor = request => {
  const supplied = String(request.headers["x-request-id"] || "").trim();
  return /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : randomUUID();
};
export const logRequestError = ({requestId,path,error}) => {
  console.error(JSON.stringify({level:"error",event:"http_request_failed",requestId,path,message:error?.message || "Unknown error",at:new Date().toISOString()}));
};
