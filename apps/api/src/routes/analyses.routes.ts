import { Router } from 'express';
import {
  createAnalysis,
  getAnalysis,
  getRecentAnalyses,
} from '../controllers/analyses.controller.js';
import { analysisCreateLimiter } from '../middleware/rate-limit.js';

export const analysesRouter = Router();

// Order matters: /recent must register before /:id or it'd be captured.
analysesRouter.get('/recent', getRecentAnalyses);
analysesRouter.post('/', analysisCreateLimiter, createAnalysis);
analysesRouter.get('/:id', getAnalysis);
