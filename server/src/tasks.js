export function buildDefaultTasks() {
  const tasks = [
    {
      id: "task-1",
      title: "Clarify objectives",
      description:
        "Review the user's instructions and conversation so far. Summarize the objective and surface any missing information that would improve the workflow.",
      status: "pending",
      requiresUserInput: true,
      awaitingUser: false,
      currentPromptIndex: 0,
      outputs: [],
      prompts: [
        {
          id: "prompt-1",
          template:
            "You are preparing a multi-step workflow. Summarize the overarching goal using the latest context and list any clarifying questions that would ensure success. Base your understanding on: {{instructions}}."
        }
      ]
    },
    {
      id: "task-2",
      title: "Design plan",
      description:
        "Use everything learned so far to design a concise, numbered action plan that the agent can execute. Highlight where user feedback is most valuable.",
      status: "pending",
      requiresUserInput: false,
      awaitingUser: false,
      currentPromptIndex: 0,
      outputs: [],
      prompts: [
        {
          id: "prompt-1",
          template:
            "Draft a 3-5 step plan for accomplishing the goal. Incorporate any confirmed clarifications. Output a JSON block summarizing the plan after the explanation so the system can reuse it."
        }
      ]
    },
    {
      id: "task-3",
      title: "Execute next step",
      description:
        "Begin executing the plan by completing the highest priority step. Provide a progress update and specify what you will tackle next.",
      status: "pending",
      requiresUserInput: true,
      awaitingUser: false,
      currentPromptIndex: 0,
      outputs: [],
      prompts: [
        {
          id: "prompt-1",
          template:
            "Carry out the next action from the agreed plan. Explain what you did, list any artefacts or decisions, and state what additional input you need from the user, if any."
        }
      ]
    }
  ];

  const tasksWithNormalizedPrompts = tasks.map((task) => ({
    ...task,
    prompts: task.prompts.map((prompt, index) => ({
      ...prompt,
      id: prompt.id || `${task.id}-prompt-${index + 1}`
    }))
  }));
  return tasksWithNormalizedPrompts;
}
