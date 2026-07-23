import * as ImagePicker from "expo-image-picker";
import { capturePhoto } from "./capturePhoto";

// Front-camera selfie, captured when the driver clocks in.
export function captureSelfie(): Promise<string | null> {
  return capturePhoto(ImagePicker.CameraType.front);
}
