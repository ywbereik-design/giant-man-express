import { fetch } from "expo/fetch";
import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiBaseUrl } from "../api/client";

// Downloads a PDF from an authenticated backend route and opens the native
// share sheet so the admin can save it or send it straight to the accountant
// / a client by email, text, AirDrop, etc.
export async function downloadAndSharePdf(path: string, token: string, filename: string) {
  const url = `${apiBaseUrl()}${path}`;
  const destination = new Directory(Paths.cache, "giant-man-documents");
  destination.create({ intermediates: true, idempotent: true });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);

  const file = new File(destination, filename);
  if (file.exists) file.delete();
  file.write(await response.bytes());

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: filename });
  }
  return file.uri;
}
