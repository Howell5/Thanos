/**
 * Editing Plans Routes
 * Combines list, get, confirm, and render routes
 */

import { Hono } from "hono";
import actionsRoute from "./actions";
import listRoute from "./list";

const editingPlansRoute = new Hono()
  .route("/", actionsRoute) // POST /editing-plans/confirm, /editing-plans/render
  .route("/", listRoute); // GET /editing-plans, /editing-plans/:id, /editing-plans/:id/status

export default editingPlansRoute;
