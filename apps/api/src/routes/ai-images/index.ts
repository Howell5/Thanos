/**
 * AI Images Routes
 * Combines generate, inpaint, upload, presign, and history routes
 */

import { Hono } from "hono";
import generateRoute from "./generate";
import historyRoute from "./history";
import inpaintRoute from "./inpaint";
import presignRoute from "./presign";
import uploadRoute from "./upload";

const aiImagesRoute = new Hono()
  .route("/generate", generateRoute)
  .route("/inpaint", inpaintRoute)
  .route("/upload", uploadRoute)
  .route("/presign", presignRoute)
  .route("/", historyRoute);

export default aiImagesRoute;
