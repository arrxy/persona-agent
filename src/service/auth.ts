import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";
import { User, type IUserDocument } from "../models/User.js";
import { AppError } from "../utils/errors.js";

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const REFRESH_TOKEN_PREFIX = "refresh_token:";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  authProvider: "local" | "google";
  avatarUrl?: string;
  createdAt: Date;
}

function toPublicUser(user: IUserDocument): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    authProvider: user.authProvider,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "access" }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign(
    { sub: userId, type: "refresh", jti: tokenId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY as jwt.SignOptions["expiresIn"] },
  );
}

async function storeRefreshToken(
  userId: string,
  tokenId: string,
  refreshToken: string,
): Promise<void> {
  const ttlSeconds = 7 * 24 * 60 * 60;
  await redis.set(
    `${REFRESH_TOKEN_PREFIX}${userId}:${tokenId}`,
    refreshToken,
    "EX",
    ttlSeconds,
  );
}

async function issueTokens(user: IUserDocument): Promise<AuthTokens> {
  const tokenId = randomUUID();
  const accessToken = signAccessToken(user.id);
  const refreshToken = signRefreshToken(user.id, tokenId);
  await storeRefreshToken(user.id, tokenId, refreshToken);

  return { accessToken, refreshToken };
}

export class AuthService {
  static async register(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const email = input.email.trim().toLowerCase();

    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError(409, "An account with this email already exists");
    }

    const user = await User.create({
      email,
      password: input.password,
      name: input.name.trim(),
      authProvider: "local",
    });

    const tokens = await issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  static async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const email = input.email.trim().toLowerCase();

    const user = await User.findOne({ email }).select("+password");
    if (!user || !user.password) {
      throw new AppError(401, "Invalid email or password");
    }

    const valid = await user.comparePassword(input.password);
    if (!valid) {
      throw new AppError(401, "Invalid email or password");
    }

    const tokens = await issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  static async loginWithGoogle(idToken: string): Promise<{
    user: PublicUser;
    tokens: AuthTokens;
  }> {
    let payload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, "Invalid Google token");
    }

    if (!payload?.email || !payload.sub) {
      throw new AppError(401, "Google account is missing required profile data");
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({
      $or: [{ googleId: payload.sub }, { email }],
    });

    if (user) {
      if (!user.googleId) {
        user.googleId = payload.sub;
        user.authProvider = "google";
        if (payload.picture && !user.avatarUrl) {
          user.avatarUrl = payload.picture;
        }
        await user.save();
      }
    } else {
      user = await User.create({
        email,
        name: payload.name ?? email.split("@")[0],
        googleId: payload.sub,
        authProvider: "google",
        avatarUrl: payload.picture,
      });
    }

    const tokens = await issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  static async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: jwt.JwtPayload;

    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
    } catch {
      throw new AppError(401, "Invalid or expired refresh token");
    }

    if (payload.type !== "refresh" || !payload.sub || !payload.jti) {
      throw new AppError(401, "Invalid refresh token");
    }

    const stored = await redis.get(
      `${REFRESH_TOKEN_PREFIX}${payload.sub}:${payload.jti}`,
    );

    if (!stored || stored !== refreshToken) {
      throw new AppError(401, "Refresh token has been revoked");
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new AppError(401, "User not found");
    }

    await redis.del(`${REFRESH_TOKEN_PREFIX}${payload.sub}:${payload.jti}`);

    return issueTokens(user);
  }

  static async logout(refreshToken: string): Promise<void> {
    try {
      const payload = jwt.verify(
        refreshToken,
        env.JWT_REFRESH_SECRET,
      ) as jwt.JwtPayload;

      if (payload.sub && payload.jti) {
        await redis.del(`${REFRESH_TOKEN_PREFIX}${payload.sub}:${payload.jti}`);
      }
    } catch {
      // Ignore invalid tokens on logout
    }
  }

  static async getUserById(userId: string): Promise<PublicUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return toPublicUser(user);
  }
}
