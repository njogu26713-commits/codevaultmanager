import { Router } from "express";
import authRouter from "./auth";
import workspacesRouter from "./workspaces";
import filesRouter from "./files";
import gitRouter from "./git";
import messagesRouter from "./messages";
import runRouter from "./run";
import previewRouter from "./preview";

const router = Router();

router.use(authRouter);
router.use(workspacesRouter);
router.use(filesRouter);
router.use(gitRouter);
router.use(messagesRouter);
router.use(runRouter);
router.use(previewRouter);

export default router;
