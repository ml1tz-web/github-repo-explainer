import { Router } from 'express';
import { getTrendingRepos } from '../controllers/github.controller.js';

export const githubRouter = Router();

githubRouter.get('/trending', getTrendingRepos);
