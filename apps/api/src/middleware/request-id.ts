import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// Request augmentation (req.id, req.signal) lives in ../types/express.d.ts.

const HEADER = 'x-request-id';

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
