# Agentic Workflow Studio

Agentic Workflow Studio is a full-stack MVP for building and steering dynamic, multi-step AI workflows. Users can securely
connect their own OpenAI API key, spin up autonomous "workers" composed of ordered tasks, and collaborate with those workers
through a conversational interface that keeps track of workflow context.

The platform is intentionally modular and extensible so it can evolve into a more sophisticated agentic operating system.
For the MVP we ship a focused experience that demonstrates task orchestration, prompt templating, back-and-forth chat, and
OpenAI request queueing.

## Features

- **Secure bring-your-own-key onboarding** – API keys never leave the active server session and are not persisted.
- **Worker & task orchestration** – Each worker tracks task state, prompt progress, outputs, and conversation history.
- **Conversational control** – Users can guide, correct, or reset workers at any point via chat.
- **Prompt templating** – Prompts are generated from reusable templates that incorporate previous task outputs and user input.
- **OpenAI request queue** – A FIFO queue coordinates outbound API calls to respect rate limits.
- **React single-page app** – A modern interface surfaces chat, workflow progress, and controls in real time.

## Project structure

```
.
├── client/        # React front-end (Vite)
├── server/        # Express API and workflow engine
├── tests/         # Existing python tests retained from original repository
└── ...            # Legacy files that remain untouched
```

The historical Python package has been left intact for reference; the new MVP lives inside the `client` and `server`
directories.

## Getting started

Requirements:

- Node.js 18+
- npm (ships with Node)

1. Install dependencies for the API server and the React client:

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. Launch the API server (defaults to port `4000`):

   ```bash
   cd server
   npm start
   ```

3. Launch the React development server (defaults to port `5173`):

   ```bash
   cd client
   npm run dev
   ```

4. Open <http://localhost:5173> and provide an OpenAI API key to begin.

### Environment variables

| Variable                  | Description                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                    | Port for the Express server (defaults to `4000`).                                     |
| `SKIP_OPENAI_VALIDATION`  | Set to `true` to bypass API key validation when running in offline/test environments. |

## API reference

All endpoints are prefixed with `/api`.

### `POST /api/session/start`

Start a new worker.

**Body**

```json
{
  "apiKey": "sk-...",
  "instructions": "Optional workflow description"
}
```

**Response**

```json
{
  "workerId": "uuid",
  "message": { "role": "assistant", "content": "..." },
  "state": {
    "id": "uuid",
    "tasks": [
      { "id": "task-1", "status": "awaiting_user", "outputs": [ /* ... */ ] }
    ],
    "conversation": [
      { "role": "assistant", "content": "..." }
    ]
  }
}
```

### `POST /api/session/{workerId}/message`

Send a user message to the active worker. Returns the assistant response and updated state.

### `GET /api/session/{workerId}/state`

Fetch the latest worker state (tasks, conversation, metadata).

### `POST /api/session/{workerId}/reset`

Reset the worker to its initial state and rerun the opening prompt.

## Front-end overview

The React application provides:

- API key onboarding screen with optional workflow brief.
- Real-time chat pane with loading indicators and timestamps.
- Workflow side panel showing task status, descriptions, and outputs.
- Controls for resetting the workflow and continuing conversation.

All network calls are handled via Axios. Responses from the server include the full conversation history, so the client can
stay in sync without manual reconciliation.

## Future enhancements

- Streaming assistant responses via Server-Sent Events or WebSockets.
- Persistent session storage (Redis/Postgres) with multi-user support.
- Visual prompt editor and task builder UI.
- Analytics around task completion, model usage, and agent performance.
- Fine-grained task branching and parallel execution.

## License

This project continues to use the MIT License inherited from the original repository.
