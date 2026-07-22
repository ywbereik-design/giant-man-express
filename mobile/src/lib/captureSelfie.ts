import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Takes a front-camera selfie and compresses it down to something small
// enough to send over mobile data and store inline — resized to a modest
// width and re-encoded as a JPEG at moderate quality. Returns null if the
// user backs out of the camera (not an error, just no photo taken).
export async function captureSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Camera permission is required");
  }

  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const context = ImageManipulator.manipulate(result.assets[0].uri);
  context.resize({ width: 800 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!saved.base64) return null;

  return `data:image/jpeg;base64,${saved.base64}`;
}
