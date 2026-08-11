import { Router } from 'express';
import { z } from 'zod';
import {
  buildAssignments,
  buildChecklist,
  createTask,
  deleteTask,
  getTask,
  getTaskDetails,
  listMyTasks,
  updateTask,
  updateTaskDetails,
} from '../graph/planner.js';
import { asyncRoute } from '../lib/errors.js';

const createTaskSchema = z.object({
  planId: z.string().min(1),
  title: z.string().min(1),
  bucketId: z.string().optional(),
  assignedTo: z.array(z.string()).optional(),
  startDateTime: z.string().optional(),
  dueDateTime: z.string().optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  orderHint: z.string().optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    bucketId: z.string().optional(),
    assignedTo: z.array(z.string()).optional(),
    startDateTime: z.string().nullable().optional(),
    dueDateTime: z.string().nullable().optional(),
    percentComplete: z.number().int().min(0).max(100).optional(),
    priority: z.number().int().min(0).max(10).optional(),
    orderHint: z.string().optional(),
    etag: z.string().optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'etag'), {
    message: 'Provide at least one field to update.',
  });

const updateDetailsSchema = z
  .object({
    description: z.string().optional(),
    checklist: z
      .array(z.object({ id: z.string().optional(), title: z.string().min(1), isChecked: z.boolean().optional() }))
      .optional(),
    etag: z.string().optional(),
  })
  .refine((body) => body.description !== undefined || body.checklist !== undefined, {
    message: 'Provide description and/or checklist.',
  });

/** Translates this API's friendly fields into the shape Planner expects. */
function toPlannerTask({ assignedTo, ...rest }) {
  return { ...rest, ...(assignedTo ? { assignments: buildAssignments(assignedTo) } : {}) };
}

export function tasksRouter() {
  const router = Router();

  router.get(
    '/',
    asyncRoute(async (req, res) => {
      res.json({ value: await listMyTasks() });
    })
  );

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const body = createTaskSchema.parse(req.body);
      res.status(201).json(await createTask(toPlannerTask(body)));
    })
  );

  router.get(
    '/:taskId',
    asyncRoute(async (req, res) => {
      res.json(await getTask(req.params.taskId));
    })
  );

  router.get(
    '/:taskId/details',
    asyncRoute(async (req, res) => {
      res.json(await getTaskDetails(req.params.taskId));
    })
  );

  router.patch(
    '/:taskId',
    asyncRoute(async (req, res) => {
      const { etag, ...body } = updateTaskSchema.parse(req.body);
      res.json(await updateTask(req.params.taskId, toPlannerTask(body), { etag }));
    })
  );

  router.patch(
    '/:taskId/details',
    asyncRoute(async (req, res) => {
      const { etag, description, checklist } = updateDetailsSchema.parse(req.body);
      const patch = {
        ...(description !== undefined ? { description } : {}),
        ...(checklist !== undefined ? { checklist: buildChecklist(checklist) } : {}),
      };
      res.json(await updateTaskDetails(req.params.taskId, patch, { etag }));
    })
  );

  router.delete(
    '/:taskId',
    asyncRoute(async (req, res) => {
      await deleteTask(req.params.taskId, { etag: req.get('If-Match') });
      res.status(204).end();
    })
  );

  return router;
}
