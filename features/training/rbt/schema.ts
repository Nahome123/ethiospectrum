import { z } from "zod";
import { rbtSectionIds } from "./types";

export const rbtSectionSchema = z.enum(rbtSectionIds);
