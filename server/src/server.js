import express from "express";
import cors from "cors";
import { OpenAIRequestQueue } from "./openaiQueue.js";
import { SessionStore, sanitizeWorker } from "./sessionStore.js";
import { applyTemplate, buildSystemMessages } from "./promptUtils.js";

const PORT = process.env.PORT || 4000;
const DEFAULT_MODEL = "gpt-4o-mini";
const queue = new OpenAIRequestQueue();
const sessions = new SessionStore();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function getCurrentTask(worker) {
  if (!worker) return null;
  return worker.tasks[worker.currentTaskIndex] ?? null;
}

function markTaskCompleted(worker, task) {
  task.status = "completed";
  task.awaitingUser = false;
  const index = worker.tasks.findIndex((t) => t.id === task.id);
  if (index !== -1 && worker.currentTaskIndex <= index) {
    worker.currentTaskIndex = index + 1;
    const nextTask = worker.tasks[worker.currentTaskIndex];
    if (nextTask && nextTask.status === "pending") {
      nextTask.status = "in-progress";
    }
  }
}

async function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("An OpenAI API key is required.");
  }

  if (process.env.SKIP_OPENAI_VALIDATION === "true") {
    return;
  }

  const response = await globalThis.fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (response.status === 401) {
    throw new Error("The supplied OpenAI API key is invalid.");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to validate API key: ${body}`);
  }
}

function appendUserMessage(worker, content) {
  const message = {
    role: "user",
    content,
    createdAt: new Date().toISOString()
  };
  worker.conversation.push(message);
  const task = getCurrentTask(worker);
  if (task) {
    if (task.status === "pending") {
      task.status = "in-progress";
    }
    if (task.awaitingUser) {
      task.awaitingUser = false;
      if (task.currentPromptIndex >= task.prompts.length) {
        markTaskCompleted(worker, task);
      } else {
        task.status = "in-progress";
      }
    }
  }
  return message;
}

async function runOpenAiStep(worker) {
  const task = getCurrentTask(worker);
  const prompt = task?.prompts?.[task.currentPromptIndex];
  const context = {
    instructions: worker.instructions,
    completed_tasks: worker.tasks
      .filter((t) => t.status === "completed")
      .map((t) => t.title),
    task_outputs: task?.outputs?.map((output) => output.content) ?? [],
    latest_plan: worker.metadata.plan ?? "",
    last_user_message: [...worker.conversation].reverse().find((msg) => msg.role === "user")?.content ?? ""
  };

  const promptInstruction = prompt
    ? applyTemplate(prompt.template, context)
    : "Continue supporting the user based on the established workflow. Reference prior context and provide proactive suggestions.";

  const systemMessages = buildSystemMessages(worker, task, promptInstruction);
  const messages = [...systemMessages, ...worker.conversation];

  const payload = {
    model: worker.model || DEFAULT_MODEL,
    messages,
    temperature: 0.7
  };

  const { content, raw } = await queue.enqueue({ apiKey: worker.apiKey, payload });
  const assistantMessage = {
    role: "assistant",
    content,
    createdAt: new Date().toISOString()
  };
  worker.conversation.push(assistantMessage);

  if (task && prompt) {
    task.outputs.push({
      promptId: prompt.id,
      content,
      raw,
      createdAt: assistantMessage.createdAt
    });
    task.currentPromptIndex += 1;
    if (task.currentPromptIndex >= task.prompts.length) {
      if (task.requiresUserInput) {
        task.awaitingUser = true;
        task.status = "awaiting_user";
      } else {
        markTaskCompleted(worker, task);
      }
    } else {
      task.status = "in-progress";
    }

    if (task.id === "task-2") {
      worker.metadata.plan = content;
    }
  }

  return assistantMessage;
}

app.post("/api/session/start", async (req, res) => {
  try {
    const { apiKey, instructions } = req.body ?? {};
    await validateApiKey(apiKey);
    const worker = sessions.createSession(apiKey, instructions);
    worker.model = DEFAULT_MODEL;
    const firstTask = getCurrentTask(worker);
    if (firstTask) {
      firstTask.status = "in-progress";
    }
    const initialResponse = await runOpenAiStep(worker);
    return res.json({
      workerId: worker.id,
      message: initialResponse,
      state: sanitizeWorker(worker)
    });
  } catch (error) {
    console.error("Failed to start session", error);
    return res.status(400).json({ message: error.message || "Unable to start session." });
  }
});

app.post("/api/session/:workerId/message", async (req, res) => {
  try {
    const { workerId } = req.params;
    const worker = sessions.getSession(workerId);
    if (!worker) {
      return res.status(404).json({ message: "Worker not found." });
    }
    const { message } = req.body ?? {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "A user message is required." });
    }
    appendUserMessage(worker, message);
    const response = await runOpenAiStep(worker);
    return res.json({ response, state: sanitizeWorker(worker) });
  } catch (error) {
    console.error("Failed to process message", error);
    return res.status(500).json({ message: error.message || "Unable to process message." });
  }
});

app.get("/api/session/:workerId/state", (req, res) => {
  const worker = sessions.getSession(req.params.workerId);
  if (!worker) {
    return res.status(404).json({ message: "Worker not found." });
  }
  return res.json({ state: sanitizeWorker(worker) });
});

app.post("/api/session/:workerId/reset", async (req, res) => {
  const worker = sessions.resetSession(req.params.workerId);
  if (!worker) {
    return res.status(404).json({ message: "Worker not found." });
  }
  const firstTask = getCurrentTask(worker);
  if (firstTask) {
    firstTask.status = "in-progress";
  }
  try {
    const initialResponse = await runOpenAiStep(worker);
    return res.json({ message: initialResponse, state: sanitizeWorker(worker) });
  } catch (error) {
    console.error("Failed to reset worker", error);
    return res.status(500).json({ message: error.message || "Unable to reset worker." });
  }
});

app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Agentic workflow server listening on port ${PORT}`);
});
