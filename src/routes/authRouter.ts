// /api/v1/auth
import { Router } from "express";
import { AuthService } from "../service/auth.js";
import {
  asyncHandler,
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";

const router = Router();

function validateEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) {
    throw new AppError(400, "A valid email is required");
  }
  return email;
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new AppError(400, "Password must be at least 8 characters");
  }
  return password;
}

function validateName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) {
    throw new AppError(400, "Name is required");
  }
  return name;
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const name = validateName(req.body.name);

    const result = await AuthService.register({ email, password, name });
    res.status(201).json(result);
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);

    const result = await AuthService.login({ email, password });
    res.status(200).json(result);
  }),
);

router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const { idToken } = req.body;

    if (typeof idToken !== "string" || !idToken) {
      throw new AppError(400, "Google idToken is required");
    }

    const result = await AuthService.loginWithGoogle(idToken);
    res.status(200).json(result);
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (typeof refreshToken !== "string" || !refreshToken) {
      throw new AppError(400, "Refresh token is required");
    }

    const tokens = await AuthService.refresh(refreshToken);
    res.status(200).json({ tokens });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (typeof refreshToken === "string" && refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.status(200).json({ message: "Logged out successfully" });
  }),
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await AuthService.getUserById(
      (req as AuthenticatedRequest).userId!,
    );
    res.status(200).json({ user });
  }),
);

export default router;
