-- 0003 · Assistant conversation history.
-- tools_used is a comma-separated list of the backend data functions an
-- answer was based on, so the UI can show where its figures came from.

CREATE TABLE ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_user_idx ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE ai_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  source          text NOT NULL CHECK (source IN ('user', 'ai', 'data_lookup')),
  tools_used      text NOT NULL DEFAULT '',
  model           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);
