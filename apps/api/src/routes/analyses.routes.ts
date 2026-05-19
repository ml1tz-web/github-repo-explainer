import { Router } from 'express';
import { createAnalysis, getAnalysis } from '../controllers/analyses.controller.js';
import { analysisCreateLimiter } from '../middleware/rate-limit.js';

export const analysesRouter = Router();

analysesRouter.post('/', analysisCreateLimiter, createAnalysis);
analysesRouter.get('/:id', getAnalysis);
