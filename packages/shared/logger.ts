import pino from "pino";
export const logger = pino({
  name: "causalscope",
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "password",
      "authorization",
      "cookie",
      "apiKey",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});
