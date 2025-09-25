import { v4 as uuid } from "uuid";
import { buildDefaultTasks } from "./tasks.js";

function sanitizeInstructions(raw) {
  if (!raw || typeof raw !== "string") {
    return "Guide the user through a flexible, multi-step workflow.";
  }
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : "Guide the user through a flexible, multi-step workflow.";
}

function cloneTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    status: "pending",
    awaitingUser: false,
    currentPromptIndex: 0,
    outputs: []
  }));
}

export class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession(apiKey, instructions) {
    const workerId = uuid();
    const normalizedInstructions = sanitizeInstructions(instructions);
    const tasks = cloneTasks(buildDefaultTasks());
    const worker = {
      id: workerId,
      apiKey,
      instructions: normalizedInstructions,
      model: "gpt-4o-mini",
      createdAt: new Date().toISOString(),
      tasks,
      currentTaskIndex: 0,
      conversation: [],
      metadata: {}
    };
    this.sessions.set(workerId, worker);
    return worker;
  }

  getSession(workerId) {
    return this.sessions.get(workerId);
  }

  resetSession(workerId) {
    const existing = this.sessions.get(workerId);
    if (!existing) {
      return null;
    }
    const tasks = cloneTasks(buildDefaultTasks());
    existing.tasks = tasks;
    existing.currentTaskIndex = 0;
    existing.conversation = [];
    existing.metadata = {};
    return existing;
  }

  deleteSession(workerId) {
    this.sessions.delete(workerId);
  }
}

export function sanitizeWorker(worker) {
  if (!worker) {
    return null;
  }
  const { apiKey, ...rest } = worker;
  return {
    ...rest,
    tasks: worker.tasks.map((task) => ({
      ...task,
      outputs: task.outputs.map((output) => ({
        promptId: output.promptId,
        content: output.content,
        createdAt: output.createdAt
      }))
    }))
  };
}
