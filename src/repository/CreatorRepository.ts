import { type Types } from "mongoose";
import {
  Creator,
  type ICreatorDocument,
} from "../models/Creator.js";

export class CreatorRepository {
  async findById(
    creatorId: Types.ObjectId | string,
  ): Promise<ICreatorDocument | null> {
    return Creator.findById(creatorId);
  }

  async save(creator: ICreatorDocument): Promise<ICreatorDocument> {
    return creator.save();
  }
}

export const creatorRepository = new CreatorRepository();
