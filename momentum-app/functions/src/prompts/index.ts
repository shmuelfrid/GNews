import type { Kind } from "../types";
import type { KindSpec } from "./common";
import { foodPhoto, foodText } from "./food";
import { healthScreenshot } from "./health";
import { workoutPhoto } from "./workout";

export const SPECS: Record<Kind, KindSpec> = {
  food_photo: foodPhoto,
  food_text: foodText,
  workout_photo: workoutPhoto,
  health_screenshot: healthScreenshot,
};
export type { KindSpec };
