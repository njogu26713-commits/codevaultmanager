import mongoose, { Schema, type Document } from "mongoose";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", UserSchema);

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------
export interface IWorkspace extends Document {
  _id: string;
  userId: string;
  name: string;
  type: "blank" | "template";
  template: string | null;
  status: "creating" | "ready" | "error";
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date | null;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    _id: { type: String },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ["blank", "template"], required: true },
    template: { type: String, default: null },
    status: { type: String, enum: ["creating", "ready", "error"], default: "creating" },
    lastAccessedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

export const Workspace = mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------
export interface IMessage extends Document {
  _id: string;
  workspaceId: string;
  role: "user" | "assistant";
  content: string;
  fileChanges: unknown;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    _id: { type: String },
    workspaceId: { type: String, required: true, index: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    fileChanges: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

export const Message = mongoose.model<IMessage>("Message", MessageSchema);

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is required");
  }
  await mongoose.connect(uri);
  logger.info("Connected to MongoDB");

  // Drop any stale indexes that conflict with the current schema.
  // This handles cases where the collection was created by a different schema version.
  try {
    const userCollection = mongoose.connection.db?.collection("users");
    if (userCollection) {
      const indexes = await userCollection.indexes();
      const stale = indexes.filter(
        (idx) => idx.name && idx.name !== "_id_" && idx.name !== "email_1",
      );
      for (const idx of stale) {
        await userCollection.dropIndex(idx.name as string);
        logger.info({ index: idx.name }, "Dropped stale index from users collection");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Could not clean up stale indexes (non-fatal)");
  }
}
