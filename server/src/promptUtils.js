export function applyTemplate(template, context) {
  if (!template) {
    return "";
  }
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    const value = context?.[key];
    if (value === undefined || value === null) {
      return "";
    }
    if (Array.isArray(value)) {
      return value.join("\n");
    }
    return String(value);
  });
}

export function buildSystemMessages(worker, task, promptInstruction) {
  const completedSummaries = worker.tasks
    .filter((t) => t.status === "completed")
    .map((t) => `Task ${t.title}: ${t.outputs.map((o) => o.content).join("\n")}`)
    .filter(Boolean);

  const messages = [
    {
      role: "system",
      content:
        "You are an autonomous agent orchestrator. Work step-by-step, stay organized, and keep track of workflow progress while collaborating with the user."
    },
    {
      role: "system",
      content: `Overall objective: ${worker.instructions}`
    }
  ];

  if (completedSummaries.length) {
    messages.push({
      role: "system",
      content: `Completed tasks so far:\n${completedSummaries.join("\n---\n")}`
    });
  }

  if (task) {
    messages.push({
      role: "system",
      content: `Active task (${task.title}): ${task.description}`
    });
  } else {
    messages.push({
      role: "system",
      content:
        "All defined tasks are complete. Continue helping the user based on the established plan and be proactive in suggesting next steps if helpful."
    });
  }

  if (promptInstruction) {
    messages.push({ role: "system", content: promptInstruction });
  }

  return messages;
}
