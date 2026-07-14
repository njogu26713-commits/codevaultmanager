import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import reposRouter from "./repos";
import workspacesRouter from "./workspaces";
import filesRouter from "./files";
import gitRouter from "./git";
import messagesRouter from "./messages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(reposRouter);
router.use(workspacesRouter);
router.use(filesRouter);
router.use(gitRouter);
router.use(messagesRouter);

export default router;
