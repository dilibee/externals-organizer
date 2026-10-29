// Document shapes. These match the claude.ai artifact's collections so its export imports 1:1.

export type Kind = "lesson" | "mock" | "assessment" | "review" | "project";

export interface Milestone { date: string; label: string }

export interface Track {
  name: string;
  short?: string;
  goal?: string;
  deadline?: string | null;
  hue?: number;
  rank?: number;
  level?: string;
  learner?: string;
  milestones?: Milestone[];
  createdAt?: string;
  paused?: boolean;
}

export interface Task { id: string; text: string; min: number; url?: string }
export interface Resource { label: string; url: string }

export interface Day {
  trackId: string;
  dayNum: number;
  date: string;
  title: string;
  kind: Kind;
  focus?: string;
  lesson?: string;
  lessonFull?: string;
  tasks: Task[];
  resources?: Resource[];
}

export interface Progress {
  dayId: string;
  trackId: string;
  done: Record<string, string>;              // taskId -> ISO date it was checked
  actual?: Record<string, number>;           // taskId -> real minutes from the timer
  timer?: { taskId: string; startedAt: string } | null;
  updatedAt?: string;
}

export interface SourceFile { name: string; content: string }
export interface Sources { files: SourceFile[]; updatedAt?: string }

export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface Chat { dayId: string; turns: ChatTurn[]; updatedAt?: string }

export interface Settings {
  hours: Record<string, number>;             // weekday (0 = Sun) -> minutes
  overrides?: Record<string, number>;        // YYYY-MM-DD -> minutes, wins over hours
}

export type Rating = "easy" | "right" | "hard";
export interface Feedback {
  dayId: string;
  trackId: string;
  rating: Rating;
  actualMin: number;
  needsWork: string[];
  comment: string;
  at: string;
}

export interface Extra {
  text: string;
  trackId?: string;
  min: number;
  source: "manual" | "needsWork" | "carry";
  fromDayId?: string;
  fromTaskId?: string;
  planFor?: string;                          // date it's slotted into, for carries
  createdAt: string;
  doneAt?: string | null;
}

export interface Request {
  type: "interview" | "adapt" | "newTrack";
  payload: Record<string, unknown>;
  status: "pending" | "done";
  createdAt: string;
  result?: string;
}

export interface Suggestion {
  trackId?: string;
  text: string;
  why?: string;
  min?: number;
  status: "new" | "accepted" | "dismissed";
  createdAt?: string;
}

export interface Collections {
  tracks: Track;
  days: Day;
  progress: Progress;
  sources: Sources;
  chats: Chat;
  settings: Settings;
  feedback: Feedback;
  extras: Extra;
  requests: Request;
  suggestions: Suggestion;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ["tracks", "days", "progress", "sources", "chats", "settings", "feedback", "extras", "requests", "suggestions"];

export type Store = { [K in CollectionName]: Record<string, Collections[K]> };
export type WithId<T> = T & { id: string };
