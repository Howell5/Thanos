/**
 * AI Images Routes
 * Combines generate, inpaint, and history routes
 */

import { Hono } from "hono";
import generateRoute from "./generate";
import historyRoute from "./history";
import inpaintRoute from "./inpaint";

const aiImagesRoute = new Hono()
  .route("/generate", generateRoute)
  .route("/inpaint", inpaintRoute)
  .route("/", historyRoute);

export default aiImagesRoute;
