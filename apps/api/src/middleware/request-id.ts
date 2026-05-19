import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const HEADER = 'x-request-id';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

// Accept an inbound x-request-id (useful when behind a gateway that already
// generates one) or mint a new UUID. Always echo it back on the response so
// clients can correlate.
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header(HEADER);
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.id = id;
  res.setHeader(HEADER, id);
  next();
};
