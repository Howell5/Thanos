/**
 * Videos Routes
 * Combines create, list, status, analyze, and search routes
 */

import { Hono } from "hono";
import analyzeRoute from "./analyze";
import createRoute from "./create";
import listRoute from "./list";
import searchRoute from "./search";
import statusRoute from "./status";

const videosRoute = new Hono()
  .route("/", createRoute) // POST /api/videos
  .route("/", listRoute) // GET /api/videos
  .route("/", statusRoute) // GET /api/videos/:id/status
  .route("/", analyzeRoute) // POST /api/videos/:id/analyze
  .route("/", searchRoute); // POST /api/videos/search

export default videosRoute;
