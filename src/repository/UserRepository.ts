import { User, type IUserDocument } from "../models/User.js";
import { AuthProvider } from "../enums.js";

export interface CreateUserInput {
  email: string;
  password?: string;
  name: string;
  googleId?: string;
  authProvider: AuthProvider;
  avatarUrl?: string;
}

export class UserRepository {
  async findByEmail(email: string): Promise<IUserDocument | null> {
    return User.findOne({ email });
  }

  async findByEmailWithPassword(
    email: string,
  ): Promise<IUserDocument | null> {
    return User.findOne({ email }).select("+password");
  }

  async findByGoogleIdOrEmail(
    googleId: string,
    email: string,
  ): Promise<IUserDocument | null> {
    return User.findOne({
      $or: [{ googleId }, { email }],
    });
  }

  async findById(userId: string): Promise<IUserDocument | null> {
    return User.findById(userId);
  }

  async create(input: CreateUserInput): Promise<IUserDocument> {
    return User.create(input);
  }

  async save(user: IUserDocument): Promise<IUserDocument> {
    return user.save();
  }
}

export const userRepository = new UserRepository();
