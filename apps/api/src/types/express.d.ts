// Type augmentations for Express requests.
//
//   - `id`     : assigned by middleware/request-id.ts on every request.
//   - `signal` : exists at runtime in Express 5 (Node 22+) but isn't yet in
//                @types/express 5.0.6. Declare it here until upstream catches up.

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    signal: AbortSignal;
  }
}

export {};
