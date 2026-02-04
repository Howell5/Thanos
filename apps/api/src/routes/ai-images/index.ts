/**
 * AI Images Routes
 * Combines generate, inpaint, upload, and history routes
 */

import { Hono } from "hono";
import generateRoute from "./generate";
import historyRoute from "./history";
import inpaintRoute from "./inpaint";
import uploadRoute from "./upload";

const aiImagesRoute = new Hono()
  .route("/generate", generateRoute)
  .route("/inpaint", inpaintRoute)
  .route("/upload", uploadRoute)
  .route("/", historyRoute);

export default aiImagesRoute;
